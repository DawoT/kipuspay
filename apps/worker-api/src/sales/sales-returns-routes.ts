/**
 * Sprint 28 — POST/GET sales returns (FEATURE_SALES_RETURNS, default off).
 */
import { processReturnAtomic } from '@kipuspay/adapters-d1';
import { parseReturnPolicyRow } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isSalesReturnsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_SALES_RETURNS === '1' || env?.FEATURE_SALES_RETURNS === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_SALES_RETURNS off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_ERRORS = new Set([
  'OUTSIDE_WINDOW',
  'RETURN_QTY_EXCEEDED',
  'RETURN_REASON_REQUIRED',
  'RETURN_NO_LINES',
  'AUTH_REQUIRED',
  'SESSION_CLOSED',
  'NC_EXCEEDS_RESIDUAL',
  'FISCAL_CDR_REQUIRED',
  'EA_REQUIRES_FULL_CANCELLATION',
  'NV_USES_NV_RETURN_NOT_NC',
  'NV_RETURN_REQUIRES_NV_ORIGIN',
]);

const NOT_FOUND = new Set(['ORIGIN_NOT_FOUND', 'SERIES_NOT_FOUND', 'SESSION_NOT_FOUND']);

function mapReturnError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'RETURN_FAILED';
  const status = CLIENT_ERRORS.has(code) ? 422 : NOT_FOUND.has(code) ? 404 : 400;
  const copy =
    code === 'OUTSIDE_WINDOW'
      ? 'La devolución está fuera de la ventana de días permitida por la política del negocio.'
      : code;
  return { status, body: { error: copy, code } };
}

function parseCreateReturnBody(body: {
  originSaleId?: string;
  lines?: readonly { originalSaleItemId?: string; qty?: number }[];
  reason?: string;
  series?: string;
  authorizedByUserId?: string | null;
  cashRegisterSessionId?: string | null;
  authThresholdCents?: number;
}):
  | { ok: false; result: HttpResult }
  | {
      ok: true;
      originSaleId: string;
      series: string;
      reason: string;
      lines: { originalSaleItemId: string; qty: number }[];
      authorizedByUserId: string | null;
      cashRegisterSessionId: string | null;
      authThresholdCents: number | undefined;
    } {
  const originSaleId = body.originSaleId?.trim() ?? '';
  const reason = body.reason ?? '';
  const series = body.series?.trim() ?? '';
  const lines = (body.lines ?? [])
    .map((l) => ({
      originalSaleItemId: (l.originalSaleItemId ?? '').trim(),
      qty: Number(l.qty),
    }))
    .filter((l) => l.originalSaleItemId.length > 0);
  if (!originSaleId || !series || lines.length === 0) {
    return {
      ok: false,
      result: {
        status: 400,
        body: { error: 'originSaleId, series and lines required', code: 'BAD_REQUEST' },
      },
    };
  }
  return {
    ok: true,
    originSaleId,
    series,
    reason,
    lines,
    authorizedByUserId: body.authorizedByUserId ?? null,
    cashRegisterSessionId: body.cashRegisterSessionId ?? null,
    authThresholdCents: body.authThresholdCents,
  };
}

export async function runCreateSalesReturnHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    originSaleId?: string;
    lines?: readonly { originalSaleItemId?: string; qty?: number }[];
    reason?: string;
    series?: string;
    authorizedByUserId?: string | null;
    cashRegisterSessionId?: string | null;
    authThresholdCents?: number;
  },
): Promise<HttpResult> {
  if (!isSalesReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const parsed = parseCreateReturnBody(body);
  if (!parsed.ok) return parsed.result;

  const ledgerArApEnabled = env.FEATURE_LEDGER_AR_AP === '1' || env.FEATURE_LEDGER_AR_AP === 'true';

  try {
    const result = await processReturnAtomic(
      env.DB,
      tenantId,
      userId,
      {
        originSaleId: parsed.originSaleId,
        lines: parsed.lines,
        reason: parsed.reason,
        series: parsed.series,
        authorizedByUserId: parsed.authorizedByUserId,
        cashRegisterSessionId: parsed.cashRegisterSessionId,
        ...(parsed.authThresholdCents !== undefined
          ? { authThresholdCents: parsed.authThresholdCents }
          : {}),
      },
      { ledgerArApEnabled },
    );
    return {
      status: 200,
      body: {
        returnId: result.returnId,
        documentSaleId: result.documentSaleId,
        docType: result.docType,
        refundAmountCents: result.refundAmountCents,
        refundMovementId: result.refundMovementId,
      },
    };
  } catch (err) {
    return mapReturnError(err);
  }
}

export async function runGetReturnPolicyHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isSalesReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const row = await env.DB.prepare(
    `SELECT window_days, by_payment_method_json, refund_to_original_method, allow_turn_closed_with_auth
     FROM return_policies WHERE tenant_id = ?`,
  )
    .bind(tenantId)
    .first<{
      window_days: number;
      by_payment_method_json: string;
      refund_to_original_method: number;
      allow_turn_closed_with_auth: number;
    }>();
  const policy = parseReturnPolicyRow(row);
  return {
    status: 200,
    body: {
      windowDays: policy.windowDays,
      byPaymentMethod: policy.byPaymentMethod,
      refundToOriginalMethod: policy.refundToOriginalMethod,
      allowTurnClosedWithAuth: policy.allowTurnClosedWithAuth,
    },
  };
}

export async function runListSalesReturnsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  saleId: string,
): Promise<HttpResult> {
  if (!isSalesReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const id = saleId.trim();
  if (!id) {
    return { status: 400, body: { error: 'saleId required', code: 'BAD_REQUEST' } };
  }

  const res = await env.DB.prepare(
    `SELECT id, doc_type, doc_series, doc_number, refund_amount_cents, refund_payment_method,
            reason, created_at
     FROM sales_returns WHERE tenant_id = ? AND sale_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(tenantId, id)
    .all<{
      id: string;
      doc_type: string;
      doc_series: string | null;
      doc_number: string | null;
      refund_amount_cents: number;
      refund_payment_method: string;
      reason: string;
      created_at: string;
    }>();

  return {
    status: 200,
    body: {
      returns: (res.results ?? []).map((r) => ({
        id: r.id,
        docType: r.doc_type,
        docSeries: r.doc_series,
        docNumber: r.doc_number,
        refundAmountCents: r.refund_amount_cents,
        refundPaymentMethod: r.refund_payment_method,
        reason: r.reason,
        createdAt: r.created_at,
      })),
    },
  };
}
