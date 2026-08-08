/**
 * Rutas offline sync — POST /v1/sync/sales (SYN-07) detrás de FEATURE_OFFLINE_SYNC.
 */
import { processSyncSalesBatch, resolveActiveTerminalSession } from '@kipuspay/adapters-d1';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isInventoryScaleEnabled,
  isLedgerChartOfAccountsEnabled,
  isLedgerStoreCreditEnabled,
  isSalesCommissionsEnabled,
  isSalesInstallmentsEnabled,
} from '../auth/features.js';
import {
  isCatalogUomEnabled,
  isInventoryBatchesEnabled,
  isInventoryBomEnabled,
  isLedgerArApEnabled,
  isPricingListsEnabled,
  isPricingPromotionsEnabled,
} from './offline-sale-route.js';

export function isOfflineSyncEnabled(env: WorkerEnv): boolean {
  return env.FEATURE_OFFLINE_SYNC === '1' || env.FEATURE_OFFLINE_SYNC === 'true';
}

function syncPreflight(
  env: WorkerEnv,
): { status: 404 | 503; body: Record<string, unknown> } | null {
  if (!isOfflineSyncEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_OFFLINE_SYNC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  return null;
}

function hasWeightMeasurement(sale: OfflineSalePayload): boolean {
  return sale.items.some((item) => item.weightMeasurement !== undefined);
}

async function verifyWeightedTerminalBindings(
  db: NonNullable<WorkerEnv['DB']>,
  tenantId: string,
  userId: string,
  terminalId: string,
  sales: readonly OfflineSalePayload[],
): Promise<void> {
  for (const sale of sales) {
    if (!hasWeightMeasurement(sale)) continue;
    await resolveActiveTerminalSession(db, {
      tenantId,
      userId,
      terminalId,
      cashRegisterSessionId: sale.cashRegisterSessionId,
      branchId: sale.branchId,
    });
  }
}

export async function runSyncSalesHttp(
  env: WorkerEnv,
  tenantId: string,
  userId: string,
  body: { sales?: readonly OfflineSalePayload[] | undefined },
  nowMs: number = Date.now(),
  terminalId = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const denied = syncPreflight(env);
  if (denied) return denied;
  const db = env.DB!;
  const sales: readonly OfflineSalePayload[] = body.sales ?? [];
  if (!Array.isArray(sales) || sales.length === 0) {
    return { status: 400, body: { error: 'sales[] required', code: 'BAD_REQUEST' } };
  }
  const hasWeightedSale = sales.some(hasWeightMeasurement);
  if (hasWeightedSale) {
    if (!tenantId || !userId || !terminalId.trim()) {
      return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
    }
    try {
      await verifyWeightedTerminalBindings(db, tenantId, userId, terminalId.trim(), sales);
    } catch {
      return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
    }
  }
  const deleteFn = env.TENANT_KV?.delete?.bind(env.TENANT_KV);
  const kv = deleteFn ? { delete: (key: string) => deleteFn(key) } : undefined;
  const result = await processSyncSalesBatch(
    db,
    tenantId,
    userId,
    sales,
    nowMs,
    kv,
    isLedgerStoreCreditEnabled(env),
    terminalId.trim(),
    {
      ledgerArApEnabled: isLedgerArApEnabled(env),
      pricingPromotionsEnabled: isPricingPromotionsEnabled(env),
      catalogUomEnabled: isCatalogUomEnabled(env),
      ledgerChartOfAccountsEnabled: isLedgerChartOfAccountsEnabled(env),
      salesInstallmentsEnabled: isSalesInstallmentsEnabled(env),
      salesCommissionsEnabled: isSalesCommissionsEnabled(env),
      inventoryScaleEnabled: isInventoryScaleEnabled(env),
      terminalId: terminalId.trim(),
      s18: {
        inventoryBatches: isInventoryBatchesEnabled(env),
        inventoryBom: isInventoryBomEnabled(env),
        pricingLists: isPricingListsEnabled(env),
      },
    },
  );
  return { status: 200, body: { results: result.results } };
}
