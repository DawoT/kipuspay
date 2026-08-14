/**
 * processSyncSalesBatch — POST /v1/sync/sales (SYN-07).
 * Ack per-venta; un FAILED no tumba el resto del chunk.
 */
import { consolidateLocalClientProfiles, type OfflineSalePayload } from '@kipuspay/domain-sales';
import {
  processOfflineSaleAtomic,
  type OfflineSaleResult,
  type ProcessOfflineSaleOptions,
} from './process-offline-sale-atomic.js';
import type { InsightsKv } from './rollup-rematerialize.js';

type D1DatabaseLike = Parameters<typeof processOfflineSaleAtomic>[0];

export type SyncSaleAckStatus = 'SUCCESS' | 'ALREADY_SYNCED' | 'FAILED';

export interface SyncSaleAck {
  readonly offlineSaleId: string;
  readonly status: SyncSaleAckStatus;
  readonly code?: string;
  readonly saleId?: string;
}

export interface SyncSalesBatchResult {
  readonly results: readonly SyncSaleAck[];
}

function mapFailure(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120);
  return 'SYNC_FAILED';
}

export async function processSyncSalesBatch(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  sales: readonly OfflineSalePayload[],
  nowMs: number = Date.now(),
  insightsKv?: InsightsKv,
  storeCreditEnabled = false,
  terminalId = '',
  baseOptions: ProcessOfflineSaleOptions = {},
): Promise<SyncSalesBatchResult> {
  const consolidated = consolidateLocalClientProfiles(sales);
  const results: SyncSaleAck[] = [];

  for (const sale of consolidated) {
    try {
      if (sale.useStoreCredit === true) {
        results.push({
          offlineSaleId: sale.offlineSaleId,
          status: 'FAILED',
          code: 'STORE_CREDIT_OFFLINE',
        });
        continue;
      }
      const opts: {
        nowMs: number;
        storeCreditEnabled: boolean;
        storeCreditOnline: false;
        serialAssignments: {
          productId: string;
          serialId: string;
          terminalId: string;
          leaseToken: string;
        }[];
        insightsKv?: InsightsKv;
      } = {
        ...baseOptions,
        nowMs,
        storeCreditEnabled,
        storeCreditOnline: false,
        serialAssignments: sale.items
          .filter((item) => item.serialId && item.serialLeaseToken)
          .map((item) => ({
            productId: item.productId,
            serialId: item.serialId!,
            terminalId,
            leaseToken: item.serialLeaseToken!,
          })),
      };
      if (insightsKv) opts.insightsKv = insightsKv;
      const outcome: OfflineSaleResult = await processOfflineSaleAtomic(
        db,
        tenantId,
        userId,
        sale,
        opts,
      );
      if (outcome.status === 'ALREADY_SYNCED') {
        results.push({
          offlineSaleId: sale.offlineSaleId,
          status: 'ALREADY_SYNCED',
          saleId: outcome.saleId,
        });
      } else {
        results.push({
          offlineSaleId: sale.offlineSaleId,
          status: 'SUCCESS',
          saleId: outcome.saleId,
        });
      }
    } catch (error) {
      console.error('SYNC_SALE_FAILED', sale.offlineSaleId, error);
      results.push({
        offlineSaleId: sale.offlineSaleId,
        status: 'FAILED',
        code: mapFailure(error),
      });
    }
  }

  return { results };
}
