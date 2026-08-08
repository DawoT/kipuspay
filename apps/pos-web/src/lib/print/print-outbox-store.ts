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
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
    (error instanceof Error &&
      /(QuotaExceeded|NS_ERROR_DOM_QUOTA_REACHED)/i.test(error.name + error.message))
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
      const usage = [...store.values()].reduce((total, record) => {
        const serialized: unknown = JSON.stringify(record);
        return total + (typeof serialized === 'string' ? serialized.length : 0);
      }, 0);
      return Promise.resolve({ usage, quota });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrintTicketSnapshot(value: unknown): value is PrintJobRecord['ticket'] {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return (
    typeof value.enterprise === 'string' &&
    typeof value.ruc === 'string' &&
    typeof value.documentType === 'string' &&
    typeof value.series === 'string' &&
    typeof value.number === 'number' &&
    typeof value.totalCents === 'number' &&
    typeof value.lineWidth === 'number' &&
    value.items.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        typeof item.qty === 'number' &&
        typeof item.totalCents === 'number',
    ) &&
    (value.digestValue === undefined || typeof value.digestValue === 'string') &&
    (value.qrPayload === undefined || typeof value.qrPayload === 'string')
  );
}

function hasPrintJobIdentity(value: Record<string, unknown>): boolean {
  return (
    (value.jobId === undefined || typeof value.jobId === 'string') &&
    (value.kind === undefined || value.kind === 'SALE_TICKET') &&
    (value.blocksCashClose === undefined || value.blocksCashClose === true) &&
    typeof value.saleId === 'string' &&
    isPrintTicketSnapshot(value.ticket)
  );
}

function hasPrintJobState(value: Record<string, unknown>): boolean {
  const validStatus =
    value.status === 'PENDING' || value.status === 'PRINTED' || value.status === 'FAILED';
  const validAdapter =
    value.preferredAdapter === null ||
    value.preferredAdapter === 'webusb' ||
    value.preferredAdapter === 'wss_lan' ||
    value.preferredAdapter === 'bluetooth' ||
    value.preferredAdapter === 'system_print' ||
    value.preferredAdapter === 'whatsapp';
  return (
    (value.escPosBase64 === null || typeof value.escPosBase64 === 'string') &&
    validStatus &&
    validAdapter &&
    (value.lastError === null || typeof value.lastError === 'string')
  );
}

function isPrintJobRecord(value: unknown): value is PrintJobRecord {
  if (!isRecord(value)) return false;
  return (
    hasPrintJobIdentity(value) &&
    hasPrintJobState(value) &&
    typeof value.enqueuedAtMs === 'number' &&
    typeof value.updatedAtMs === 'number'
  );
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
      return new Promise<PrintJobRecord | undefined>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key) as unknown as IDBRequest<unknown>;
        req.onsuccess = () => {
          const result: unknown = req.result;
          if (result === undefined || isPrintJobRecord(result)) {
            resolve(result);
            return;
          }
          reject(new Error('IDB_GET_DATA_INVALID'));
        };
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
      return new Promise<readonly string[]>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).getAllKeys() as unknown as IDBRequest<unknown>;
        req.onsuccess = () => {
          const result: unknown = req.result;
          if (!Array.isArray(result) || !result.every((key: unknown) => typeof key === 'string')) {
            reject(new Error('IDB_KEYS_DATA_INVALID'));
            return;
          }
          resolve(result);
        };
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
