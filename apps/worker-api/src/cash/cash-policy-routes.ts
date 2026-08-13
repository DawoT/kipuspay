/**
 * Backlog v10 P2 — políticas de caja: propina y cajón de efectivo.
 *
 * - GET /api/cash/policy: lee `tip_max_percent` y `open_drawer_on_cash`.
 * - PATCH /api/cash/policy: actualiza (solo owner/admin).
 *
 * Gating: FEATURE_SALE_TIP / FEATURE_CASH_DRAWER default-off → 404.
 */
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

export interface CashPolicyEnv {
  readonly FEATURE_SALE_TIP?: string;
  readonly FEATURE_CASH_DRAWER?: string;
  readonly DB?: unknown;
}

interface PolicyDb {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
}

export function isCashPolicyEnabled(env: CashPolicyEnv | undefined): boolean {
  return env?.FEATURE_SALE_TIP === '1' || env?.FEATURE_CASH_DRAWER === '1';
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

export async function runGetCashPolicyHttp(
  env: CashPolicyEnv,
  actor: QuickAddActor,
): Promise<HttpResult> {
  if (!isCashPolicyEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'CASH_POLICY_DB_UNAVAILABLE' } };
  const row = await (env.DB as unknown as PolicyDb)
    .prepare(
      `SELECT tip_max_percent, open_drawer_on_cash
       FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
    )
    .bind(actor.tenantId)
    .first<{ tip_max_percent: number; open_drawer_on_cash: number }>();
  return {
    status: 200,
    body: {
      tipMaxPercent: row?.tip_max_percent ?? 25,
      openDrawerOnCash: (row?.open_drawer_on_cash ?? 1) === 1,
    },
  };
}

function policyPreflight(env: CashPolicyEnv, actor: QuickAddActor): HttpResult | null {
  if (!isCashPolicyEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'CASH_POLICY_DB_UNAVAILABLE' } };
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  return null;
}

function parseCashPolicyPatch(
  body: Record<string, unknown>,
): { ok: true; sets: string[]; params: unknown[] } | { ok: false; status: number; code: string } {
  const tipMaxPercent = body.tipMaxPercent;
  const openDrawerOnCash = body.openDrawerOnCash;
  if (
    tipMaxPercent !== undefined &&
    (typeof tipMaxPercent !== 'number' ||
      !Number.isInteger(tipMaxPercent) ||
      tipMaxPercent <= 0 ||
      tipMaxPercent > 100)
  ) {
    return { ok: false, status: 422, code: 'INVALID_TIP_MAX_PERCENT' };
  }
  if (openDrawerOnCash !== undefined && typeof openDrawerOnCash !== 'boolean') {
    return { ok: false, status: 422, code: 'INVALID_OPEN_DRAWER' };
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (tipMaxPercent !== undefined) {
    sets.push('tip_max_percent = ?');
    params.push(tipMaxPercent);
  }
  if (openDrawerOnCash !== undefined) {
    sets.push('open_drawer_on_cash = ?');
    params.push(openDrawerOnCash ? 1 : 0);
  }
  if (sets.length === 0) {
    return { ok: false, status: 422, code: 'BAD_REQUEST' };
  }
  return { ok: true, sets, params };
}

async function applyCashPolicyPatch(
  env: CashPolicyEnv,
  tenantId: string,
  patch: { ok: true; sets: string[]; params: unknown[] },
): Promise<
  | { ok: true; row: { tip_max_percent: number; open_drawer_on_cash: number } | null }
  | { ok: false; status: number; code: string }
> {
  const db = env.DB as PolicyDb;
  await db
    .prepare(
      `INSERT INTO tenant_discount_policies (tenant_id, tip_max_percent, open_drawer_on_cash)
       VALUES (?, 25, 1)
       ON CONFLICT (tenant_id) DO NOTHING`,
    )
    .bind(tenantId)
    .run();
  const updated = await db
    .prepare(`UPDATE tenant_discount_policies SET ${patch.sets.join(', ')} WHERE tenant_id = ?`)
    .bind(...patch.params, tenantId)
    .run();
  if ((updated.meta?.changes ?? 0) !== 1) {
    return { ok: false, status: 404, code: 'TENANT_NOT_FOUND' };
  }
  const row = await db
    .prepare(
      `SELECT tip_max_percent, open_drawer_on_cash
       FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ tip_max_percent: number; open_drawer_on_cash: number }>();
  return { ok: true, row };
}

export async function runPatchCashPolicyHttp(
  env: CashPolicyEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const gate = policyPreflight(env, actor);
  if (gate) return gate;
  const parsed = parseCashPolicyPatch(body);
  if (!parsed.ok) {
    return { status: parsed.status, body: { code: parsed.code } };
  }
  const outcome = await applyCashPolicyPatch(env, actor.tenantId, parsed);
  return outcome.ok
    ? {
        status: 200,
        body: {
          tipMaxPercent: outcome.row?.tip_max_percent ?? 25,
          openDrawerOnCash: (outcome.row?.open_drawer_on_cash ?? 1) === 1,
        },
      }
    : { status: outcome.status, body: { code: outcome.code } };
}
