import { processOfflineSaleAtomic } from '@kipuspay/adapters-d1';
import { InsufficientStockError, type OfflineSalePayload } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isAcidOfflineSaleEnabled(env: WorkerEnv | undefined): boolean {
  const flag = env?.FEATURE_ACID_OFFLINE_SALE;
  return flag === '1' || flag === 'true';
}

export function isFiscalCpeEnabled(env: WorkerEnv | undefined): boolean {
  const flag = env?.FEATURE_FISCAL_CPE;
  return flag === '1' || flag === 'true';
}

function mapError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof InsufficientStockError) {
    return {
      status: 422,
      body: {
        error: error.message,
        code: 'INSUFFICIENT_STOCK',
        productId: error.productId,
        requested: error.requested,
        available: error.available,
      },
    };
  }
  const msg = String(error instanceof Error ? error.message : error);
  if (msg.includes('ISSUED_AT_SKEW_VIOLATION')) {
    return { status: 422, body: { error: msg, code: 'ISSUED_AT_SKEW_VIOLATION' } };
  }
  if (msg.includes('Invalid or closed')) {
    return { status: 422, body: { error: msg, code: 'SESSION_CLOSED' } };
  }
  if (msg.includes('PAYMENT_TOTAL_MISMATCH')) {
    return { status: 422, body: { error: msg, code: 'PAYMENT_TOTAL_MISMATCH' } };
  }
  if (
    msg.includes('CPE_BLOCKED_INTERNAL_CONTROL') ||
    msg.includes('FACTURA_REQUIRES_RUC') ||
    msg.includes('BOLETA_ID_REQUIRED') ||
    msg.includes('DOCUMENT_NOT_ALLOWED_FOR_REGIME') ||
    msg.includes('SERIES_NOT_FOUND')
  ) {
    return { status: 422, body: { error: msg, code: msg } };
  }
  return { status: 500, body: { error: msg, code: 'OFFLINE_SALE_FAILED' } };
}

export interface OfflineSaleHttpResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Pipeline HTTP de venta offline (feature flag + DB + motor ACID).
 */
export async function runOfflineSaleHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  payload: OfflineSalePayload,
): Promise<OfflineSaleHttpResult> {
  if (!isAcidOfflineSaleEnabled(env)) {
    return { status: 404, body: { error: 'Feature disabled', code: 'FEATURE_DISABLED' } };
  }
  const isCpe =
    payload.documentType === '01' ||
    payload.documentType === '03' ||
    payload.documentType === '07' ||
    payload.documentType === '08';
  if (isCpe && !isFiscalCpeEnabled(env)) {
    return { status: 404, body: { error: 'Fiscal CPE disabled', code: 'FEATURE_DISABLED' } };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  try {
    const result = await processOfflineSaleAtomic(env.DB, tenantId, userId, payload);
    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    return mapError(error);
  }
}
