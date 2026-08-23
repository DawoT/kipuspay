/**
 * Sprint 53 — rutas de diagnóstico de hardware (regla 37b, ADR-0033).
 * POST /api/hardware/diagnostics  → persiste HARDWARE_DIAG en audit_events
 *                                    (cadena de hashes, soporte remoto).
 * GET  /api/hardware/diagnostics  → listado reciente del tenant (admin).
 * Ambos fail-closed: flag + capability + rol; sin lista no hay acceso por
 * omisión (invariante 5).
 */
import { auditChainClaimStatements, readAuditChainHead } from '@kipuspay/adapters-d1';
import { parseHardwareDiagAuditPayload } from '@kipuspay/domain-hardware';
export interface HardwareDiagEnv {
  readonly FEATURE_HARDWARE_DIAGNOSTICS?: string;
  readonly DB?: D1Database;
}

/** Sprint 53 — flag default off (mismo patrón que onboarding-routes). */
function isHardwareDiagnosticsEnabled(env: HardwareDiagEnv | undefined): boolean {
  return env?.FEATURE_HARDWARE_DIAGNOSTICS === '1' || env?.FEATURE_HARDWARE_DIAGNOSTICS === 'true';
}

export interface HardwareDiagActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface HardwareDiagHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'owner']);

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildHardwareDiagAuditStatement(
  db: D1Database,
  input: {
    tenantId: string;
    actorUserId: string;
    target: string;
    payload: Record<string, unknown>;
    prevHash: string | null;
  },
): Promise<{ statement: { run(): Promise<unknown> }; rowHash: string }> {
  const id = crypto.randomUUID();
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: 'HARDWARE_DIAG',
      entity_id: input.target,
      prev_hash: input.prevHash,
      payload: input.payload,
    }),
  );
  return {
    statement: db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, NULL, ?, 'HARDWARE_DIAG', 'hardware', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.tenantId,
        input.actorUserId,
        input.target,
        JSON.stringify(input.payload),
        input.prevHash,
        rowHash,
      ),
    rowHash,
  };
}

async function capabilityEnabled(env: HardwareDiagEnv, tenantId: string): Promise<boolean> {
  if (!env.DB) return false;
  const row = await env.DB.prepare(
    `SELECT enabled FROM tenant_capabilities
     WHERE tenant_id = ? AND capability = 'hardware.diagnostics' LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ enabled: number }>();
  return row?.enabled === 1;
}

function denied(env: HardwareDiagEnv, actor: HardwareDiagActor): HardwareDiagHttpResult | null {
  if (!isHardwareDiagnosticsEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!ADMIN_ROLES.has(actor.role)) return { status: 403, body: { code: 'FORBIDDEN' } };
  if (!actor.tenantId) return { status: 403, body: { code: 'FORBIDDEN' } };
  return null;
}

export async function runReportHardwareDiagnosticsHttp(
  env: HardwareDiagEnv,
  actor: HardwareDiagActor,
  body: unknown,
): Promise<HardwareDiagHttpResult> {
  const pre = denied(env, actor);
  if (pre) return pre;
  if (!(await capabilityEnabled(env, actor.tenantId))) {
    return { status: 403, body: { code: 'CAPABILITY_OFF' } };
  }
  if (env.DB === undefined || env.DB === null)
    return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  const raw = (body as { reports?: unknown } | undefined)?.reports;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) {
    return { status: 400, body: { code: 'HARDWARE_DIAG_INVALID' } };
  }
  const items: readonly unknown[] = raw;
  const reports = items
    .map((r) => (typeof r === 'string' ? parseHardwareDiagAuditPayload(r) : r))
    .filter(
      (r): r is { target: string; causeCode: string; ok: boolean; testedAtIso: string } =>
        typeof r === 'object' &&
        r !== null &&
        'target' in r &&
        typeof r.target === 'string' &&
        'causeCode' in r &&
        typeof r.causeCode === 'string' &&
        'ok' in r &&
        typeof r.ok === 'boolean' &&
        'testedAtIso' in r &&
        typeof r.testedAtIso === 'string',
    );
  if (reports.length !== raw.length) {
    return { status: 400, body: { code: 'HARDWARE_DIAG_INVALID' } };
  }
  try {
    // S53-H1: la cadena de audit se encadena EN MEMORIA y se persiste en UN
    // solo batch (0 bifurcación bajo concurrencia, 0 parciales si falla).
    const initialHead = await readAuditChainHead(env.DB, actor.tenantId);
    let prevHash: string | null = initialHead;
    const chainHashes: string[] = [];
    const statements: { run(): Promise<unknown> }[] = [];
    for (const report of reports) {
      const built = await buildHardwareDiagAuditStatement(env.DB, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        target: String(report.target),
        payload: report,
        prevHash,
      });
      statements.push(built.statement);
      prevHash = built.rowHash;
      chainHashes.push(built.rowHash);
    }
    await env.DB.batch([
      ...(statements as never[]),
      ...auditChainClaimStatements(env.DB, actor.tenantId, initialHead, chainHashes),
    ] as never);
    return { status: 202, body: { recorded: reports.length } };
  } catch {
    return { status: 500, body: { code: 'HARDWARE_DIAG_FAILED' } };
  }
}

export async function runListHardwareDiagnosticsHttp(
  env: HardwareDiagEnv,
  actor: HardwareDiagActor,
  limit: number,
): Promise<HardwareDiagHttpResult> {
  const pre = denied(env, actor);
  if (pre) return pre;
  if (!(await capabilityEnabled(env, actor.tenantId))) {
    return { status: 403, body: { code: 'CAPABILITY_OFF' } };
  }
  if (env.DB === undefined || env.DB === null)
    return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  const clamped = Math.min(Math.max(limit, 1), 50);
  try {
    const rows = await env.DB.prepare(
      `SELECT entity_id AS target, payload_json, created_at
       FROM audit_events
       WHERE tenant_id = ? AND action = 'HARDWARE_DIAG'
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
      .bind(actor.tenantId, clamped)
      .all<{ target: string; payload_json: string; created_at: string }>();
    return {
      status: 200,
      body: {
        reports: (rows.results ?? []).map((row) => ({
          target: row.target,
          payload: parseHardwareDiagAuditPayload(row.payload_json),
          recordedAt: row.created_at,
        })),
      },
    };
  } catch {
    return { status: 500, body: { code: 'HARDWARE_DIAG_LIST_FAILED' } };
  }
}
