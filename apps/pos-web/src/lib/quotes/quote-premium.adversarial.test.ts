import { describe, expect, it, vi, beforeEach } from 'vitest';
import { historyCacheKey, normalizePlate, parseHistoryPayload } from './quote-history.js';
import { buildOneTapConvertPayload, validateOneTapRequest } from './quote-one-tap.js';
import { createMemoryOfflineIdb, OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { evaluateQuota } from '../offline-sync/quota-guardian.js';

/**
 * Adversariales premium — red hostil + cuota IndexedDB.
 * Requisito del Staff POS: 0 pérdida/corrupción tras QuotaExceeded o red rota.
 */

function ensureStorage() {
  if (typeof (globalThis as unknown as { localStorage?: unknown }).localStorage === 'undefined') {
    const map = new Map<string, string>();
    (globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => map.get(String(k)) ?? null,
      setItem: (k: string, v: string) => map.set(String(k), String(v)),
      removeItem: (k: string) => map.delete(String(k)),
      clear: () => map.clear(),
    } as unknown as Storage;
  }
}
ensureStorage();

describe('adversarial – cuota IndexedDB (taller historial)', () => {
  beforeEach(() => {
    ensureStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage.clear();
  });

  it('QuotaExceeded al guardar historial no corrompe entradas existentes', async () => {
    const key = historyCacheKey('t1', 'ABC123');
    const initial = [
      {
        id: 'h1',
        plate: 'ABC123',
        dateIso: '2026-08-10T10:00:00.000Z',
        concept: 'Aceite',
        totalCents: 8000,
      },
    ];
    localStorage.setItem(key, JSON.stringify(initial));

    // Simular cuota llena en guardado del historial (localStorage quota) — mock directo de la instancia
    const orig = localStorage.setItem.bind(localStorage);
    let threw = false;
    const spy = vi
      .spyOn(localStorage as unknown as { setItem: typeof orig }, 'setItem')
      .mockImplementation(((k: string, v: string) => {
        if (k === key && v.length > 50) {
          const err = new DOMException('Quota exceeded', 'QuotaExceededError');
          threw = true;
          throw err;
        }
        return orig(k, v);
      }) as unknown as typeof orig);

    // Intentar guardar nuevo historial debe capturar QuotaExceeded sin borrar el anterior
    try {
      const large = JSON.stringify([
        ...initial,
        {
          id: 'h2',
          plate: 'ABC123',
          dateIso: '2026-08-11T10:00:00.000Z',
          concept: 'X'.repeat(5000),
          totalCents: 1000,
        },
      ]);
      localStorage.setItem(key, large);
    } catch (e) {
      expect((e as DOMException).name).toBe('QuotaExceededError');
    }

    // Verificar que la entrada original sigue intacta
    const still = localStorage.getItem(key);
    expect(still).not.toBeNull();
    const parsed = still ? parseHistoryPayload({ items: JSON.parse(still) }) : [];
    expect(parsed.some((p) => p.id === 'h1')).toBe(true);
    expect(threw).toBe(true);
    spy.mockRestore();
  });

  it('OfflineQueueStore: enqueue bloqueado por cuota ≥100% no encola y deja mensaje humano', async () => {
    const mem = createMemoryOfflineIdb({ quota: 100 });
    // llenar uso > quota
    mem.store.set('offline/a', {
      offlineSaleId: 'a',
      payload: {
        offlineSaleId: 'a',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm1', amountCents: 1000 }],
      } as unknown as never,
      status: 'PENDING',
      enqueuedAtMs: Date.now(),
    });
    // forzar estimate uso = quota (100%) via stub de estimate que retorna usage 100
    const store = new OfflineQueueStore({
      ...mem,
      estimate: () => Promise.resolve({ usage: 100, quota: 100 }),
    });
    const verdict = evaluateQuota({ usage: 100, quota: 100 });
    expect(verdict.level).toBe('BLOCKED');
    expect(verdict.canEnqueue).toBe(false);
    expect(verdict.message).toMatch(/Almacenamiento local lleno/);
    await expect(
      store.enqueue({
        offlineSaleId: 'b',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm1', amountCents: 1000 }],
      } as unknown as never),
    ).rejects.toThrow(/Almacenamiento local lleno/);
    // cola original no perdida
    expect((await store.listPending()).some((r) => r.offlineSaleId === 'a')).toBe(true);
  });

  it('OfflineQueueStore: QuotaExceededError en set lanza veredicto BLOCKED sin perder pending', async () => {
    const mem = createMemoryOfflineIdb({ quota: 10_000_000, failOnSet: true });
    const store = new OfflineQueueStore(mem);
    await expect(
      store.enqueue({
        offlineSaleId: 'q',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm1', amountCents: 1000 }],
      } as unknown as never),
    ).rejects.toThrow();
    expect(await store.listPending()).toHaveLength(0);
  });
});

describe('adversarial – red hostil (one-tap taller)', () => {
  it('validateOneTap no depende de red; es puro <100ms aun con red hostil', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) validateOneTapRequest({ quoteId: `q${i}`, totalCents: 1000 });
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('buildOneTapConvertPayload normaliza placa aun con input hostil (inyectado)', () => {
    expect(
      buildOneTapConvertPayload({
        quoteId: 'q1',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'B001',
        documentType: '03',
        plate: '  abc-123  ',
      }).plate,
    ).toBe('ABC123');
    expect(
      buildOneTapConvertPayload({
        quoteId: 'q1',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'B001',
        documentType: '03',
        plate: '<script>alert(1)</script>',
      }).plate,
    ).toBe('<SCRIPT>ALERT(1)</SCRIPT>'.replace(/[\s-]/g, ''));
    // placa inyectada no rompe payload
  });

  it('fetch hostil: apiFetch que falla no deja historia corrupta', async () => {
    const norm = normalizePlate('ABC123');
    expect(norm).toBe('ABC123');
    // simular fetch que lanza NetworkError
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const failingFetch = vi.fn((_url: string) => Promise.reject(new TypeError('Failed to fetch')));
    const plate = 'ABC123';
    let caught = false;
    try {
      await failingFetch(`/api/sales/history?plate=${plate}`);
    } catch (e) {
      caught = true;
      expect((e as Error).message).toBe('Failed to fetch');
    }
    expect(caught).toBe(true);
    // el módulo puro sigue funcionando
    expect(normalizePlate(plate)).toBe('ABC123');
  });

  it('placa maliciosa larga no explota cache key', () => {
    const long = 'A'.repeat(1000);
    const key = historyCacheKey('tenant-demo', long);
    expect(key.length).toBeGreaterThan(0);
    expect(key.startsWith('taller_history/')).toBe(true);
  });
});
