/**
 * Rutas offline sync — POST /v1/sync/sales (SYN-07) detrás de FEATURE_OFFLINE_SYNC.
 */
import { processSyncSalesBatch } from '@kipuspay/adapters-d1';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isLedgerStoreCreditEnabled } from '../auth/features.js';

export function isOfflineSyncEnabled(env: WorkerEnv): boolean {
  return env.FEATURE_OFFLINE_SYNC === '1' || env.FEATURE_OFFLINE_SYNC === 'true';
}

export async function runSyncSalesHttp(
  env: WorkerEnv,
  tenantId: string,
  userId: string,
  body: { sales?: readonly OfflineSalePayload[] | undefined },
  nowMs: number = Date.now(),
  terminalId = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isOfflineSyncEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_OFFLINE_SYNC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const sales = body.sales ?? [];
  if (!Array.isArray(sales) || sales.length === 0) {
    return { status: 400, body: { error: 'sales[] required', code: 'BAD_REQUEST' } };
  }
  const deleteFn = env.TENANT_KV?.delete?.bind(env.TENANT_KV);
  const kv = deleteFn ? { delete: (key: string) => deleteFn(key) } : undefined;
  const result = await processSyncSalesBatch(
    env.DB,
    tenantId,
    userId,
    sales,
    nowMs,
    kv,
    isLedgerStoreCreditEnabled(env),
    terminalId.trim(),
  );
  return { status: 200, body: { results: result.results } };
}
