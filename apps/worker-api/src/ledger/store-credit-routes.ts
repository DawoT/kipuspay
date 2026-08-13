/**
 * Sprint 35 — crédito de tienda (FEATURE_LEDGER_STORE_CREDIT, default off).
 */
import {
  processStoreCreditAdjustAtomic,
  processStoreCreditExpireAtomic,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isLedgerStoreCreditEnabled } from '../auth/features.js';
import { parseMoneyInteger } from '../http/money-input.js';

export { isLedgerStoreCreditEnabled };

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_LEDGER_STORE_CREDIT off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'STORE_CREDIT_CUSTOMER_REQUIRED',
  'STORE_CREDIT_INSUFFICIENT',
  'STORE_CREDIT_OFFLINE',
  'STORE_CREDIT_FORBIDDEN',
  'STORE_CREDIT_INVALID_AMOUNT',
  'STORE_CREDIT_EXPIRED',
  'STORE_CREDIT_AUTH_REQUIRED',
  'STORE_CREDIT_SOURCE_REQUIRED',
  'STORE_CREDIT_NC_NOT_ELIGIBLE',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'STORE_CREDIT_FAILED';
  if (code === 'STORE_CREDIT_ACCOUNT_NOT_FOUND') {
    return { status: 404, body: { error: code, code } };
  }
  const status = CLIENT_422.has(code) ? 422 : 400;
  return { status, body: { error: code, code } };
}

function opts(env: WorkerEnv | undefined) {
  return {
    ledgerChartOfAccountsEnabled:
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true',
  };
}

function privileged(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export function runIssueStoreCreditHttp(env: WorkerEnv | undefined): HttpResult {
  if (!isLedgerStoreCreditEnabled(env)) return featureOff();
  return {
    status: 400,
    body: {
      error: 'Venta de vale via POST /api/pos/offline-sale (storeCreditIssue)',
      code: 'STORE_CREDIT_ISSUE_VIA_SALE',
    },
  };
}

export async function runExpireStoreCreditHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isLedgerStoreCreditEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!privileged(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const customerId = typeof body.customerId === 'string' ? body.customerId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  if (!customerId || !branchId) {
    return {
      status: 400,
      body: { error: 'customerId and branchId required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processStoreCreditExpireAtomic(
      env.DB,
      tenantId,
      userId,
      { customerId, branchId },
      opts(env),
    );
    return { status: 200, body: { ...result } };
  } catch (err) {
    return mapError(err);
  }
}

interface AdjustBodyParsed {
  readonly customerId: string;
  readonly branchId: string;
  readonly amountCents: number;
  readonly adjustSign: 'CREDIT' | 'DEBIT';
  readonly idempotencyKey: string | null;
  readonly authorizedByUserId: string;
}

function parseAdjustBody(
  body: Record<string, unknown>,
  userId: string,
): { ok: true; parsed: AdjustBodyParsed } | { ok: false; result: HttpResult } {
  const customerId = typeof body.customerId === 'string' ? body.customerId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const amountCents = parseMoneyInteger(body.amountCents);
  if (amountCents === null) {
    return {
      ok: false,
      result: {
        status: 400,
        body: { error: 'amountCents must be an integer number', code: 'BAD_REQUEST' },
      },
    };
  }
  if (!customerId || !branchId) {
    return {
      ok: false,
      result: {
        status: 400,
        body: { error: 'customerId and branchId required', code: 'BAD_REQUEST' },
      },
    };
  }
  return {
    ok: true,
    parsed: {
      customerId,
      branchId,
      amountCents,
      adjustSign: body.adjustSign === 'DEBIT' ? 'DEBIT' : 'CREDIT',
      idempotencyKey:
        typeof body.idempotencyKey === 'string' && body.idempotencyKey.length > 0
          ? body.idempotencyKey
          : null,
      authorizedByUserId:
        typeof body.authorizedByUserId === 'string' ? body.authorizedByUserId : userId,
    },
  };
}

export async function runAdjustStoreCreditHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isLedgerStoreCreditEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!privileged(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const parsed = parseAdjustBody(body, userId);
  if (!parsed.ok) return parsed.result;
  // S35-H1: el autorizador registrado en el ajuste (si no es el caller) debe
  // ser un admin/owner REAL del tenant — jamás un ID arbitrario (integridad
  // de auditoría, regla 12 §5.3).
  if (parsed.parsed.authorizedByUserId !== userId) {
    const approver = await env.DB.prepare(
      `SELECT role FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(parsed.parsed.authorizedByUserId, tenantId)
      .first<{ role: string }>();
    const approverRole = approver?.role ?? '';
    if (approverRole !== 'admin' && approverRole !== 'owner') {
      return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
    }
  }
  try {
    const result = await processStoreCreditAdjustAtomic(
      env.DB,
      tenantId,
      userId,
      { ...parsed.parsed },
      opts(env),
    );
    return { status: 200, body: { ...result } };
  } catch (err) {
    return mapError(err);
  }
}

export async function runOwnerStoreCreditHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role = '',
): Promise<HttpResult> {
  if (!isLedgerStoreCreditEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  // T-1: reporte Dueño solo admin/owner (nunca cashier).
  if (role !== 'owner' && role !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }

  const issued = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM store_credit_transactions
     WHERE tenant_id = ? AND type = 'ISSUE'`,
  )
    .bind(tenantId)
    .first<{ cents: number }>();
  const redeemed = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM store_credit_transactions
     WHERE tenant_id = ? AND type = 'REDEEM'`,
  )
    .bind(tenantId)
    .first<{ cents: number }>();
  const expired = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM store_credit_transactions
     WHERE tenant_id = ? AND type = 'EXPIRE'`,
  )
    .bind(tenantId)
    .first<{ cents: number }>();
  const open = await env.DB.prepare(
    `SELECT COALESCE(SUM(balance_cents), 0) AS cents FROM store_credit_accounts
     WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<{ cents: number }>();
  return {
    status: 200,
    body: {
      issuedCents: issued?.cents ?? 0,
      redeemedCents: redeemed?.cents ?? 0,
      expiredCents: expired?.cents ?? 0,
      openBalanceCents: open?.cents ?? 0,
    },
  };
}
