<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesQuotesEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';

  const quotesOn = isSalesQuotesEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let productId = $state('p1');
  let enteredMicrounits = $state(1_000_000);
  let validUntil = $state('2026-08-20');
  let quoteId = $state('');
  let series = $state('NV01');
  let reason = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function createQuote() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        branchId: 'b-demo',
        validUntilIso: validUntil,
        items: [{ productId, enteredQuantityMicrounits: enteredMicrounits }],
      }),
    });
    const json = (await res.json()) as {
      quoteId?: string;
      snapshotTotalCents?: number;
      emitsFiscalDocument?: boolean;
      reservesStock?: boolean;
      error?: string;
    };
    messageOk = res.ok;
    if (!res.ok) { message = json.error ?? `Error ${res.status}`; return; }
    quoteId = json.quoteId ?? '';
    message = `Cotización ${quoteId} · snapshot S/ ${formatCents(json.snapshotTotalCents ?? 0)} · CPE=${json.emitsFiscalDocument} · reserva=${json.reservesStock}`;
  }

  async function send() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/send`, { method: 'POST', headers: headers(), body: JSON.stringify({ quoteId }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Enviada (${json.status})` : (json.error ?? `Error ${res.status}`);
  }

  async function approve() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/approve`, { method: 'POST', headers: headers(), body: JSON.stringify({ quoteId }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Aprobada (${json.status})` : (json.error ?? `Error ${res.status}`);
  }

  async function convert() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/convert`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        quoteId,
        cashRegisterSessionId: 's-demo',
        series,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
      }),
    });
    const json = (await res.json()) as { saleId?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Convertida a venta ${json.saleId}` : (json.error ?? `Error ${res.status}`);
  }

  async function cancel() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/cancel`, { method: 'POST', headers: headers(), body: JSON.stringify({ quoteId, reason }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Cancelada (${json.status})` : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Cotizaciones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-cotizacion">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="file-text" size={12} /> Ventas · Cotizaciones</p>
      <h1 class="page-title">Cotización</h1>
      <p class="page-lede">Congela el precio del servidor. No reserva stock ni emite comprobante hasta convertir a venta.</p>
    </div>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite" data-testid="quote-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !quotesOn}
    <div class="feature-off-banner" data-testid="caja-quote-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_SALES_QUOTES</code> desactivado.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-quote-tenant">Tenant {session.tenantId}</p>

    <div class="quote-layout">
      <!-- Crear -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Nueva cotización</h2>
          <span class="section-tag">Crear</span>
        </div>
        <div class="field-group">
          <label for="q-product">Producto</label>
          <input id="q-product" bind:value={productId} data-testid="quote-product" />
        </div>
        <div class="field-group">
          <label for="q-qty">Cantidad (microunidades)</label>
          <input id="q-qty" type="number" bind:value={enteredMicrounits} data-testid="quote-qty" />
        </div>
        <div class="field-group">
          <label for="q-valid">Válida hasta</label>
          <input id="q-valid" type="date" bind:value={validUntil} data-testid="quote-valid" />
        </div>
        <button type="button" class="primary" data-testid="quote-create" onclick={() => void createQuote()}>
          <Icon name="plus" size={14} />
          Crear cotización
        </button>
      </section>

      <!-- Acciones -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Gestionar</h2>
          <span class="section-tag">Acciones</span>
        </div>
        <div class="field-group">
          <label for="q-id">ID cotización</label>
          <input id="q-id" bind:value={quoteId} data-testid="quote-id" placeholder="ID creado arriba" />
        </div>
        <div class="btn-row">
          <button type="button" class="secondary" data-testid="quote-send" onclick={() => void send()} disabled={!quoteId}>
            <Icon name="arrow-right" size={14} />
            Enviar
          </button>
          <button type="button" class="primary" data-testid="quote-approve" onclick={() => void approve()} disabled={!quoteId}>
            <Icon name="check" size={14} />
            Aprobar
          </button>
        </div>

        <div class="separator"></div>

        <div class="field-group">
          <label for="q-series">Serie al convertir</label>
          <input id="q-series" bind:value={series} data-testid="quote-series" />
        </div>
        <button type="button" class="success" data-testid="quote-convert" onclick={() => void convert()} disabled={!quoteId}>
          <Icon name="receipt" size={14} />
          Convertir a venta
        </button>

        <div class="separator"></div>

        <div class="field-group">
          <label for="q-reason">Motivo cancelación</label>
          <input id="q-reason" bind:value={reason} data-testid="quote-reason" placeholder="Opcional" />
        </div>
        <button type="button" class="secondary danger-sec" data-testid="quote-cancel" onclick={() => void cancel()} disabled={!quoteId}>
          <Icon name="x" size={14} />
          Cancelar
        </button>
      </section>
    </div>
  {/if}
</div>

<style>
  .quote-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad { padding: 1.25rem; }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .separator {
    border-top: 1px solid var(--border-subtle);
    margin: 0.875rem 0;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .danger-sec {
    border-color: rgba(217, 106, 60, 0.35);
    color: var(--rose-red);
  }
  .danger-sec:hover {
    background: rgba(217, 106, 60, 0.1);
    border-color: var(--rose-red);
  }

  @media (max-width: 600px) {
    .quote-layout { grid-template-columns: 1fr; }
  }
</style>
