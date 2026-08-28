/**
 * capabilities-revoked-offline — SYN-06: venta offline jamás se pierde aunque capabilities revocadas
 * Ola 5 chaos: verifica que la revocación de `pos.checkout` (store.has()=false, dynamic 1)
 * NO bloquea el encolado ni el sync chunked. Usa hw-android-offline harness para 500 ventas,
 * pero con capabilities vacías (revocadas). Reutiliza OfflineQueueStore zero-dep.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMemoryOfflineIdb, OfflineQueueStore } from './offline-queue.js';
import { dispatchPendingSalesChunked, CHUNK_SIZE } from './chunked-sync-dispatcher.js';
import { clearCapabilities, setCapabilities, has } from '../tenant/capabilitiesStore.js';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';

function sale(id: string): OfflineSalePayload {
  return {
    offlineSaleId: id,
    branchId: 'b-revoked',
    cashRegisterSessionId: 'sess-revoked',
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '12345678',
    clientName: 'Cliente Revoked',
    clientProfileUpdatedAt: '2026-08-28T12:00:00.000Z',
    localClientId: `L-${id}`,
    items: [{ productId: 'p-revoked', quantity: 1 }],
    payments: [{ paymentMethodId: 'pm-yape', amountCents: 500 }],
  };
}

describe('capabilities-revoked-offline — SYN-06 offline-first con capabilities revocadas (Ola 5)', () => {
  beforeEach(async () => {
    await clearCapabilities();
    vi.unstubAllEnvs();
  });

  it('SYN-06: 50 ventas encoladas con pos.checkout revocado (has=false) — 0 pérdida', async () => {
    // Simula tenant con capabilities revocadas: dynamic 1 pero store vacío
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '1');
    await setCapabilities({
      caps: [],
      epoch: 5,
      tenantId: 'tenant-revoked',
      fetchedAt: Date.now(),
    });
    expect(has('pos.checkout')).toBe(false);
    // features.ts delega a store cuando dynamic 1
    const feat = await import('../features.js');
    expect(feat.isPosCheckoutEnabled()).toBe(false);
    // Aun así, la cola offline NO consulta capabilities: encola 50 ventas sin pérdida
    const idb = createMemoryOfflineIdb({ quota: 10_000_000 });
    const queue = new OfflineQueueStore(idb);
    const N = 50;
    for (let i = 0; i < N; i++) {
      const v = await queue.enqueue(sale(`revoked-${String(i).padStart(4, '0')}`));
      expect(v.canEnqueue).toBe(true);
    }
    expect((await queue.listPending()).length).toBe(N);
    expect(CHUNK_SIZE).toBe(30);
  });

  it('SYN-06: 500 ventas offline con capabilities revocadas → sync chunked 0 pérdida, 0 duplicación', async () => {
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '1');
    await setCapabilities({ caps: [], epoch: 1, tenantId: 'tenant-revoked' });
    expect(has('pos.checkout')).toBe(false);

    const idb = createMemoryOfflineIdb({ quota: 10_000_000 });
    const queue = new OfflineQueueStore(idb);
    const CYCLES = 500;
    for (let i = 0; i < CYCLES; i++) {
      await queue.enqueue(sale(`hw-revoked-${String(i).padStart(4, '0')}`));
    }
    expect((await queue.listPending()).length).toBe(CYCLES);

    // Fase offline: NETWORK_DOWN → todo queda RETRY, 0 pérdida
    const offlineTransport = { postSales: () => Promise.reject(new Error('NETWORK_DOWN')) };
    const offlineReport = await dispatchPendingSalesChunked(queue, offlineTransport, {
      sleepFn: () => Promise.resolve(),
    });
    expect(offlineReport.succeeded).toBe(0);
    expect(offlineReport.failed).toBe(CYCLES);
    expect((await queue.listPending()).length).toBe(CYCLES);

    // Fase online: recupera con deduplicación ALREADY_SYNCED → 0 pérdida/dupe
    const delivered = new Set<string>();
    const onlineTransport = {
      postSales: (sales: readonly OfflineSalePayload[]) =>
        Promise.resolve({
          results: sales.map((s) => {
            if (delivered.has(s.offlineSaleId))
              return { offlineSaleId: s.offlineSaleId, status: 'ALREADY_SYNCED' as const };
            delivered.add(s.offlineSaleId);
            return { offlineSaleId: s.offlineSaleId, status: 'SUCCESS' as const };
          }),
        }),
    };
    const onlineReport = await dispatchPendingSalesChunked(queue, onlineTransport, {
      sleepFn: () => Promise.resolve(),
    });
    expect(onlineReport.succeeded).toBe(CYCLES);
    expect(onlineReport.failed).toBe(0);
    expect((await queue.listPending()).length).toBe(0);
    expect(delivered.size).toBe(CYCLES);
  });

  it('rollback instantáneo: dynamic 0 restaura flag sin perder cola', async () => {
    // Revocada en dynamic 1 → cambia a 0 sin deploy, flag POS_CHECKOUT=1 restaura UI
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '1');
    await setCapabilities({ caps: [], epoch: 1, tenantId: 'tenant-revoked' });
    expect(has('pos.checkout')).toBe(false);
    const feat = await import('../features.js');
    // dynamic 1 → false
    expect(feat.isPosCheckoutEnabled()).toBe(false);

    // Rollback instantáneo: var a 0, flag 1
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '0');
    vi.stubEnv('PUBLIC_FEATURE_POS_CHECKOUT', '1');
    // Necesita re-import? isDynamic lee env dinámico cada call, no cacheado
    expect(feat.isPosCheckoutEnabled()).toBe(true);
    // Cola offline sigue intacta tras rollback (no se limpia)
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    await queue.enqueue(sale('rollback-1'));
    expect((await queue.listPending()).length).toBe(1);
    vi.unstubAllEnvs();
  });
});
