<script lang="ts">
  import {
    CHUNK_SIZE,
    createBrowserOfflineIdb,
    createHttpSyncTransport,
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
    // F6-1/F6-2: IDB real (persistente entre recargas) + transporte HTTP real
    // contra la API de sync; fallback a memoria si no hay browser IDB.
    const idb = createBrowserOfflineIdb();
    const queue = new OfflineQueueStore(idb);
    const n = CHUNK_SIZE + 5;
    for (let i = 0; i < n; i++) await queue.enqueue(sale(`h-${i}`));
    pendingCount = (await queue.listPending()).length;

    void (async () => {
      const apiBase = (localStorage.getItem('kipuspay_api_base') ?? 'http://localhost:8787').replace(
        /\/$/,
        '',
      );
      await dispatchPendingSalesChunked(
        queue,
        createHttpSyncTransport({
          endpointUrl: `${apiBase}/api/v1/sync/sales`,
          bearerToken: localStorage.getItem('kipuspay_token') ?? undefined,
        }),
        { sleepFn: () => Promise.resolve() },
      );
      pendingCount = (await queue.listPending()).length;
      status = 'synced';
      message = 'Cola vacía tras sync (o pendientes en RETRY por red)';
    })();
  }
</script>

<svelte:head><title>Offline Sync Harness · Dev · KipusPay</title></svelte:head>

<div class="page-shell">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow">Dev · Herramienta interna</p>
      <h1 class="page-title">Offline Sync Harness</h1>
      <p class="page-lede">Simula encolado de ventas offline y despacho chunked en background.</p>
    </div>
  </div>

  <div class="ledger-card harness-card">
    <div class="card-header">
      <h2>Estado de simulación</h2>
      <span class="badge {status === 'synced' ? 'badge-success' : status === 'enqueued' ? 'badge-warning' : 'badge-muted'}" data-testid="status">
        {status}
      </span>
    </div>
    <div class="info-rows">
      <div class="info-row">
        <span class="info-label">Ventas pendientes en cola</span>
        <strong class="tabular-nums" data-testid="pending">{pendingCount}</strong>
      </div>
      {#if message}
        <div class="info-row" data-testid="message">
          <span class="info-label">Resultado</span>
          <span>{message}</span>
        </div>
      {/if}
    </div>
    <button type="button" class="primary run-btn" data-testid="run" onclick={runHarness}>
      Encolar y sync
    </button>
  </div>
</div>

<style>
  .harness-card {
    padding: 1.25rem;
    max-width: 28rem;
  }

  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .info-label { color: var(--text-muted); }
  .run-btn { width: 100%; margin-top: 0.5rem; }
</style>
