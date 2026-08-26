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
  /** Denormalized branchId para índice por sucursal (§5.5 branch_document_series). Opcional para compatibilidad con registros pre-migración. */
  readonly branchId?: string;
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
        branchId: payload.branchId,
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

  async listPendingByBranch(branchId: string): Promise<readonly OfflineQueueRecord[]> {
    const all = await this.listPending();
    return all.filter((r) => r.branchId === branchId || r.payload.branchId === branchId);
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

function isOfflineQueueRecord(value: unknown): value is OfflineQueueRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const payload = v.payload as Record<string, unknown> | null;
  const branchId = v.branchId;
  const payloadBranch = payload?.branchId;
  return (
    typeof v.offlineSaleId === 'string' &&
    typeof v.payload === 'object' &&
    v.payload !== null &&
    (v.status === 'PENDING' || v.status === 'RETRY') &&
    typeof v.enqueuedAtMs === 'number' &&
    (typeof branchId === 'string' || typeof payloadBranch === 'string')
  );
}

/**
 * F6-1: adaptador IndexedDB nativo (zero-dep, Web Platform) para la cola de
 * ventas offline en producción. Fallback a memoria si no hay browser IDB
 * (SSR/Node/tests). Sigue el patrón probado de print-outbox-store.
 */
export function createBrowserOfflineIdb(dbName = 'kipus_offline_sales'): OfflineIdbPort {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return createMemoryOfflineIdb();
  }
  const storeName = 'offline_sales';
  const openDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName);
        } else {
          const tx = req.transaction!;
          store = tx.objectStore(storeName);
        }
        // §5.5: índice por sucursal para drenaje/observabilidad por branch
        if (!store.indexNames.contains('by_branch')) {
          store.createIndex('by_branch', 'branchId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IDB_OPEN_FAILED'));
    });
  };

  return {
    async get(key) {
      const db = await openDb();
      return new Promise<OfflineQueueRecord | undefined>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key) as unknown as IDBRequest<unknown>;
        req.onsuccess = () => {
          const result: unknown = req.result;
          if (result === undefined || isOfflineQueueRecord(result)) {
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
      // Sin StorageManager: estimación por tamaño serializado de las claves.
      const keys = await this.keys();
      let usage = 0;
      for (const key of keys) {
        const row = await this.get(key);
        if (row) usage += JSON.stringify(row).length;
      }
      return { usage, quota: 10_000_000 };
    },
  };
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
      const usage = [...store.values()].reduce((total, record) => {
        const serialized: unknown = JSON.stringify(record);
        return total + (typeof serialized === 'string' ? serialized.length : 0);
      }, 0);
      return Promise.resolve({ usage, quota });
    },
  };
}
