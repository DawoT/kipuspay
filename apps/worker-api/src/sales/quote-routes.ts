/**
 * Sprint 33 — cotizaciones (FEATURE_SALES_QUOTES, default off).
 */
/* eslint-disable complexity -- HTTP create/convert: flags/DB/items/docType + adapter errors */
import {
  processQuoteApproveAtomic,
  processQuoteCancelAtomic,
  processQuoteConvertAtomic,
  processQuoteCreateAtomic,
  processQuoteSendAtomic,
} from '@kipuspay/adapters-d1';
import { markQuoteExpired, type QuoteStatus } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isSalesQuotesEnabled } from '../auth/features.js';

export { isSalesQuotesEnabled };

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_SALES_QUOTES off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'QUOTE_ITEMS_REQUIRED',
  'QUOTE_INVALID_AMOUNT',
  'QUOTE_INVALID_STATUS',
  'QUOTE_EXPIRED',
  'QUOTE_ALREADY_CONVERTED',
  'QUOTE_ALREADY_TERMINAL',
  'QUOTE_NOT_APPROVED',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_NOT_SELLABLE',
  'UOM_NOT_FOUND',
  'PAYMENT_METHOD_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'CREDIT_LIMIT_EXCEEDED',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'QUOTE_FAILED';
  if (code === 'QUOTE_NOT_FOUND') {
    return { status: 404, body: { error: code, code } };
  }
  const status =
    CLIENT_422.has(code) || code.startsWith('UOM_') || code.startsWith('QTY_') ? 422 : 400;
  return { status, body: { error: code, code } };
}

function quoteOpts(env: WorkerEnv | undefined) {
  return {
    catalogUomEnabled: env?.FEATURE_CATALOG_UOM === '1' || env?.FEATURE_CATALOG_UOM === 'true',
    pricingListsEnabled:
      env?.FEATURE_PRICING_LISTS === '1' || env?.FEATURE_PRICING_LISTS === 'true',
    ledgerChartOfAccountsEnabled:
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true',
  };
}

export async function runCreateQuoteHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const items = Array.isArray(body.items)
    ? body.items.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          productId: typeof item.productId === 'string' ? item.productId : '',
          uomId: typeof item.uomId === 'string' ? item.uomId : null,
          enteredQuantityMicrounits: Number(item.enteredQuantityMicrounits),
          batchId: typeof item.batchId === 'string' ? item.batchId : null,
        };
      })
    : [];
  if (!branchId || items.length === 0) {
    return { status: 400, body: { error: 'branchId and items required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await processQuoteCreateAtomic(
      env.DB,
      tenantId,
      userId,
      {
        branchId,
        customerId: typeof body.customerId === 'string' ? body.customerId : null,
        validUntilIso: typeof body.validUntilIso === 'string' ? body.validUntilIso : null,
        items,
      },
      quoteOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runSendQuoteHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const quoteId = typeof body.quoteId === 'string' ? body.quoteId : '';
  if (!quoteId) return { status: 400, body: { error: 'quoteId required', code: 'BAD_REQUEST' } };
  try {
    const result = await processQuoteSendAtomic(env.DB, tenantId, userId, { quoteId });
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runApproveQuoteHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const quoteId = typeof body.quoteId === 'string' ? body.quoteId : '';
  if (!quoteId) return { status: 400, body: { error: 'quoteId required', code: 'BAD_REQUEST' } };
  try {
    const result = await processQuoteApproveAtomic(env.DB, tenantId, userId, { quoteId });
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runConvertQuoteHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const quoteId = typeof body.quoteId === 'string' ? body.quoteId : '';
  const cashRegisterSessionId =
    typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : '';
  const series = typeof body.series === 'string' ? body.series : '';
  const documentType =
    body.documentType === '01' || body.documentType === '03' || body.documentType === 'NV'
      ? body.documentType
      : 'NV';
  if (!quoteId || !cashRegisterSessionId || !series) {
    return {
      status: 400,
      body: { error: 'quoteId, session and series required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processQuoteConvertAtomic(
      env.DB,
      tenantId,
      userId,
      {
        quoteId,
        cashRegisterSessionId,
        series,
        documentType,
        creditOverrideTokenHash:
          typeof body.creditOverrideTokenHash === 'string' ? body.creditOverrideTokenHash : null,
      },
      quoteOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runCancelQuoteHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const quoteId = typeof body.quoteId === 'string' ? body.quoteId : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (!quoteId || !reason.trim()) {
    return { status: 400, body: { error: 'quoteId and reason required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await processQuoteCancelAtomic(env.DB, tenantId, userId, { quoteId, reason });
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runListExpiredQuotesHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isSalesQuotesEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const nowIso = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT id, branch_id, status, valid_until, total_cents
     FROM quotes
     WHERE tenant_id = ? AND status IN ('DRAFT','SENT','APPROVED','EXPIRED')
     ORDER BY valid_until ASC LIMIT 200`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      branch_id: string;
      status: string;
      valid_until: string | null;
      total_cents: number;
    }>();
  const items = (rows.results ?? []).map((row) => {
    const status = markQuoteExpired({
      status: row.status as QuoteStatus,
      validUntilIso: row.valid_until,
      nowIso,
    });
    return {
      id: row.id,
      branchId: row.branch_id,
      status,
      validUntil: row.valid_until,
      snapshotTotalCents: row.total_cents,
    };
  });
  return { status: 200, body: { items: items.filter((item) => item.status === 'EXPIRED') } };
}
