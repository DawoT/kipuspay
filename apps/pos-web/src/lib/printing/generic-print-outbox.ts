export type GenericPrintJobKind = 'SALE_TICKET' | 'PRICE_LABEL_BATCH';
export type GenericPrintItemStatus = 'PENDING' | 'ACKNOWLEDGED' | 'FAILED';

export interface GenericPrintItem {
  readonly itemId: string;
  readonly payload: Uint8Array;
}

export interface GenericPrintJobInput {
  readonly jobId: string;
  readonly kind: GenericPrintJobKind;
  readonly items: readonly GenericPrintItem[];
  readonly blocksCashClose?: boolean;
}

interface StoredPrintItem {
  readonly itemId: string;
  readonly payload: Uint8Array;
  readonly status: GenericPrintItemStatus;
  readonly lastError: string | null;
}

interface StoredPrintJob {
  readonly jobId: string;
  readonly kind: GenericPrintJobKind;
  readonly blocksCashClose: boolean;
  readonly items: readonly StoredPrintItem[];
}

type PrintStorage = Map<string, StoredPrintJob>;

export interface GenericPrintOutbox {
  enqueue(job: GenericPrintJobInput): Promise<void>;
  acknowledge(jobId: string, itemId: string): Promise<void>;
  markFailed(jobId: string, itemId: string, error: string): Promise<void>;
  pendingItemIds(jobId: string): Promise<readonly string[]>;
  countCashBlockingJobs(): number;
  canCloseCashRegister(): boolean;
  quotaState(): 'OK' | 'WARNING' | 'EXHAUSTED';
  hasCorruption(): Promise<boolean>;
}

const keyFor = (jobId: string) => `print_jobs/${jobId}`;

function payloadBytes(job: GenericPrintJobInput): number {
  return job.items.reduce((total, item) => total + item.payload.byteLength, 0);
}

export function createGenericPrintOutbox(input: {
  readonly storage: Map<unknown, unknown>;
  readonly quota?: { readonly usage: number; readonly quota: number };
  readonly persistence?: {
    set(key: string, value: StoredPrintJob): Promise<void>;
  };
}): GenericPrintOutbox {
  const storage = input.storage as PrintStorage;
  const quota = input.quota ?? { usage: 0, quota: Number.MAX_SAFE_INTEGER };

  const get = (jobId: string) => storage.get(keyFor(jobId));
  const active = (job: StoredPrintJob) =>
    job.items.some((item) => item.status === 'PENDING' || item.status === 'FAILED');

  return {
    enqueue(job) {
      if (!job.jobId.trim()) return Promise.reject(new Error('PRINT_JOB_ID_EMPTY'));
      const nextUsage = quota.usage + payloadBytes(job);
      if (quota.quota <= 0 || nextUsage > quota.quota) {
        return Promise.reject(new Error('PRINT_OUTBOX_QUOTA_EXCEEDED'));
      }
      const stored: StoredPrintJob = {
        jobId: job.jobId,
        kind: job.kind,
        blocksCashClose: job.blocksCashClose ?? job.kind === 'SALE_TICKET',
        items: job.items.map((item) => ({
          itemId: item.itemId,
          payload: item.payload.slice(),
          status: 'PENDING',
          lastError: null,
        })),
      };
      const key = keyFor(job.jobId);
      const previous = storage.get(key);
      storage.set(key, stored);
      return input.persistence?.set(key, stored).catch((error: unknown) => {
        if (previous) storage.set(key, previous);
        else storage.delete(key);
        if (isQuotaExceeded(error)) throw new Error('PRINT_OUTBOX_QUOTA_EXCEEDED');
        throw error;
      }) ?? Promise.resolve();
    },
    acknowledge(jobId, itemId) {
      const job = get(jobId);
      if (!job) return Promise.resolve();
      const next = {
        ...job,
        items: job.items.map((item) =>
          item.itemId === itemId
            ? { ...item, status: 'ACKNOWLEDGED' as const, lastError: null }
            : item,
        ),
      };
      storage.set(keyFor(jobId), next);
      return input.persistence?.set(keyFor(jobId), next) ?? Promise.resolve();
    },
    markFailed(jobId, itemId, error) {
      const job = get(jobId);
      if (!job) return Promise.resolve();
      const next = {
        ...job,
        items: job.items.map((item) =>
          item.itemId === itemId ? { ...item, status: 'FAILED' as const, lastError: error } : item,
        ),
      };
      storage.set(keyFor(jobId), next);
      return input.persistence?.set(keyFor(jobId), next) ?? Promise.resolve();
    },
    pendingItemIds(jobId) {
      return Promise.resolve(
        get(jobId)?.items
          .filter((item) => item.status !== 'ACKNOWLEDGED')
          .map((item) => item.itemId) ?? []
      );
    },
    countCashBlockingJobs() {
      let count = 0;
      for (const value of storage.values()) {
        if (value.blocksCashClose && active(value)) count += 1;
      }
      return count;
    },
    canCloseCashRegister() {
      for (const value of storage.values()) {
        if (value.blocksCashClose && active(value)) return false;
      }
      return true;
    },
    quotaState() {
      if (quota.quota <= 0 || quota.usage >= quota.quota) return 'EXHAUSTED';
      return quota.usage / quota.quota >= 0.8 ? 'WARNING' : 'OK';
    },
    hasCorruption() {
      for (const value of storage.values()) {
        if (!value.jobId || !Array.isArray(value.items)) return Promise.resolve(true);
      }
      return Promise.resolve(false);
    },
  };
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(QuotaExceeded|NS_ERROR_DOM_QUOTA_REACHED)/i.test(`${error.name}${error.message}`)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredPrintItem(value: unknown): value is StoredPrintItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.itemId === 'string' &&
    value.payload instanceof Uint8Array &&
    ['PENDING', 'ACKNOWLEDGED', 'FAILED'].includes(String(value.status)) &&
    (value.lastError === null || typeof value.lastError === 'string')
  );
}

