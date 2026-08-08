export type CustomerOrderQueueStatus = 'PENDING' | 'RETRY' | 'CONFLICT';

export interface QueuedCustomerOrderFulfillment {
  readonly orderId: string;
  readonly branchId: string;
  readonly terminalId: string;
  readonly envelope: string;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
  readonly items: readonly { readonly itemId: string; readonly quantityMicrounits: number }[];
  readonly status: CustomerOrderQueueStatus;
  readonly attempts: number;
  readonly lastErrorCode?: string;
}

export interface CustomerOrderQueueStore {
  getAll(): Promise<readonly QueuedCustomerOrderFulfillment[]>;
  put(entry: QueuedCustomerOrderFulfillment): Promise<void>;
  delete(idempotencyKey: string): Promise<void>;
}

export function createMemoryCustomerOrderQueue(): CustomerOrderQueueStore {
  const records = new Map<string, QueuedCustomerOrderFulfillment>();
  return {
    getAll: () => Promise.resolve([...records.values()]),
    put(entry) {
      records.set(entry.idempotencyKey, structuredClone(entry));
      return Promise.resolve();
    },
    delete(idempotencyKey) {
      records.delete(idempotencyKey);
      return Promise.resolve();
    },
  };
}

function indexedDbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('CUSTOMER_ORDER_QUEUE_DB_FAILED'));
  });
}

export function createIndexedDbCustomerOrderQueue(
  indexedDb: IDBFactory = globalThis.indexedDB,
): CustomerOrderQueueStore {
  const open = indexedDb.open('kipuspay-customer-order-fulfillments', 1);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains('pending')) {
      open.result.createObjectStore('pending', { keyPath: 'idempotencyKey' });
    }
  };
  const database = indexedDbRequest(open);
  const store = async (mode: IDBTransactionMode) =>
    (await database).transaction('pending', mode).objectStore('pending');
  return {
    async getAll() {
      return indexedDbRequest((await store('readonly')).getAll()) as Promise<
        readonly QueuedCustomerOrderFulfillment[]
      >;
    },
    async put(entry) {
      await indexedDbRequest((await store('readwrite')).put(entry));
    },
    async delete(idempotencyKey) {
      await indexedDbRequest((await store('readwrite')).delete(idempotencyKey));
    },
  };
}

export class CustomerOrderFulfillmentQueue {
  constructor(
    private readonly store: CustomerOrderQueueStore,
    private readonly scope?: { readonly branchId: string; readonly terminalId: string },
  ) {}

  async enqueue(
    entry: Omit<QueuedCustomerOrderFulfillment, 'status' | 'attempts' | 'lastErrorCode'>,
  ): Promise<void> {
    if (
      this.scope &&
      (entry.branchId !== this.scope.branchId || entry.terminalId !== this.scope.terminalId)
    ) {
      throw new Error('CUSTOMER_ORDER_LEASE_SCOPE_MISMATCH');
    }
    if (
      !entry.orderId ||
      !entry.branchId ||
      !entry.terminalId ||
      !entry.envelope ||
      !entry.idempotencyKey ||
      !entry.items.length ||
      entry.items.some(
        (item) =>
          !item.itemId ||
          !Number.isSafeInteger(item.quantityMicrounits) ||
          item.quantityMicrounits <= 0,
      )
    ) {
      throw new Error('CUSTOMER_ORDER_QUEUE_ENTRY_INVALID');
    }
    await this.store.put({ ...entry, status: 'PENDING', attempts: 0 });
  }

  listPending(): Promise<readonly QueuedCustomerOrderFulfillment[]> {
    return this.store.getAll();
  }

  update(entry: QueuedCustomerOrderFulfillment): Promise<void> {
    return this.store.put(entry);
  }

  remove(idempotencyKey: string): Promise<void> {
    return this.store.delete(idempotencyKey);
  }
}

function failureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  if (error instanceof Error && error.message.startsWith('CUSTOMER_ORDER_')) return error.message;
  return 'CUSTOMER_ORDER_NETWORK_FAILED';
}

function isConflict(code: string): boolean {
  return [
    'CUSTOMER_ORDER_LEASE_INVALID',
    'CUSTOMER_ORDER_LEASE_CONFLICT',
    'CUSTOMER_ORDER_RESERVATION_EXPIRED',
  ].includes(code);
}

export async function reconcileCustomerOrderFulfillments(
  queue: CustomerOrderFulfillmentQueue,
  transport: {
    fulfill(entry: QueuedCustomerOrderFulfillment): Promise<{
      readonly status: string;
      readonly saleId?: string;
      readonly fulfillmentId?: string;
    }>;
  },
  options: { readonly now?: string } = {},
): Promise<{
  readonly succeeded: number;
  readonly failed: number;
  readonly expired: number;
  readonly conflicted: number;
}> {
  const now = Date.parse(options.now ?? new Date().toISOString());
  let succeeded = 0;
  let failed = 0;
  let expired = 0;
  let conflicted = 0;
  for (const entry of await queue.listPending()) {
    if (entry.status === 'CONFLICT') continue;
    if (Date.parse(entry.expiresAt) <= now) {
      expired += 1;
      conflicted += 1;
      await queue.update({
        ...entry,
        status: 'CONFLICT',
        lastErrorCode: 'CUSTOMER_ORDER_RESERVATION_EXPIRED',
      });
      continue;
    }
    try {
      const result = await transport.fulfill(entry);
      if (result.status !== 'SUCCESS') throw new Error('CUSTOMER_ORDER_LEASE_CONFLICT');
      await queue.remove(entry.idempotencyKey);
      succeeded += 1;
    } catch (error) {
      const code = failureCode(error);
      const conflict = isConflict(code);
      await queue.update({
        ...entry,
        status: conflict ? 'CONFLICT' : 'RETRY',
        attempts: entry.attempts + 1,
        lastErrorCode: code,
      });
      if (conflict) conflicted += 1;
      else failed += 1;
    }
  }
  return { succeeded, failed, expired, conflicted };
}
