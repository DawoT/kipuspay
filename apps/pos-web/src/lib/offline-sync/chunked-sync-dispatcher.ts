/**
 * Chunked Sync Dispatcher — CHUNK_SIZE=30, backoff+jitter, checkpoint (SYN-07).
 */
import { consolidateLocalClientProfiles, type OfflineSalePayload } from '@kipuspay/domain-sales';
import type { OfflineQueueStore } from './offline-queue.js';

export const CHUNK_SIZE = 30;
export const BACKOFF_BASE_MS = 500;
export const MAX_ATTEMPTS = 5;

export type SyncAckStatus = 'SUCCESS' | 'ALREADY_SYNCED' | 'FAILED';

export interface SyncAck {
  readonly offlineSaleId: string;
  readonly status: SyncAckStatus;
}

export interface SyncTransport {
  postSales(sales: readonly OfflineSalePayload[]): Promise<{ results: readonly SyncAck[] }>;
}

export interface DispatchReport {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
}

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchPendingSalesChunked(
  queue: OfflineQueueStore,
  transport: SyncTransport,
  opts?: { readonly maxAttempts?: number; readonly sleepFn?: (ms: number) => Promise<void> },
): Promise<DispatchReport> {
  const pending = await queue.listPending();
  const payloads = consolidateLocalClientProfiles(pending.map((p) => p.payload));
  const chunks = chunkArray(payloads, CHUNK_SIZE);
  const report = { total: payloads.length, succeeded: 0, failed: 0 };
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS;
  const wait = opts?.sleepFn ?? sleep;

  for (const chunk of chunks) {
    let attempt = 0;
    while (true) {
      try {
        const { results } = await transport.postSales(chunk);
        for (const r of results) {
          if (r.status === 'SUCCESS' || r.status === 'ALREADY_SYNCED') {
            report.succeeded++;
            await queue.del(r.offlineSaleId);
          } else {
            report.failed++;
            await queue.markRetry(r.offlineSaleId);
          }
        }
        break;
      } catch {
        if (attempt >= maxAttempts) {
          report.failed += chunk.length;
          for (const sale of chunk) await queue.markRetry(sale.offlineSaleId);
          break;
        }
        await wait(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 100);
        attempt++;
      }
    }
  }

  return report;
}
