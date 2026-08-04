<script lang="ts">
  import {
    CHUNK_SIZE,
    createMemoryOfflineIdb,
    dispatchPendingSalesChunked,
    OfflineQueueStore,
  } from '$lib/offline-sync';
  import type { OfflineSalePayload } from '@kipuspay/domain-sales';

  let status = $state('idle');
  let pendingCount = $state(0);
  let message = $state('');

  function sale(id: string): OfflineSalePayload {
    return {
      offlineSaleId: id,
      branchId: 'b1',
      cashRegisterSessionId: 's1',
      documentType: 'NV',
      series: 'NV01',
      clientDocumentType: '1',
      clientDocumentNumber: '12345678',
      clientName: 'Cliente',
      items: [{ productId: 'p1', quantity: 1 }],
      payments: [{ paymentMethodId: 'pm1', amountCents: 1180 }],
    };
  }

  async function runHarness() {
    // Cobro crítico: encola y retorna sin await de red (cero spinner bloqueante).
    status = 'enqueued';
    message = 'Cobro OK — sync en background';
    const idb = createMemoryOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    const n = CHUNK_SIZE + 5;
    for (let i = 0; i < n; i++) await queue.enqueue(sale(`h-${i}`));
    pendingCount = (await queue.listPending()).length;

    void (async () => {
      await dispatchPendingSalesChunked(
        queue,
        {
          postSales: (sales) =>
            Promise.resolve({
              results: sales.map((s) => ({
                offlineSaleId: s.offlineSaleId,
                status: 'SUCCESS' as const,
              })),
            }),
        },
        { sleepFn: () => Promise.resolve() },
      );
      pendingCount = (await queue.listPending()).length;
      status = 'synced';
      message = 'Cola vacía tras sync';
    })();
  }
</script>

<h1>Offline sync harness</h1>
<p data-testid="status">{status}</p>
<p data-testid="pending">{pendingCount}</p>
<p data-testid="message">{message}</p>
<button type="button" data-testid="run" onclick={runHarness}>Encolar y sync</button>
