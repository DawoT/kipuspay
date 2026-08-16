<script lang="ts">
  
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesQuotesEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { salesErrorCopy } from '$lib/ui/ops-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { apiFetch } from '$lib/auth/api-client';

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

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function createQuote() {
    message = '';
    const res = await apiFetch('/api/sales/quotes', {
      method: 'POST',
      storage: localStorage, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branchId: tenantBranchId(localStorage),
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
    if (!res.ok) { message = salesErrorCopy(json.error); return; }
    quoteId = json.quoteId ?? '';
    message = `Cotización lista · S/ ${formatCents(json.snapshotTotalCents ?? 0)}${json.emitsFiscalDocument ? ' · con comprobante' : ''}${json.reservesStock ? ' · reserva stock' : ''}`;
  }

  async function send() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/send', { method: 'POST', storage: localStorage, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Enviada` : salesErrorCopy(json.error);
  }

  async function approve() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/approve', { method: 'POST', storage: localStorage, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Aprobada (${json.status})` : salesErrorCopy(json.error);
  }

  async function convert() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/convert', {
      method: 'POST',
      storage: localStorage, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteId,
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
        series,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
      }),
    });
    const json = (await res.json()) as { saleId?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Convertida a venta ${json.saleId}` : salesErrorCopy(json.error);
  }

  async function cancel() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/cancel', { method: 'POST', storage: localStorage, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId, reason }) });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Cancelada (${json.status})` : salesErrorCopy(json.error);
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
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="quote-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !quotesOn}
    <div class="feature-off-banner" data-testid="caja-quote-off">
      <Icon name="info" size={18} />
      <span>Las cotizaciones no están activas para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-quote-tenant">Tienda: {session.tradeName}</p>

    <div class="quote-layout">
      <!-- Crear -->
      <section class="ledger-card section-pad">
        <CardHeader title="Nueva cotización">
          <span class="section-tag">Crear</span>
        </CardHeader>
        <Field label="Producto" id="q-product">
          <Input id="q-product" bind:value={productId} data-testid="quote-product" />
        </Field>
        <Field label="Cantidad" id="q-qty">
          <input id="q-qty" type="number" bind:value={enteredMicrounits} data-testid="quote-qty" />
        </Field>
        <Field label="Válida hasta" id="q-valid">
          <input id="q-valid" type="date" bind:value={validUntil} data-testid="quote-valid" />
        </Field>
        <Button
          variant="primary"
          data-testid="quote-create"
          onclick={() => void createQuote()}
          icon="plus"
        >
          Crear cotización
        </Button>
      </section>

      <!-- Acciones -->
      <section class="ledger-card section-pad">
        <CardHeader title="Gestionar">
          <span class="section-tag">Acciones</span>
        </CardHeader>
        <Field label="ID cotización" id="q-id">
          <Input id="q-id" bind:value={quoteId} data-testid="quote-id" placeholder="ID creado arriba" />
        </Field>
        <div class="btn-row">
          <Button
            variant="secondary"
            data-testid="quote-send"
            onclick={() => void send()}
            disabled={!quoteId}
            icon="arrow-right"
          >
            Enviar
          </Button>
          <Button
            variant="primary"
            data-testid="quote-approve"
            onclick={() => void approve()}
            disabled={!quoteId}
            icon="check"
          >
            Aprobar
          </Button>
        </div>

        <div class="separator"></div>

        <Field label="Serie al convertir" id="q-series">
          <Input id="q-series" bind:value={series} data-testid="quote-series" />
        </Field>
        <Button
          variant="success"
          data-testid="quote-convert"
          onclick={() => void convert()}
          disabled={!quoteId}
          icon="receipt"
        >
          Convertir a venta
        </Button>

        <div class="separator"></div>

        <Field label="Motivo cancelación" id="q-reason">
          <Input id="q-reason" bind:value={reason} data-testid="quote-reason" placeholder="Opcional" />
        </Field>
        <Button
          variant="danger"
          data-testid="quote-cancel"
          onclick={() => void cancel()}
          disabled={!quoteId}
          icon="x"
        >
          Cancelar
        </Button>
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


  .separator {
    border-top: 1px solid var(--border-subtle);
    margin: 0.875rem 0;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  @media (max-width: 719px) {
    .quote-layout { grid-template-columns: 1fr; }
  }
</style>
