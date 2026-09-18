/**
 * Rutas offline sync — POST /v1/sync/sales (SYN-07) detrás de FEATURE_OFFLINE_SYNC.
 */
import { processSyncSalesBatch, resolveActiveTerminalSession } from '@kipuspay/adapters-d1';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';
import { loadActiveShards } from './offline-sale-route.js';

export function isOfflineSyncEnabled(env: WorkerEnv): boolean {
  return env.FEATURE_OFFLINE_SYNC !== '0';
}

function syncPreflight(
  env: WorkerEnv,
): { status: 404 | 503; body: Record<string, unknown> } | null {
  if (env.FEATURE_OFFLINE_SYNC === '0') {
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

type OptionalSaleCapability =
  | 'ledger.store_credit'
  | 'ledger.accounts_receivable'
  | 'pricing.promotions'
  | 'catalog.uom'
  | 'ledger.chart_of_accounts'
  | 'sales.installments'
  | 'sales.commissions'
  | 'inventory.scale'
  | 'inventory.batches'
  | 'inventory.bom'
  | 'pricing.lists';

async function resolveSaleCapabilities(
  env: WorkerEnv,
  tenantId: string,
): Promise<Record<OptionalSaleCapability, boolean>> {
  const resolver = new CapabilityResolver(env);
  const capabilities: readonly OptionalSaleCapability[] = [
    'ledger.store_credit',
    'ledger.accounts_receivable',
    'pricing.promotions',
    'catalog.uom',
    'ledger.chart_of_accounts',
    'sales.installments',
    'sales.commissions',
    'inventory.scale',
    'inventory.batches',
    'inventory.bom',
    'pricing.lists',
  ];
  const entries = await Promise.all(
    capabilities.map(async (capability) => {
      try {
        await resolver.require(tenantId, capability);
        return [capability, true] as const;
      } catch (error) {
        if (error instanceof CapabilityError && error.status === 404) {
          return [capability, false] as const;
        }
        throw error;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<OptionalSaleCapability, boolean>;
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

// eslint-disable-next-line complexity -- offline reconciliation outcome matrix
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
  try {
    await new CapabilityResolver(env).require(tenantId, 'pos.checkout');
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status,
        body: { error: error.code, code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return {
      status: 503,
      body: { error: 'Capabilities unavailable', code: 'CAPABILITIES_UNAVAILABLE' },
    };
  }
  let capabilityOptions: Record<OptionalSaleCapability, boolean>;
  try {
    capabilityOptions = await resolveSaleCapabilities(env, tenantId);
  } catch (error) {
    if (error instanceof CapabilityError) {
      return { status: error.status, body: { error: error.code, code: error.code } };
    }
    return {
      status: 503,
      body: { error: 'Capabilities unavailable', code: 'CAPABILITIES_UNAVAILABLE' },
    };
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
  const tenantKv = env.TENANT_KV;
  const kv = tenantKv
    ? {
        get: (key: string) => tenantKv.get(key),
        put: (key: string, value: string) =>
          tenantKv.put ? tenantKv.put(key, value) : Promise.resolve(),
        delete: (key: string) => (tenantKv.delete ? tenantKv.delete(key) : Promise.resolve()),
      }
    : undefined;
  const result = await processSyncSalesBatch(
    db,
    tenantId,
    userId,
    sales,
    nowMs,
    kv,
    capabilityOptions['ledger.store_credit'],
    terminalId.trim(),
    {
      analyticsEngine: env.ANALYTICS_ENGINE,
      activeShards: await loadActiveShards(env),
      ledgerArApEnabled: capabilityOptions['ledger.accounts_receivable'],
      pricingPromotionsEnabled: capabilityOptions['pricing.promotions'],
      catalogUomEnabled: capabilityOptions['catalog.uom'],
      ledgerChartOfAccountsEnabled: capabilityOptions['ledger.chart_of_accounts'],
      salesInstallmentsEnabled: capabilityOptions['sales.installments'],
      salesCommissionsEnabled: capabilityOptions['sales.commissions'],
      inventoryScaleEnabled: capabilityOptions['inventory.scale'],
      terminalId: terminalId.trim(),
      s18: {
        inventoryBatches: capabilityOptions['inventory.batches'],
        inventoryBom: capabilityOptions['inventory.bom'],
        pricingLists: capabilityOptions['pricing.lists'],
      },
    },
  );
  return { status: 200, body: { results: result.results } };
}
