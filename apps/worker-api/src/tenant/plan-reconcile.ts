/**
 * Ola 4 — reconciliación atómica de plan ↔ tenant_capabilities.
 * Fuente: domain-billing PLAN_CAPABILITIES + migration 0064.
 *
 * Regla de reconciliación (documentada):
 * - Upgrade/downgrade añade defaults del nuevo plan con INSERT OR IGNORE
 *   (config_json='{"source":"plan_default"}', enabled=1). No borra overrides
 *   platform_override (config_json distinto) nunca.
 * - Downgrade borra solo plan_default que ya no pertenece al nuevo plan:
 *   DELETE WHERE tenant_id=? AND config_json='{"source":"plan_default"}'
 *   AND capability NOT IN (<newPlanCaps>). Así platform_override se preserva.
 * - Idempotente: mismo planId no genera audit duplicado (early return).
 * - Atómico: un solo db.batch con tenants UPDATE + caps INSERT/DELETE +
 *   audit_events PLAN_UPGRADE + tenant_data_epochs epoch+1 + claim CAS
 *   (audit_chain_heads). Sin db.transaction, sin UPSERT INTO.
 *
 * Tenant isolation: toda sentencia filtra por tenant_id.
 */

import { provisionCapabilitiesForPlan } from '@kipuspay/domain-billing';
import { auditChainClaimStatements, readAuditChainHead } from '@kipuspay/adapters-d1';

const PLAN_DEFAULT_JSON = '{"source":"plan_default"}';

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PlanReconcileEnv {
  readonly DB?: D1Database;
  readonly TENANT_KV?: {
    get(key: string): Promise<string | null>;
    put?(key: string, value: string): Promise<void>;
  };
}

export interface ReconcileResult {
  status: 'updated' | 'noop' | 'not_found' | 'error';
  planId: string;
  auditId?: string;
}

/**
 * Ejecuta la reconciliación atómica si el plan cambia.
 * Retorna noop si ya está en planId (no inserta audit).
 * El llamador decide el actor y source para payload.
 */
// eslint-disable-next-line complexity
export async function reconcilePlanAtomic(
  env: PlanReconcileEnv,
  tenantId: string,
  newPlanId: string,
  opts: { actorUserId: string; source: 'api' | 'stripe_webhook'; prevPlanId?: string | null },
): Promise<ReconcileResult> {
  const db = env.DB as unknown as D1Database & {
    batch(statements: unknown[]): Promise<unknown>;
    prepare(sql: string): {
      bind(...a: unknown[]): {
        run(): Promise<unknown>;
        first<T>(): Promise<T | null>;
        all<T>(): Promise<{ results: T[] }>;
      };
    };
  };
  if (!db) return { status: 'error', planId: newPlanId };

  // SoT: domain-billing
  let newCaps: readonly string[];
  try {
    newCaps = provisionCapabilitiesForPlan(newPlanId);
  } catch {
    return { status: 'error', planId: newPlanId };
  }

  // Preflight: plan actual
  let prevPlanId: string | null = opts.prevPlanId ?? null;
  if (prevPlanId === null) {
    try {
      const row = await db
        .prepare('SELECT plan_id FROM tenants WHERE id = ? AND deleted_at IS NULL')
        .bind(tenantId)
        .first<{ plan_id: string | null }>();
      if (!row) return { status: 'not_found', planId: newPlanId };
      prevPlanId = row.plan_id ?? 'arranque';
    } catch {
      return { status: 'error', planId: newPlanId };
    }
  } else if (prevPlanId === undefined) {
    prevPlanId = null;
  }

  if (prevPlanId === newPlanId) {
    // Idempotente: no audit, pero asegura caps presentes vía INSERT OR IGNORE si se desea.
    // Para preservar "no duplicate audit", no hacemos batch. El caller puede optar por
    // hacer INSERT OR IGNORE sin audit en otro batch si quiere reparar caps huérfanas;
    // la misión acepta early noop.
    return { status: 'noop', planId: newPlanId };
  }

  // Audit chain head
  let prevHash: string | null;
  try {
    prevHash = await readAuditChainHead(db, tenantId);
  } catch {
    return { status: 'error', planId: newPlanId };
  }

  const auditId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const payloadJson = JSON.stringify({
    prev_plan_id: prevPlanId,
    new_plan_id: newPlanId,
    source: opts.source,
    actor: opts.actorUserId,
    at: nowIso,
  });
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: 'PLAN_UPGRADE',
      entity_id: tenantId,
      tenant_id: tenantId,
      new_plan_id: newPlanId,
      prev_plan_id: prevPlanId,
      prev: prevHash,
    }),
  );

  // Statements
  const stmts: unknown[] = [];

  // 0: tenants plan_id
  stmts.push(db.prepare('UPDATE tenants SET plan_id = ? WHERE id = ?').bind(newPlanId, tenantId));

  // 1..N: INSERT OR IGNORE tenant_capabilities defaults
  for (const cap of newCaps) {
    stmts.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (?, ?, 1, ?)',
        )
        .bind(tenantId, cap, PLAN_DEFAULT_JSON),
    );
  }

  // Delete plan_default not in new plan
  if (newCaps.length > 0) {
    const placeholders = newCaps.map(() => '?').join(',');
    const sql = `DELETE FROM tenant_capabilities WHERE tenant_id = ? AND config_json = ? AND capability NOT IN (${placeholders})`;
    stmts.push(db.prepare(sql).bind(tenantId, PLAN_DEFAULT_JSON, ...newCaps));
  } else {
    // No caps? borrar todo plan_default (no debería pasar, pero fail-safe)
    stmts.push(
      db
        .prepare('DELETE FROM tenant_capabilities WHERE tenant_id = ? AND config_json = ?')
        .bind(tenantId, PLAN_DEFAULT_JSON),
    );
  }

  // Audit
  stmts.push(
    db
      .prepare(
        'INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        auditId,
        tenantId,
        opts.actorUserId,
        'PLAN_UPGRADE',
        'tenants',
        tenantId,
        payloadJson,
        prevHash,
        rowHash,
      ),
  );

  // Epoch: ensure row exists then increment
  stmts.push(
    db
      .prepare('INSERT OR IGNORE INTO tenant_data_epochs (tenant_id, epoch) VALUES (?, 0)')
      .bind(tenantId),
  );
  stmts.push(
    db
      .prepare(
        'UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?',
      )
      .bind(tenantId),
  );

  // Claim CAS
  let claimStmts: ReturnType<typeof auditChainClaimStatements>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    claimStmts = auditChainClaimStatements(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
      tenantId,
      prevHash,
      [rowHash],
    );
  } catch {
    return { status: 'error', planId: newPlanId };
  }
  stmts.push(...claimStmts);

  try {
    await (env.DB as unknown as { batch(s: unknown[]): Promise<unknown> }).batch(stmts);
  } catch {
    return { status: 'error', planId: newPlanId };
  }

  // Best-effort KV: actualizar tenant:${tenantId} plan_id
  if (env.TENANT_KV?.get && env.TENANT_KV?.put) {
    try {
      const raw = await env.TENANT_KV.get(`tenant:${tenantId}`);
      if (raw) {
        const tenant = JSON.parse(raw) as Record<string, unknown>;
        tenant.plan_id = newPlanId;
        tenant.planId = newPlanId;
        await env.TENANT_KV.put(`tenant:${tenantId}`, JSON.stringify(tenant));
      }
    } catch {
      // best-effort
    }
  }

  return { status: 'updated', planId: newPlanId, auditId };
}
