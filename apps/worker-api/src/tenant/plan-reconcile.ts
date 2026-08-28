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

export const PLAN_RECONCILE_CONFLICT = 'PLAN_RECONCILE_CONFLICT';

export function isCasConflict(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return msg.includes('CHECK') || msg.includes('atomic_guards');
}

export interface ReconcileResult {
  status: 'updated' | 'noop' | 'not_found' | 'error' | 'conflict';
  planId: string;
  auditId?: string;
}

type DbLike = D1Database & {
  batch(statements: unknown[]): Promise<unknown>;
  prepare(sql: string): {
    bind(...a: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

async function loadPrevPlanId(
  db: DbLike,
  tenantId: string,
  provided: string | null | undefined,
): Promise<string | null> {
  if (typeof provided === 'string') return provided;
  const row = await db
    .prepare('SELECT plan_id FROM tenants WHERE id = ? AND deleted_at IS NULL')
    .bind(tenantId)
    .first<{ plan_id: string | null }>();
  if (!row) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
  return row.plan_id ?? 'arranque';
}

function buildStmts(
  db: DbLike,
  tenantId: string,
  newPlanId: string,
  newCaps: readonly string[],
  auditId: string,
  payloadJson: string,
  prevHash: string | null,
  rowHash: string,
  actorUserId: string,
): unknown[] {
  const stmts: unknown[] = [];
  stmts.push(db.prepare('UPDATE tenants SET plan_id = ? WHERE id = ?').bind(newPlanId, tenantId));
  for (const cap of newCaps) {
    stmts.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (?, ?, 1, ?)',
        )
        .bind(tenantId, cap, PLAN_DEFAULT_JSON),
    );
  }
  if (newCaps.length > 0) {
    const placeholders = newCaps.map(() => '?').join(',');
    const sql = `DELETE FROM tenant_capabilities WHERE tenant_id = ? AND config_json = ? AND capability NOT IN (${placeholders})`;
    stmts.push(db.prepare(sql).bind(tenantId, PLAN_DEFAULT_JSON, ...newCaps));
  } else {
    stmts.push(
      db
        .prepare('DELETE FROM tenant_capabilities WHERE tenant_id = ? AND config_json = ?')
        .bind(tenantId, PLAN_DEFAULT_JSON),
    );
  }
  stmts.push(
    db
      .prepare(
        'INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        auditId,
        tenantId,
        actorUserId,
        'PLAN_UPGRADE',
        'tenants',
        tenantId,
        payloadJson,
        prevHash,
        rowHash,
      ),
  );
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
  const claimStmts = auditChainClaimStatements(
    db as unknown as Parameters<typeof auditChainClaimStatements>[0],
    tenantId,
    prevHash,
    [rowHash],
  );
  stmts.push(...claimStmts);
  return stmts;
}

async function executeWithCasRetry(db: DbLike, stmts: unknown[]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await (db as unknown as { batch(s: unknown[]): Promise<unknown> }).batch(stmts);
      return;
    } catch (e) {
      if (isCasConflict(e)) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
          continue;
        }
        const conflictErr = Object.assign(new Error(PLAN_RECONCILE_CONFLICT), {
          code: PLAN_RECONCILE_CONFLICT,
          cause: e,
        });
        throw conflictErr;
      }
      throw e;
    }
  }
}

async function updateKvBestEffort(
  env: PlanReconcileEnv,
  tenantId: string,
  newPlanId: string,
): Promise<void> {
  if (!env.TENANT_KV?.get || !env.TENANT_KV?.put) return;
  try {
    const raw = await env.TENANT_KV.get(`tenant:${tenantId}`);
    if (!raw) return;
    const tenant = JSON.parse(raw) as Record<string, unknown>;
    tenant.plan_id = newPlanId;
    tenant.planId = newPlanId;
    await env.TENANT_KV.put(`tenant:${tenantId}`, JSON.stringify(tenant));
  } catch {
    // best-effort
  }
}

/**
 * Ejecuta la reconciliación atómica si el plan cambia.
 * Retorna noop si ya está en planId (no inserta audit).
 * El llamador decide el actor y source para payload.
 */
export async function reconcilePlanAtomic(
  env: PlanReconcileEnv,
  tenantId: string,
  newPlanId: string,
  opts: { actorUserId: string; source: 'api' | 'stripe_webhook'; prevPlanId?: string | null },
): Promise<ReconcileResult> {
  const db = env.DB as unknown as DbLike;
  if (!db) return { status: 'error', planId: newPlanId };

  let newCaps: readonly string[];
  try {
    newCaps = provisionCapabilitiesForPlan(newPlanId);
  } catch {
    return { status: 'error', planId: newPlanId };
  }

  try {
    const prevPlanId = await loadPrevPlanId(db, tenantId, opts.prevPlanId ?? null);
    if (prevPlanId === newPlanId) return { status: 'noop', planId: newPlanId };

    const prevHash = await readAuditChainHead(db, tenantId);
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
    const stmts = buildStmts(
      db,
      tenantId,
      newPlanId,
      newCaps,
      auditId,
      payloadJson,
      prevHash,
      rowHash,
      opts.actorUserId,
    );
    await executeWithCasRetry(db, stmts);
    await updateKvBestEffort(env, tenantId, newPlanId);
    return { status: 'updated', planId: newPlanId, auditId };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'NOT_FOUND') return { status: 'not_found', planId: newPlanId };
    if (isCasConflict(e) || code === PLAN_RECONCILE_CONFLICT) throw e;
    return { status: 'error', planId: newPlanId };
  }
}
