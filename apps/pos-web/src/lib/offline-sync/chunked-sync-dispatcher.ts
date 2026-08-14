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

/**
 * F6-2: SyncTransport HTTP real contra POST /api/v1/sync/sales.
 * fetchImpl inyectable para tests; bearer token opcional.
 */
export function createHttpSyncTransport(opts: {
  readonly endpointUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly bearerToken?: string;
  readonly tenantId?: string;
}): SyncTransport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async postSales(sales) {
      const res = await fetchImpl(opts.endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.bearerToken ? { authorization: `Bearer ${opts.bearerToken}` } : {}),
          ...(opts.tenantId ? { 'x-tenant-id': opts.tenantId } : {}),
        },
        body: JSON.stringify({ sales }),
      });
      if (!res.ok) {
        throw new Error(`SYNC_HTTP_${res.status}`);
      }
      const body = (await res.json()) as { results?: unknown };
      const results = body.results;
      if (!Array.isArray(results)) {
        throw new Error('SYNC_HTTP_BAD_SHAPE');
      }
      const validated = results.filter(
        (r): r is SyncAck =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as SyncAck).offlineSaleId === 'string' &&
          ((r as SyncAck).status === 'SUCCESS' ||
            (r as SyncAck).status === 'ALREADY_SYNCED' ||
            (r as SyncAck).status === 'FAILED'),
      );
      // Fail-closed: sin acks válidos para el payload enviado, la respuesta
      // no es de fiar → el dispatcher reintentará (nunca borra por error).
      if (validated.length === 0 && results.length > 0) {
        throw new Error('SYNC_HTTP_BAD_SHAPE');
      }
      return { results: validated };
    },
  };
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
