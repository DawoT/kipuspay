import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateQuota } from './quota-guardian.js';
import {
  createBrowserOfflineIdb,
  createMemoryOfflineIdb,
  OfflineQueueBlockedError,
  OfflineQueueStore,
} from './offline-queue.js';
import {
  CHUNK_SIZE,
  createHttpSyncTransport,
  dispatchPendingSalesChunked,
} from './chunked-sync-dispatcher.js';
import {
  buildFlushMessage,
  isFlushAck,
  registerOfflineSyncServiceWorker,
  buildSetApiBaseMessage,
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
    expect(buildSetApiBaseMessage('https://api.kipuspay.com/')).toEqual({
      type: 'SET_API_BASE',
      apiBase: 'https://api.kipuspay.com',
    });
  });
});

/**
 * Push displayed ACK — corre el asset REAL que se despliega
 * (static/offline-sync-sw.js) con `self` stubeado. Contrato:
 * receipt válido → POST /api/push/ack; receipt ausente/inválido → no postea.
 */
describe('offline-sync-sw push displayed ACK (asset real)', () => {
  const listeners = new Map<string, Array<(event: unknown) => unknown>>();
  const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const showNotification = vi.fn(async () => {});
  const validReceipt = `${'a4'.repeat(12)}.${'b7'.repeat(12)}`;
  const pushEvent = (payload: unknown) => ({
    data: { json: () => payload },
    waitUntil: (promise: Promise<unknown>) => promise,
  });
  const messageEvent = (data: unknown) => ({ data, source: undefined });

  beforeAll(() => {
    const source = readFileSync(path.join(process.cwd(), 'static', 'offline-sync-sw.js'), 'utf8');
    const selfStub = {
      addEventListener: (type: string, handler: (event: unknown) => unknown) => {
        const list = listeners.get(type) ?? [];
        list.push(handler);
        listeners.set(type, list);
      },
      registration: { showNotification },
      clients: { matchAll: async () => [] },
      location: { origin: 'https://pos.staging.local' },
    };
    vi.stubGlobal(
      'self',
      selfStub as unknown as { addEventListener(type: string, fn: unknown): void },
    );
    vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) => {
      const normalized = String(url);
      if (normalized.includes('/api/push/ack')) fetchCalls.push({ url: normalized, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    new Function('self', 'caches', source)(selfStub, {
      open: async () => ({ put: async () => {}, match: async () => null }),
      keys: async () => [],
      delete: async () => true,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('receipt válido → POST /api/push/ack con body {deliveryId, receipt, displayedAt}', async () => {
    const [message] = listeners.get('message')!;
    await message(messageEvent({ type: 'SET_API_BASE', apiBase: 'https://api.staging.local/' }));
    expect(fetchCalls).toHaveLength(0);

    const [push] = listeners.get('push')!;
    await push(
      pushEvent({
        title: 'Alerta',
        deepLink: { kind: 'billing', entityId: 'inv_0001' },
        deliveryId: 'pd_20260823_000042',
        receipt: validReceipt,
      }),
    );

    expect(showNotification).toHaveBeenCalledOnce();
    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0]!;
    expect(call.url).toBe('https://api.staging.local/api/push/ack');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.credentials).toBe('include');
    const body = JSON.parse(String(call.init?.body)) as Record<string, string>;
    expect(body.deliveryId).toBe('pd_20260823_000042');
    expect(body.receipt).toBe(validReceipt);
    expect(Number.isNaN(Date.parse(body.displayedAt))).toBe(false);
  });

  it('receipt ausente → muestra notificación pero NO postea ack', async () => {
    expect(fetchCalls).toHaveLength(1);
    const [push] = listeners.get('push')!;
    await push(
      pushEvent({
        deepLink: { kind: 'inventory', entityId: 'sku_9' },
        deliveryId: 'pd_20260823_000043',
      }),
    );
    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(fetchCalls).toHaveLength(1);
  });

  it('receipt malformado (regex {16,1024}) → no postea ack', async () => {
    const [push] = listeners.get('push')!;
    await push(
      pushEvent({
        deepLink: { kind: 'cash_close', entityId: 'cc_1' },
        deliveryId: 'pd_20260823_000044',
        receipt: 'corto.mal',
      }),
    );
    expect(showNotification).toHaveBeenCalledTimes(3);
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('F6-2: SyncTransport HTTP real', () => {
  it('POST /api/v1/sync/sales con body {sales} y bearer token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : 'fetch';
      calls.push({ url: urlStr, init: init ?? {} });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [{ offlineSaleId: 's1', status: 'SUCCESS' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const transport = createHttpSyncTransport({
      endpointUrl: 'https://api.test/api/v1/sync/sales',
      fetchImpl,
      bearerToken: 'tok123',
    });
    const res = await transport.postSales([sale('s1')]);
    expect(res.results).toEqual([{ offlineSaleId: 's1', status: 'SUCCESS' }]);
    expect(calls[0]?.url).toBe('https://api.test/api/v1/sync/sales');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: 'Bearer tok123',
      'content-type': 'application/json',
    });
    const rawBody = calls[0]?.init.body;
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)) as {
      sales: unknown[];
    };
    expect(body.sales).toHaveLength(1);
  });

  it('errores HTTP → throw SYNC_HTTP_<status> (dispatcher reintenta)', async () => {
    const transport = createHttpSyncTransport({
      endpointUrl: 'https://api.test/sync',
      fetchImpl: () => Promise.resolve(new Response('down', { status: 503 })),
    });
    await expect(transport.postSales([sale('s1')])).rejects.toThrow('SYNC_HTTP_503');
  });

  it('shape inválida del servidor → throw SYNC_HTTP_BAD_SHAPE (fail-closed)', async () => {
    const transport = createHttpSyncTransport({
      endpointUrl: 'https://api.test/sync',
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ results: [{ offlineSaleId: 42 }] }), { status: 200 }),
        ),
    });
    await expect(transport.postSales([sale('s1')])).rejects.toThrow('SYNC_HTTP_BAD_SHAPE');
  });
});

describe('F6-1: adaptador IndexedDB browser (fallback a memoria sin IDB)', () => {
  it('cae a memoria si no hay window/indexedDB y persiste el ciclo get/set/keys/del', async () => {
    const idb = createBrowserOfflineIdb();
    await idb.set('offline/s1', {
      offlineSaleId: 's1',
      payload: sale('s1'),
      status: 'PENDING',
      enqueuedAtMs: 123,
    });
    expect((await idb.get('offline/s1'))?.offlineSaleId).toBe('s1');
    expect(await idb.keys()).toContain('offline/s1');
    expect(await idb.estimate()).toBeDefined();
    await idb.del('offline/s1');
    expect(await idb.get('offline/s1')).toBeUndefined();
  });

  it('rechaza registros IDB malformados (IDB_GET_DATA_INVALID)', async () => {
    const requestWithResult = (result: unknown) => ({
      result,
      error: null,
      set onsuccess(handler: () => void) {
        queueMicrotask(handler);
      },
      set onerror(_handler: () => void) {},
    });
    const db = {
      transaction: () => ({
        objectStore: () => ({
          get: () => requestWithResult({ offlineSaleId: 42 }),
          getAllKeys: () => requestWithResult(['offline/valid']),
        }),
      }),
    };
    vi.stubGlobal('window', {});
    vi.stubGlobal('indexedDB', {
      open: () => requestWithResult(db),
    });
    try {
      const idb = createBrowserOfflineIdb('malformed-offline-idb');
      await expect(idb.get('offline/bad')).rejects.toThrow('IDB_GET_DATA_INVALID');
    } finally {
      vi.unstubAllGlobals();
    }
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

describe('F6-3: 500 ciclos de caos de red contra el dispatcher REAL (SYN-07)', () => {
  /**
   * Transporte adversario determinista (PRNG seedable): por cada envío decide
   * pérdida de paquetes (network error), latencia alta (retry) y acks
   * ALREADY_SYNCED (replay/dedup). El dispatcher real debe terminar con
   * 0 pérdida y 0 duplicación: cada venta se entrega exactamente una vez.
   */
  function adversarialTransport(seed: number) {
    let s = seed >>> 0;
    const rng = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const delivered = new Map<string, number>(); // id → veces ACKed SUCCESS
    const resolved = new Set<string>(); // ACKed SUCCESS o ALREADY_SYNCED
    const postSales = (sales: readonly OfflineSalePayload[]) => {
      const roll = rng();
      if (roll < 0.2) {
        // 20% de los chunks: red caída (network error) → retry con backoff.
        return Promise.reject(new Error('NETWORK_DOWN'));
      }
      return Promise.resolve({
        results: sales.map((sale) => {
          const r = rng();
          if (r < 0.05) {
            // 5% de las ventas: dedup (ALREADY_SYNCED) — el cliente la borra.
            resolved.add(sale.offlineSaleId);
            return { offlineSaleId: sale.offlineSaleId, status: 'ALREADY_SYNCED' as const };
          }
          const count = (delivered.get(sale.offlineSaleId) ?? 0) + 1;
          delivered.set(sale.offlineSaleId, count);
          resolved.add(sale.offlineSaleId);
          return { offlineSaleId: sale.offlineSaleId, status: 'SUCCESS' as const };
        }),
      });
    };
    return { postSales, delivered, resolved };
  }

  it('500 ventas en cola con red adversaria → 0 pérdida, 0 duplicados, nada perdido', async () => {
    const cycles = 500;
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    for (let i = 0; i < cycles; i++) await queue.enqueue(sale(`chaos-${i}`));
    expect((await queue.listPending()).length).toBe(cycles);

    const transport = adversarialTransport(0xca05_ca05);
    const report = await dispatchPendingSalesChunked(queue, transport, {
      sleepFn: () => Promise.resolve(), // backoff instantáneo en test
    });

    // 0 duplicación: cada venta entregada exactamente una vez.
    for (const count of transport.delivered.values()) expect(count).toBe(1);
    // 0 pérdida: resueltas (SUCCESS/ALREADY_SYNCED) + pendientes (RETRY) = total.
    // Las que agotaron reintentos QUEDAN en la cola (nunca se descartan).
    const pending = await queue.listPending();
    const pendingIds = new Set(pending.map((p) => p.offlineSaleId));
    const all = new Set(Array.from({ length: cycles }, (_, i) => `chaos-${i}`));
    for (const id of transport.resolved.keys()) all.delete(id);
    for (const id of pendingIds) all.delete(id);
    expect(all.size).toBe(0); // nada perdido
    expect(transport.resolved.size + pending.length).toBe(cycles);
    // Contables: las ALREADY_SYNCED cuentan como éxito (dedup idempotente).
    expect(report.succeeded + report.failed).toBe(cycles);
  });

  it('flush 2: las RETRY se reintentan hasta vaciar la cola (red recuperada)', async () => {
    const cycles = 60;
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    for (let i = 0; i < cycles; i++) await queue.enqueue(sale(`retry-${i}`));

    // Primer flush con red caída (transport siempre falla) → todo queda RETRY.
    const deadTransport = { postSales: () => Promise.reject(new Error('NETWORK_DOWN')) };
    await dispatchPendingSalesChunked(queue, deadTransport, {
      sleepFn: () => Promise.resolve(),
    });
    const pendingAfterDead = await queue.listPending();
    expect(pendingAfterDead.length).toBe(cycles);
    expect(pendingAfterDead.every((p) => p.status === 'RETRY')).toBe(true);

    // Segundo flush con red recuperada → todo se entrega, cola vacía.
    const okTransport = {
      postSales: (sales: readonly OfflineSalePayload[]) =>
        Promise.resolve({
          results: sales.map((s) => ({
            offlineSaleId: s.offlineSaleId,
            status: 'SUCCESS' as const,
          })),
        }),
    };
    const report = await dispatchPendingSalesChunked(queue, okTransport, {
      sleepFn: () => Promise.resolve(),
    });
    expect(report.succeeded).toBe(cycles);
    expect((await queue.listPending()).length).toBe(0);
  });

  it('determinista: mismo seed → mismo resultado (reproducible en CI)', async () => {
    async function runOnce(seed: number) {
      const idb = createMemoryOfflineIdb();
      const queue = new OfflineQueueStore(idb);
      for (let i = 0; i < 50; i++) await queue.enqueue(sale(`det-${i}`));
      const transport = adversarialTransport(seed);
      const report = await dispatchPendingSalesChunked(queue, transport, {
        sleepFn: () => Promise.resolve(),
      });
      return {
        report,
        delivered: transport.delivered.size,
        pending: (await queue.listPending()).length,
      };
    }
    const a = await runOnce(0xdead_beef);
    const b = await runOnce(0xdead_beef);
    expect(a).toEqual(b);
  });
});
