<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesQuotesEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const quotesOn = isSalesQuotesEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let productId = $state('p1');
  let enteredMicrounits = $state(1_000_000);
  let validUntil = $state('2026-08-20');
  let quoteId = $state('');
  let series = $state('NV01');
  let reason = $state('');
  let message = $state('');

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
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    quoteId = json.quoteId ?? '';
    message = `Cotización ${quoteId} · snapshot S/ ${formatCents(json.snapshotTotalCents ?? 0)} · CPE=${json.emitsFiscalDocument} · reserva=${json.reservesStock}`;
  }

  async function send() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/send`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ quoteId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `Enviada (${json.status})` : (json.error ?? `Error ${res.status}`);
  }

  async function approve() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/approve`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ quoteId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
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
    message = res.ok ? `Convertida a venta ${json.saleId}` : (json.error ?? `Error ${res.status}`);
  }

  async function cancel() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/quotes/cancel`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ quoteId, reason }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `Cancelada (${json.status})` : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Cotizaciones · KipusPay</title></svelte:head>

<section class="caja-quote" data-testid="caja-cotizacion">
  <h1>Cotización</h1>
  <p class="lede">
    Congela el precio del servidor. No reserva stock ni emite comprobante hasta convertir a venta.
  </p>

  {#if !quotesOn}
    <p class="off" data-testid="caja-quote-off">
      PUBLIC_FEATURE_SALES_QUOTES desactivado. Activá el flag para cotizaciones en caja.
    </p>
  {:else}
    <p data-testid="caja-quote-tenant">Tenant {session.tenantId}</p>
    <label>
      Producto
      <input bind:value={productId} data-testid="quote-product" />
    </label>
    <label>
      Cantidad (microunidades)
      <input type="number" bind:value={enteredMicrounits} data-testid="quote-qty" />
    </label>
    <label>
      Válida hasta
      <input bind:value={validUntil} data-testid="quote-valid" />
    </label>
    <button type="button" data-testid="quote-create" onclick={() => void createQuote()}
      >Crear cotización</button
    >

    <label>
      ID cotización
      <input bind:value={quoteId} data-testid="quote-id" />
    </label>
    <button type="button" data-testid="quote-send" onclick={() => void send()}>Enviar</button>
    <button type="button" data-testid="quote-approve" onclick={() => void approve()}>Aprobar</button>
    <label>
      Serie al convertir
      <input bind:value={series} data-testid="quote-series" />
    </label>
    <button type="button" data-testid="quote-convert" onclick={() => void convert()}
      >Convertir a venta</button
    >
    <label>
      Motivo cancelación
      <input bind:value={reason} data-testid="quote-reason" />
    </label>
    <button type="button" data-testid="quote-cancel" onclick={() => void cancel()}>Cancelar</button>
    {#if message}
      <p data-testid="quote-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-quote {
    padding: 1.25rem;
    max-width: 32rem;
  }
  .lede,
  .off {
    color: #5b6773;
  }
  label {
    display: block;
    margin: 0.75rem 0;
  }
  input {
    width: 100%;
  }
  button {
    margin: 0.35rem 0.35rem 0.35rem 0;
  }
</style>
