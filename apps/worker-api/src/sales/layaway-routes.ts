/**
 * Sprint 32 — apartados (FEATURE_SALES_LAYAWAY, default off).
 */
/* eslint-disable complexity -- HTTP create/convert: flags/DB/items/docType + adapter errors */
import {
  processLayawayCancelAtomic,
  processLayawayConvertAtomic,
  processLayawayCreateAtomic,
  processLayawayDepositAtomic,
} from '@kipuspay/adapters-d1';
import { markLayawayOverdue } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isLedgerArApEnabled,
  isLedgerChartOfAccountsEnabled,
  isSalesLayawayEnabled,
} from '../auth/features.js';
import { microunitsErrorResult, parseMicrounits } from '../http/microunits-input.js';

export { isLedgerChartOfAccountsEnabled, isSalesLayawayEnabled } from '../auth/features.js';

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_SALES_LAYAWAY off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'LAYAWAY_ITEMS_REQUIRED',
  'LAYAWAY_INVALID_AMOUNT',
  'LAYAWAY_DEPOSIT_EXCEEDS_BALANCE',
  'LAYAWAY_INVALID_STATUS',
  'LAYAWAY_INSUFFICIENT_DEPOSIT',
  'LAYAWAY_ALREADY_CONVERTED',
  'LAYAWAY_ALREADY_TERMINAL',
  'OUTSIDE_WINDOW',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_NOT_SELLABLE',
  'UOM_NOT_FOUND',
  'PAYMENT_METHOD_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'CREDIT_LIMIT_EXCEEDED',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'LAYAWAY_FAILED';
  if (code === 'LAYAWAY_NOT_FOUND') {
    return { status: 404, body: { error: code, code } };
  }
  const status =
    CLIENT_422.has(code) || code.startsWith('UOM_') || code.startsWith('QTY_') ? 422 : 400;
  return { status, body: { error: code, code } };
}

function chartOpts(env: WorkerEnv | undefined) {
  return {
    chartOfAccountsEnabled: isLedgerChartOfAccountsEnabled(env),
    catalogUomEnabled: env?.FEATURE_CATALOG_UOM === '1' || env?.FEATURE_CATALOG_UOM === 'true',
    pricingListsEnabled:
      env?.FEATURE_PRICING_LISTS === '1' || env?.FEATURE_PRICING_LISTS === 'true',
  };
}

export async function runCreateLayawayHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesLayawayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const cashRegisterSessionId =
    typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : '';
  // US-03: microunits con validación tipada fail-closed (un parser, cinco
  // sitios, veredictos idénticos) — un tipo inválido es 400 estable, nunca
  // una coacción Number() que acepta true/[5]/'+1'/' 42 '.
  const items: {
    productId: string;
    uomId: string | null;
    enteredQuantityMicrounits: number;
    batchId: string | null;
  }[] = [];
  if (Array.isArray(body.items)) {
    for (const raw of body.items) {
      const item = raw as Record<string, unknown>;
      const quantity = parseMicrounits(item.enteredQuantityMicrounits);
      if (!quantity.ok) return microunitsErrorResult(quantity.errorName);
      items.push({
        productId: typeof item.productId === 'string' ? item.productId : '',
        uomId: typeof item.uomId === 'string' ? item.uomId : null,
        enteredQuantityMicrounits: quantity.microunits,
        batchId: typeof item.batchId === 'string' ? item.batchId : null,
      });
    }
  }
  if (!branchId || !cashRegisterSessionId || items.length === 0) {
    return {
      status: 400,
      body: { error: 'branchId, session and items required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processLayawayCreateAtomic(
      env.DB,
      tenantId,
      userId,
      {
        branchId,
        cashRegisterSessionId,
        customerId: typeof body.customerId === 'string' ? body.customerId : null,
        dueDateIso: typeof body.dueDateIso === 'string' ? body.dueDateIso : null,
        items,
        initialPayment:
          typeof body.initialAmountCents === 'number'
            ? {
                paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash',
                amountCents: body.initialAmountCents,
              }
            : null,
      },
      chartOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runDepositLayawayHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesLayawayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const depositId = typeof body.depositId === 'string' ? body.depositId : '';
  const cashRegisterSessionId =
    typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : '';
  const amountCents = typeof body.amountCents === 'number' ? body.amountCents : 0;
  if (!depositId || !cashRegisterSessionId || amountCents <= 0) {
    return {
      status: 400,
      body: { error: 'depositId, session and amount required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processLayawayDepositAtomic(
      env.DB,
      tenantId,
      userId,
      {
        depositId,
        cashRegisterSessionId,
        paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash',
        amountCents,
      },
      chartOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runConvertLayawayHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesLayawayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const depositId = typeof body.depositId === 'string' ? body.depositId : '';
  const cashRegisterSessionId =
    typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : '';
  const series = typeof body.series === 'string' ? body.series : '';
  const documentType =
    body.documentType === '01' || body.documentType === '03' || body.documentType === 'NV'
      ? body.documentType
      : 'NV';
  if (!depositId || !cashRegisterSessionId || !series) {
    return {
      status: 400,
      body: { error: 'depositId, session and series required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await processLayawayConvertAtomic(
      env.DB,
      tenantId,
      userId,
      {
        depositId,
        cashRegisterSessionId,
        series,
        documentType,
        remainingAsCredit: body.remainingAsCredit === true,
        creditOverrideTokenHash:
          typeof body.creditOverrideTokenHash === 'string' ? body.creditOverrideTokenHash : null,
        saleOpts: { ledgerArApEnabled: isLedgerArApEnabled(env) },
      },
      chartOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runCancelLayawayHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesLayawayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId)
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const depositId = typeof body.depositId === 'string' ? body.depositId : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (!depositId || !reason.trim()) {
    return { status: 400, body: { error: 'depositId and reason required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await processLayawayCancelAtomic(
      env.DB,
      tenantId,
      userId,
      {
        depositId,
        cashRegisterSessionId:
          typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : null,
        reason,
      },
      chartOpts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runListOverdueLayawaysHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isSalesLayawayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const nowIso = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT d.id, d.branch_id, d.status, d.due_date, d.snapshot_total_cents,
            COALESCE((SELECT SUM(p.amount_cents) FROM sale_deposit_payments p
                      WHERE p.tenant_id = d.tenant_id AND p.sale_deposit_id = d.id), 0) AS paid_cents
     FROM sale_deposits d
     WHERE d.tenant_id = ? AND d.status IN ('OPEN','OVERDUE')
     ORDER BY d.due_date ASC LIMIT 200`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      branch_id: string;
      status: string;
      due_date: string | null;
      snapshot_total_cents: number;
      paid_cents: number;
    }>();
  const items = (rows.results ?? []).map((row) => {
    const status = markLayawayOverdue({
      status: row.status as 'OPEN' | 'OVERDUE' | 'CONVERTED' | 'CANCELLED',
      dueDateIso: row.due_date,
      nowIso,
    });
    return {
      id: row.id,
      branchId: row.branch_id,
      status,
      dueDate: row.due_date,
      snapshotTotalCents: row.snapshot_total_cents,
      paidCents: row.paid_cents,
      balanceCents: row.snapshot_total_cents - row.paid_cents,
    };
  });
  return { status: 200, body: { items: items.filter((item) => item.status === 'OVERDUE') } };
}
