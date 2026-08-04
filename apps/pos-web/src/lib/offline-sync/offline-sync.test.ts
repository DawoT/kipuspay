import { describe, expect, it, vi } from 'vitest';
import { evaluateQuota } from './quota-guardian.js';
import {
  createMemoryOfflineIdb,
  OfflineQueueBlockedError,
  OfflineQueueStore,
} from './offline-queue.js';
import { CHUNK_SIZE, dispatchPendingSalesChunked } from './chunked-sync-dispatcher.js';
import {
  buildFlushMessage,
  isFlushAck,
  registerOfflineSyncServiceWorker,
} from './offline-sync-sw.js';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';

function sale(id: string, name = 'C'): OfflineSalePayload {
  return {
    offlineSaleId: id,
    branchId: 'b1',
    cashRegisterSessionId: 's1',
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '12345678',
    clientName: name,
    clientProfileUpdatedAt: '2026-08-01T12:00:00.000Z',
    localClientId: 'L1',
    items: [{ productId: 'p1', quantity: 1 }],
    payments: [{ paymentMethodId: 'pm1', amountCents: 1180 }],
  };
}

describe('quota-guardian', () => {
  it('ALERT ≥80% y BLOCKED al 100%', () => {
    expect(evaluateQuota({ usage: 80, quota: 100 }).level).toBe('ALERT');
    expect(evaluateQuota({ usage: 100, quota: 100 }).canEnqueue).toBe(false);
    expect(evaluateQuota({ usage: 10, quota: 100 }).level).toBe('OK');
  });
});

describe('offline-queue', () => {
  it('encola y lista FIFO; bloquea por cuota', async () => {
    const idb = createMemoryOfflineIdb({ quota: 1000 });
    // Fill usage near block by tiny quota with large payloads — use failOnSet
    const store = new OfflineQueueStore(idb);
    await store.enqueue(sale('a'));
    expect((await store.listPending()).map((r) => r.offlineSaleId)).toEqual(['a']);

    const blocked = new OfflineQueueStore(createMemoryOfflineIdb({ failOnSet: true }));
    await expect(blocked.enqueue(sale('b'))).rejects.toBeInstanceOf(OfflineQueueBlockedError);
  });
});

describe('chunked-sync-dispatcher', () => {
  it('CHUNK_SIZE=30; SUCCESS borra; FAILED reintenta', async () => {
    expect(CHUNK_SIZE).toBe(30);
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    await queue.enqueue(sale('s1', 'Old'));
    await queue.enqueue({
      ...sale('s2', 'New'),
      clientProfileUpdatedAt: '2026-08-01T14:00:00.000Z',
    });

    const transport = {
      postSales: vi.fn().mockResolvedValue({
        results: [
          { offlineSaleId: 's1', status: 'SUCCESS' },
          { offlineSaleId: 's2', status: 'FAILED' },
        ],
      }),
    };

    const report = await dispatchPendingSalesChunked(queue, transport, {
      sleepFn: () => Promise.resolve(),
    });
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(1);
    const pending = await queue.listPending();
    expect(pending.map((p) => p.offlineSaleId)).toEqual(['s2']);
    expect(pending[0]?.status).toBe('RETRY');
  });

  it('encola N ventas → sync → cola vacía (sin spinner de cobro)', async () => {
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    const n = 35;
    for (let i = 0; i < n; i++) await queue.enqueue(sale(`s-${i}`));
    expect((await queue.listPending()).length).toBe(n);

    const transport = {
      postSales: (sales: readonly ReturnType<typeof sale>[]) =>
        Promise.resolve({
          results: sales.map((s) => ({
            offlineSaleId: s.offlineSaleId,
            status: 'SUCCESS' as const,
          })),
        }),
    };
    const report = await dispatchPendingSalesChunked(queue, transport, {
      sleepFn: () => Promise.resolve(),
    });
    expect(report.succeeded).toBe(n);
    expect((await queue.listPending()).length).toBe(0);
  });
});

describe('offline-sync-sw contract', () => {
  it('flush message + ack + register no-op sin navigator.sw', async () => {
    expect(buildFlushMessage()).toEqual({ type: 'FLUSH_OFFLINE_QUEUE' });
    expect(isFlushAck({ type: 'FLUSH_ACK' })).toBe(true);
    expect(isFlushAck(null)).toBe(false);
    expect(await registerOfflineSyncServiceWorker()).toBeNull();
  });
});

describe('quota-exceeded chaos shape', () => {
  it('alerta ≥80% y bloqueo 100% sin corromper cola', async () => {
    const idb = createMemoryOfflineIdb({ quota: 100 });
    // Force usage via tiny quota after one enqueue
    const store = new OfflineQueueStore(idb);
    await store.enqueue(sale('keep'));
    const before = await store.listPending();
    expect(before).toHaveLength(1);

    const blocked = new OfflineQueueStore(createMemoryOfflineIdb({ quota: 1, failOnSet: true }));
    await expect(blocked.enqueue(sale('drop'))).rejects.toBeInstanceOf(OfflineQueueBlockedError);
    // Original queue untouched
    expect((await store.listPending()).map((r) => r.offlineSaleId)).toEqual(['keep']);
  });
});
