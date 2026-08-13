/**
 * Sprint 37 — comisiones de vendedor (FEATURE_SALES_COMMISSIONS, default off).
 */
/* eslint-disable complexity -- HTTP handlers multi-rama Admin rates/payouts */
import {
  listCommissionRates,
  listOwnerCommissions,
  processCommissionPayoutAtomic,
  processCommissionPayoutPayAtomic,
  processCommissionPayoutVoidAtomic,
  processCommissionRateUpsertAtomic,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isSalesCommissionsEnabled } from '../auth/features.js';
import { parseFiniteNumber } from '../http/money-input.js';

export { isSalesCommissionsEnabled };

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_SALES_COMMISSIONS off', code: 'FEATURE_OFF' },
  };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'COMMISSION_FORBIDDEN',
  'COMMISSION_INVALID_RATE',
  'COMMISSION_SELLER_REQUIRED',
  'COMMISSION_INVALID_AMOUNT',
  'COMMISSION_NOTHING_TO_PAY',
  'COMMISSION_ALREADY_PAID',
  'COMMISSION_INVALID_STATUS',
  'COMMISSION_PAYROLL_FORBIDDEN',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'COMMISSION_FAILED';
  if (code === 'COMMISSION_NOT_FOUND') {
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

function adminOrOwner(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export async function runListCommissionRatesHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!adminOrOwner(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const items = await listCommissionRates(env.DB, tenantId);
  return { status: 200, body: { items } };
}

export async function runUpsertCommissionRateHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!adminOrOwner(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const sellerId = typeof body.sellerId === 'string' ? body.sellerId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const ratePercent = parseFiniteNumber(body.ratePercent);
  if (ratePercent === null || !sellerId || !branchId) {
    return {
      status: 400,
      body: { error: 'sellerId, branchId and ratePercent (number) required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processCommissionRateUpsertAtomic(env.DB, tenantId, userId, {
      sellerId,
      branchId,
      ratePercent,
      productId: typeof body.productId === 'string' ? body.productId : null,
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
      rateAmountCents: typeof body.rateAmountCents === 'number' ? body.rateAmountCents : null,
      actorIsAdminOrOwner: true,
    });
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runCreateCommissionPayoutHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!adminOrOwner(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const sellerId = typeof body.sellerId === 'string' ? body.sellerId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const periodStartIso = typeof body.periodStartIso === 'string' ? body.periodStartIso : '';
  const periodEndIso = typeof body.periodEndIso === 'string' ? body.periodEndIso : '';
  if (!sellerId || !branchId || !periodStartIso || !periodEndIso) {
    return {
      status: 400,
      body: {
        error: 'sellerId, branchId, periodStartIso, periodEndIso required',
        code: 'BAD_REQUEST',
      },
    };
  }
  try {
    const result = await processCommissionPayoutAtomic(
      env.DB,
      tenantId,
      userId,
      {
        sellerId,
        branchId,
        periodStartIso,
        periodEndIso,
        actorIsAdminOrOwner: true,
        ...(typeof body.grossCents === 'number' ? { clientGrossCents: body.grossCents } : {}),
      },
      opts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runPayCommissionPayoutHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!adminOrOwner(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const payoutId = typeof body.payoutId === 'string' ? body.payoutId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  if (!payoutId || !branchId) {
    return { status: 400, body: { error: 'payoutId and branchId required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await processCommissionPayoutPayAtomic(
      env.DB,
      tenantId,
      userId,
      { payoutId, branchId, actorIsAdminOrOwner: true },
      opts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runVoidCommissionPayoutHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!adminOrOwner(role)) {
    return { status: 403, body: { error: 'Admin/Owner required', code: 'FORBIDDEN' } };
  }
  const payoutId = typeof body.payoutId === 'string' ? body.payoutId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  if (!payoutId || !branchId) {
    return { status: 400, body: { error: 'payoutId and branchId required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await processCommissionPayoutVoidAtomic(env.DB, tenantId, userId, {
      payoutId,
      branchId,
      actorIsAdminOrOwner: true,
    });
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runOwnerCommissionsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role = '',
): Promise<HttpResult> {
  if (!isSalesCommissionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  // T-1: reporte Dueño solo admin/owner (nunca cashier).
  if (role !== 'owner' && role !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  const report = await listOwnerCommissions(env.DB, tenantId);
  return { status: 200, body: report };
}
