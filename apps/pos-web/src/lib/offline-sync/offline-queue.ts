/**
 * Cola offline IndexedDB — claves offline/{offlineSaleId}.
 * Zero-dep: IDB nativo; injectable para tests.
 */
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import { evaluateQuota, type QuotaEstimate, type QuotaVerdict } from './quota-guardian.js';

export type OfflineQueueStatus = 'PENDING' | 'RETRY';

export interface OfflineQueueRecord {
  readonly offlineSaleId: string;
  readonly payload: OfflineSalePayload;
  readonly status: OfflineQueueStatus;
  readonly enqueuedAtMs: number;
}

export interface OfflineIdbPort {
  get(key: string): Promise<OfflineQueueRecord | undefined>;
  set(key: string, value: OfflineQueueRecord): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
  estimate(): Promise<QuotaEstimate>;
}

export class OfflineQueueBlockedError extends Error {
  readonly verdict: QuotaVerdict;
  constructor(verdict: QuotaVerdict) {
    super(verdict.message);
    this.name = 'OfflineQueueBlockedError';
    this.verdict = verdict;
  }
}

export class OfflineQueueStore {
  constructor(private readonly idb: OfflineIdbPort) {}

  async enqueue(payload: OfflineSalePayload): Promise<QuotaVerdict> {
    const estimate = await this.idb.estimate();
    const verdict = evaluateQuota(estimate);
    if (!verdict.canEnqueue) {
      throw new OfflineQueueBlockedError(verdict);
    }
    const key = `offline/${payload.offlineSaleId}`;
    try {
      await this.idb.set(key, {
        offlineSaleId: payload.offlineSaleId,
        payload,
        status: 'PENDING',
        enqueuedAtMs: Date.now(),
      });
    } catch (error) {
      if (isQuotaExceeded(error)) {
        throw new OfflineQueueBlockedError(
          evaluateQuota({ usage: estimate.quota, quota: estimate.quota }),
        );
      }
      throw error;
    }
    return verdict;
  }

  async listPending(): Promise<readonly OfflineQueueRecord[]> {
    const keys = await this.idb.keys();
    const out: OfflineQueueRecord[] = [];
    for (const key of keys) {
      if (!key.startsWith('offline/')) continue;
      const row = await this.idb.get(key);
      if (row && (row.status === 'PENDING' || row.status === 'RETRY')) out.push(row);
    }
    return out.sort((a, b) => a.enqueuedAtMs - b.enqueuedAtMs);
  }

  async del(offlineSaleId: string): Promise<void> {
    await this.idb.del(`offline/${offlineSaleId}`);
  }

  async markRetry(offlineSaleId: string): Promise<void> {
    const key = `offline/${offlineSaleId}`;
    const row = await this.idb.get(key);
    if (!row) return;
    await this.idb.set(key, { ...row, status: 'RETRY' });
  }
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'QuotaExceededError') ||
    (error instanceof Error && /QuotaExceeded/i.test(error.name + error.message))
  );
}

/** Fake IDB en memoria para unit/chaos. */
export function createMemoryOfflineIdb(opts?: {
  readonly quota?: number;
  readonly failOnSet?: boolean;
}): OfflineIdbPort & { readonly store: Map<string, OfflineQueueRecord> } {
  const store = new Map<string, OfflineQueueRecord>();
  const quota = opts?.quota ?? 10_000_000;
  return {
    store,
    get(key) {
      return Promise.resolve(store.get(key));
    },
    set(key, value) {
      if (opts?.failOnSet) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        return Promise.reject(err);
      }
      store.set(key, value);
      return Promise.resolve();
    },
    del(key) {
      store.delete(key);
      return Promise.resolve();
    },
    keys() {
      return Promise.resolve([...store.keys()]);
    },
    estimate() {
      const usage = [...store.values()].reduce((n, r) => n + JSON.stringify(r).length, 0);
      return Promise.resolve({ usage, quota });
    },
  };
}
