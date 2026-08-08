import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrintJobRecord, PrintTicketSnapshot } from '@kipuspay/print-templates';
import { compileEscPosFromSnapshot, handleOffloadMessage } from './offload-compile.js';
import { createOffloadClient } from './offload-client.js';
import { enqueueAndPrintTicket } from './enqueue-print.js';
import { createMemoryPrintIdb, PrintOutboxStore } from './print-outbox-store.js';
import { createMockPrinterTransport, createPrinterTransport } from './printer-transport.js';

const snap: PrintTicketSnapshot = {
  enterprise: 'Demo',
  ruc: '20111111111',
  documentType: 'NV',
  series: 'NV01',
  number: 1,
  totalCents: 100,
  items: [{ name: 'A', qty: 1, totalCents: 100 }],
  lineWidth: 32,
};

function job(saleId: string, over: Partial<PrintJobRecord> = {}): PrintJobRecord {
  const now = Date.now();
  return {
    saleId,
    ticket: snap,
    escPosBase64: null,
    status: 'PENDING',
    preferredAdapter: null,
    lastError: null,
    enqueuedAtMs: now,
    updatedAtMs: now,
    ...over,
  };
}

describe('print outbox IDB', () => {
  it('enqueue + pendingCount + F5 survival (mismo store)', async () => {
    const idb = createMemoryPrintIdb();
    const outbox = new PrintOutboxStore(idb);
    await outbox.enqueue(job('s1'));
    expect(await outbox.pendingCount()).toBe(1);

    // "F5": nueva instancia sobre el mismo Map
    const afterReload = new PrintOutboxStore(idb);
    expect(await afterReload.pendingCount()).toBe(1);
    const got = await afterReload.get('s1');
    expect(got?.saleId).toBe('s1');

    await afterReload.markPrinted('s1');
    await afterReload.ackDelete('s1');
    expect(await afterReload.pendingCount()).toBe(0);
  });

  it('FAILED cuenta para edge 2D', async () => {
    const outbox = new PrintOutboxStore(createMemoryPrintIdb());
    await outbox.enqueue(job('s2'));
    await outbox.markFailed('s2', 'WEBUSB_NO_DEVICE');
    expect(await outbox.pendingCount()).toBe(1);
  });

  it('createBrowserPrintIdb cae a memoria si no hay window/indexedDB y soporta mock IDB', async () => {
    const { createBrowserPrintIdb } = await import('./print-outbox-store.js');
    const fallbackIdb = createBrowserPrintIdb();
    await fallbackIdb.set('k1', job('s-browser'));
    expect((await fallbackIdb.get('k1'))?.saleId).toBe('s-browser');
    expect(await fallbackIdb.keys()).toContain('k1');
    await fallbackIdb.del('k1');
    expect(await fallbackIdb.get('k1')).toBeUndefined();
    expect(await fallbackIdb.estimate()).toBeDefined();
  });

  it('rechaza registros y listas de claves IDB malformados', async () => {
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
          get: () => requestWithResult({ saleId: 42 }),
          getAllKeys: () => requestWithResult(['print_jobs/valid', { invalid: true }]),
        }),
      }),
    };
    vi.stubGlobal('window', {});
    vi.stubGlobal('indexedDB', {
      open: () => requestWithResult(db),
    });

    try {
      const { createBrowserPrintIdb } = await import('./print-outbox-store.js');
      const idb = createBrowserPrintIdb('malformed-print-idb');
      await expect(idb.get('print_jobs/bad')).rejects.toThrow('IDB_GET_DATA_INVALID');
      await expect(idb.keys()).rejects.toThrow('IDB_KEYS_DATA_INVALID');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('offload compile', () => {
  it('COMPILE_ESC_POS produce base64', () => {
    const { escPosBase64, bytes } = compileEscPosFromSnapshot(snap);
    expect(escPosBase64.length).toBeGreaterThan(10);
    expect(bytes[0]).toBe(0x1b);
    const res = handleOffloadMessage({
      type: 'COMPILE_ESC_POS',
      requestId: '1',
      ticket: snap,
    });
    expect(res.type).toBe('ESC_POS_READY');
  });

  it('PING y snapshot con QR opcional', () => {
    expect(handleOffloadMessage({ type: 'PING', requestId: 'p' }).type).toBe('PONG');
    const withQr = compileEscPosFromSnapshot({
      ...snap,
      digestValue: 'abc',
      qrPayload: 'https://cpe.example/q',
    });
    expect(withQr.bytes.length).toBeGreaterThan(20);
  });
});

describe('offload client (sync fallback)', () => {
  it('compila sin Worker', async () => {
    const client = createOffloadClient();
    const b64 = await client.compileEscPos(snap);
    expect(b64.length).toBeGreaterThan(10);
    client.dispose();
  });

  it('soporta Worker en entorno de navegador mockeado', async () => {
    let messageHandler: ((ev: MessageEvent) => void) | null = null;
    class MockWorker {
      set onmessage(fn: (ev: MessageEvent) => void) {
        messageHandler = fn;
      }
      set onerror(_fn: unknown) {}
      postMessage(req: { requestId: string }) {
        setTimeout(() => {
          messageHandler?.({
            data: { type: 'ESC_POS_READY', requestId: req.requestId, escPosBase64: 'QQ==' },
          } as MessageEvent);
        }, 5);
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', MockWorker);
    const client = createOffloadClient();
    const b64 = await client.compileEscPos(snap);
    expect(b64).toBe('QQ==');
    client.dispose();
  });

  it('maneja errores de worker y dispose', async () => {
    let errorHandler: ((ev: { message?: string }) => void) | null = null;
    class MockWorkerErr {
      set onmessage(_fn: unknown) {}
      set onerror(fn: (ev: { message?: string }) => void) {
        errorHandler = fn;
      }
      postMessage() {
        setTimeout(() => {
          errorHandler?.({ message: 'WORKER_BOOM' });
        }, 5);
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', MockWorkerErr);
    const client = createOffloadClient();
    const p = client.compileEscPos(snap);
    await expect(p).rejects.toThrow('WORKER_BOOM');
    client.dispose();
  });

  it('rechaza respuestas malformadas del worker', async () => {
    let messageHandler: ((event: MessageEvent<unknown>) => void) | null = null;
    class MalformedWorker {
      set onmessage(handler: (event: MessageEvent<unknown>) => void) {
        messageHandler = handler;
      }
      set onerror(_handler: (event: ErrorEvent) => void) {}
      postMessage(request: { requestId: string }) {
        messageHandler?.(
          new MessageEvent('message', {
            data: { type: 'INVALID', requestId: request.requestId },
          }),
        );
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', MalformedWorker);
    const client = createOffloadClient();
    let rejected: Error | undefined;
    const pending = client.compileEscPos(snap);
    void pending.catch((error: unknown) => {
      if (error instanceof Error) rejected = error;
    });
    await Promise.resolve();
    const rejectionMessage = rejected?.message;
    client.dispose();
    await pending.catch(() => undefined);
    vi.unstubAllGlobals();

    expect(rejectionMessage).toBe('WORKER_RESPONSE_INVALID');
  });
});

describe('enqueueAndPrintTicket', () => {
  it('ACK borra job tras print OK', async () => {
    const outbox = new PrintOutboxStore(createMemoryPrintIdb());
    const transport = createMockPrinterTransport([
      { strategy: 'system_print', run: () => Promise.resolve() },
    ]);
    const res = await enqueueAndPrintTicket({
      outbox,
      transport,
      saleId: 'sale-ok',
      ticket: snap,
      offload: {
        compileEscPos: () => Promise.resolve('QQ=='),
        dispose: () => undefined,
      },
    });
    expect(res.printed).toBe(true);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('fallo de print deja FAILED (venta no se revierte)', async () => {
    const outbox = new PrintOutboxStore(createMemoryPrintIdb());
    const transport = createMockPrinterTransport([
      { strategy: 'webusb', run: () => Promise.reject(new Error('WEBUSB_NO_DEVICE')) },
    ]);
    const res = await enqueueAndPrintTicket({
      outbox,
      transport,
      saleId: 'sale-fail',
      ticket: snap,
      offload: {
        compileEscPos: () => Promise.reject(new Error('compile boom')),
        dispose: () => undefined,
      },
    });
    expect(res.printed).toBe(false);
    expect(await outbox.pendingCount()).toBe(1);
  });
});

describe('printer transport ladder', () => {
  it('failback al siguiente adaptador', async () => {
    const t = createMockPrinterTransport([
      {
        strategy: 'webusb',
        run: () => Promise.reject(new Error('WEBUSB_NO_DEVICE')),
      },
      {
        strategy: 'system_print',
        run: () => Promise.resolve(),
      },
    ]);
    const res = await t.print({ ticket: snap, escPosBase64: 'AA==' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('system_print');
  });

  it('preflight lista system_print + WA', async () => {
    const t = createPrinterTransport({
      wssUrl: 'wss://printer.local/escpos',
      whatsappFallback: () => Promise.resolve(true),
    });
    const avail = await t.preflight();
    expect(avail).toContain('system_print');
    expect(avail).toContain('wss_lan');
    expect(avail).toContain('whatsapp');
  });

  it('escalera real cae a WhatsApp cuando USB/WSS/BT/System fallan', async () => {
    const t = createPrinterTransport({
      wssUrl: 'wss://printer.local/escpos',
      whatsappFallback: () => Promise.resolve(true),
    });
    const res = await t.print({ ticket: snap, escPosBase64: 'AA==' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('whatsapp');
  });

  it('sin bytes ESC/POS y sin WA → error', async () => {
    const t = createPrinterTransport({});
    const res = await t.print({ ticket: snap, escPosBase64: null });
    expect(res.ok).toBe(false);
  });
});

describe('print outbox chaos 500', () => {
  it('pendingCount exacto en 500 ciclos fail/ack', async () => {
    const outbox = new PrintOutboxStore(createMemoryPrintIdb({ quota: 50_000_000 }));
    for (let i = 0; i < 500; i += 1) {
      const id = `sale-${i}`;
      await outbox.enqueue(job(id));
      if (i % 2 === 0) {
        await outbox.markFailed(id, 'PRINTER_JAM');
      } else {
        await outbox.markPrinted(id);
        await outbox.ackDelete(id);
      }
    }
    // 250 FAILED quedan; 250 ACK borrados
    expect(await outbox.pendingCount()).toBe(250);
    const blocking = await outbox.listBlocking();
    expect(blocking.every((j) => j.status === 'FAILED')).toBe(true);
    expect(blocking).toHaveLength(250);
  });
});

describe('blind-close outboxPendingCount body', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('incluye outboxPendingCount en el POST', async () => {
    const { submitBlindClose } = await import('../cash/blind-close.js');
    let body = '';
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        body = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              error: 'Print outbox pendiente',
              code: 'PRINT_OUTBOX_BLOCK',
              pendingCount: 2,
            }),
        });
      }),
    );
    const res = await submitBlindClose('https://api.example', 'Bearer t', {
      sessionId: 'sess',
      countLines: [{ denominationCents: 100, quantity: 1 }],
      outboxPendingCount: 2,
    });
    expect(body).toContain('"outboxPendingCount":2');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PRINT_OUTBOX_BLOCK');
    expect(res.pendingCount).toBe(2);
  });
});
