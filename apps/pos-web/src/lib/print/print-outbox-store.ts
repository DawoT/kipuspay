/**
 * Print outbox IndexedDB — claves print_jobs/{saleId} (§7.5).
 */
import {
  assertPrintJobTransition,
  countBlockingPrintJobs,
  printJobKey,
  type PrintJobRecord,
  type PrintOutboxPort,
} from '@kipuspay/print-templates';
import {
  evaluateQuota,
  type QuotaEstimate,
  type QuotaVerdict,
} from '../offline-sync/quota-guardian.js';

export interface PrintIdbPort {
  get(key: string): Promise<PrintJobRecord | undefined>;
  set(key: string, value: PrintJobRecord): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
  estimate(): Promise<QuotaEstimate>;
}

export class PrintOutboxBlockedError extends Error {
  readonly verdict: QuotaVerdict;
  constructor(verdict: QuotaVerdict) {
    super(verdict.message);
    this.name = 'PrintOutboxBlockedError';
    this.verdict = verdict;
  }
}

export class PrintOutboxStore implements PrintOutboxPort {
  constructor(private readonly idb: PrintIdbPort) {}

  async enqueue(job: PrintJobRecord): Promise<void> {
    const estimate = await this.idb.estimate();
    const verdict = evaluateQuota(estimate);
    if (!verdict.canEnqueue) throw new PrintOutboxBlockedError(verdict);
    const key = printJobKey(job.saleId);
    try {
      await this.idb.set(key, { ...job, status: 'PENDING' });
    } catch (error) {
      if (isQuotaExceeded(error)) {
        throw new PrintOutboxBlockedError(
          evaluateQuota({ usage: estimate.quota, quota: estimate.quota }),
        );
      }
      throw error;
    }
  }

  async get(saleId: string): Promise<PrintJobRecord | undefined> {
    return this.idb.get(printJobKey(saleId));
  }

  async listBlocking(): Promise<readonly PrintJobRecord[]> {
    const keys = await this.idb.keys();
    const out: PrintJobRecord[] = [];
    for (const key of keys) {
      if (!key.startsWith('print_jobs/')) continue;
      const row = await this.idb.get(key);
      if (row && (row.status === 'PENDING' || row.status === 'FAILED')) out.push(row);
    }
    return out.sort((a, b) => a.enqueuedAtMs - b.enqueuedAtMs);
  }

  async pendingCount(): Promise<number> {
    return countBlockingPrintJobs(await this.listBlocking());
  }

  async markPrinted(saleId: string): Promise<void> {
    const row = await this.get(saleId);
    if (!row) return;
    assertPrintJobTransition(row.status, 'PRINTED');
    await this.idb.set(printJobKey(saleId), {
      ...row,
      status: 'PRINTED',
      updatedAtMs: Date.now(),
      lastError: null,
    });
  }

  async markFailed(saleId: string, error: string): Promise<void> {
    const row = await this.get(saleId);
    if (!row) return;
    if (row.status === 'PRINTED') return;
    if (row.status === 'PENDING') assertPrintJobTransition('PENDING', 'FAILED');
    await this.idb.set(printJobKey(saleId), {
      ...row,
      status: 'FAILED',
      lastError: error,
      updatedAtMs: Date.now(),
    });
  }

  async ackDelete(saleId: string): Promise<void> {
    await this.idb.del(printJobKey(saleId));
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

/** Fake IDB para unit/chaos (sobrevive “F5” si se reusa el Map). */
export function createMemoryPrintIdb(opts?: {
  readonly quota?: number;
  readonly failOnSet?: boolean;
}): PrintIdbPort & { readonly store: Map<string, PrintJobRecord> } {
  const store = new Map<string, PrintJobRecord>();
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

/** Adaptador nativo de browser IndexedDB para producción web (fallback a memoria si SSR/Node). */
export function createBrowserPrintIdb(dbName = 'kipus_print_outbox'): PrintIdbPort {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return createMemoryPrintIdb();
  }
  const storeName = 'print_jobs';
  const openDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IDB_OPEN_FAILED'));
    });
  };

  return {
    async get(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as PrintJobRecord | undefined);
        req.onerror = () => reject(req.error ?? new Error('IDB_GET_FAILED'));
      });
    },
    async set(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IDB_SET_FAILED'));
      });
    },
    async del(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IDB_DEL_FAILED'));
      });
    },
    async keys() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).getAllKeys();
        req.onsuccess = () => resolve((req.result as string[]).map(String));
        req.onerror = () => reject(req.error ?? new Error('IDB_KEYS_FAILED'));
      });
    },
    async estimate() {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 10_000_000 };
      }
      return { usage: 0, quota: 10_000_000 };
    },
  };
}