function isStoredPrintJob(value: unknown): value is StoredPrintJob {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return (
    typeof value.jobId === 'string' &&
    ['SALE_TICKET', 'PRICE_LABEL_BATCH'].includes(String(value.kind)) &&
    typeof value.blocksCashClose === 'boolean' &&
    value.items.every((item: unknown) => isStoredPrintItem(item))
  );
}

/** Opens and hydrates the production IndexedDB outbox before exposing synchronous close-Z counts. */
export async function createBrowserGenericPrintOutbox(
  dbName = 'kipus_print_outbox',
): Promise<GenericPrintOutbox> {
  if (typeof indexedDB === 'undefined') {
    return createGenericPrintOutbox({ storage: new Map() });
  }
  const storeName = 'generic_print_jobs';
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request: IDBOpenDBRequest = indexedDB.open(dbName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('PRINT_OUTBOX_IDB_OPEN_FAILED'));
  });
  const rows = await new Promise<StoredPrintJob[]>((resolve, reject) => {
    const request = db['transaction'](storeName, 'readonly')
      .objectStore(storeName)
      .getAll() as IDBRequest<unknown>;
    request.onsuccess = () => {
      const result: unknown = request.result;
      if (!Array.isArray(result) || !result.every((row: unknown) => isStoredPrintJob(row))) {
        reject(new Error('PRINT_OUTBOX_IDB_DATA_INVALID'));
        return;
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error ?? new Error('PRINT_OUTBOX_IDB_READ_FAILED'));
  });
  const storage = new Map<string, StoredPrintJob>(
    rows.map((row) => [keyFor(row.jobId), row]),
  );
  const estimate =
    typeof navigator !== 'undefined' && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : { usage: 0, quota: Number.MAX_SAFE_INTEGER };

  return createGenericPrintOutbox({
    storage,
    quota: {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? Number.MAX_SAFE_INTEGER,
    },
    persistence: {
      set(key, value) {
        return new Promise<void>((resolve, reject) => {
          const request = db['transaction'](storeName, 'readwrite')
            .objectStore(storeName)
            .put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(request.error ?? new Error('PRINT_OUTBOX_IDB_WRITE_FAILED'));
        });
      },
    },
  });
}
