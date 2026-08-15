<script lang="ts">
  import { onMount } from 'svelte';
  import { isLedgerStoreCreditEnabled, isSalesReturnsEnabled } from '$lib/features';
  import { submitSalesReturn } from '$lib/sales/returns-client';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Money from '$lib/ui/Money.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const returnsOn = isSalesReturnsEnabled();
  const storeCreditOn = isLedgerStoreCreditEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let originSaleId = $state('');
  let series = $state('NVR1');
  let itemId = $state('');
  let qty = $state(1);
  let reason = $state('');
  let status = $state('');
  let resultMsg = $state('');
  let refundCents = $state<number | null>(null);
  let consentStoreCredit = $state(false);

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function onConfirmReturn() {
    status = 'enviando';
    resultMsg = '';
    refundCents = null;
    if (!reason.trim()) {
      status = 'error';
      resultMsg = 'El motivo de la devolución es obligatorio.';
      return;
    }
    const apiBase = resolveApiBase(localStorage);
    const auth = resolveApiAuth(localStorage).authorization ?? '';
    const res = await submitSalesReturn(apiBase, auth, {
      originSaleId: originSaleId.trim(),
      series: series.trim(),
      reason: reason.trim(),
      lines: [{ originalSaleItemId: itemId.trim(), qty: Number(qty) }],
      consentStoreCredit: storeCreditOn && consentStoreCredit,
    });
    if (!res.ok) {
      status = 'error';
      resultMsg =
        res.code === 'OUTSIDE_WINDOW'
          ? 'Fuera de la ventana de devolución permitida por la política del negocio.'
          : (res.message ?? 'Error');
      return;
    }
    status = 'ok';
    refundCents = res.refundAmountCents ?? null;
    resultMsg = `Devolución ${res.returnId ?? ''} (${res.docType ?? ''}) registrada.`;
  }
</script>

<svelte:head><title>Devolución · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-devolucion">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="rotate-ccw" size={12} /> Caja · Devolución</p>
      <h1 class="page-title">Devolución</h1>
      <p class="page-lede">Devuelve ítems dentro de la ventana del negocio. Genera nota de crédito o devolución según cómo factures. El motivo es obligatorio.</p>
    </div>
  </div>

  {#if resultMsg}
    <StatusMessage tone={status === 'ok' ? 'info' : 'danger'} aria-live="polite" data-testid="caja-return-msg">
      <Icon name={status === 'ok' ? 'check' : 'alert'} size={16} />
      <span>{resultMsg}</span>
    </StatusMessage>
  {/if}

  {#if refundCents !== null}
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">Reembolso</span>
        <Money cents={refundCents} class="stat-value emerald" data-testid="caja-return-refund" />
      </div>
    </div>
  {/if}

  {#if !returnsOn}
    <div class="feature-off-banner" data-testid="caja-returns-off">
      <Icon name="info" size={18} />
      <span>Las devoluciones no están activas para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-returns-tenant">Tienda: {session.tradeName}</p>

    <div class="ledger-card return-card">
      <CardHeader title="Procesar devolución">
        <Badge variant="danger">Reversa</Badge>
      </CardHeader>
      <div class="two-col">
        <Field label="ID venta origen" id="ret-sale">
          <Input id="ret-sale" bind:value={originSaleId} data-testid="caja-return-sale-id" />
        </Field>
        <Field label="Serie documento" id="ret-series">
          <Input id="ret-series" bind:value={series} data-testid="caja-return-series" />
        </Field>
      </div>
      <div class="two-col">
        <Field label="ID ítem original" id="ret-item">
          <Input id="ret-item" bind:value={itemId} data-testid="caja-return-item-id" />
        </Field>
        <Field label="Cantidad" id="ret-qty">
          <input id="ret-qty" type="number" min="0.001" step="any" bind:value={qty} data-testid="caja-return-qty" />
        </Field>
      </div>
      <Field label="Motivo (obligatorio)" id="ret-reason">
        <Input id="ret-reason" bind:value={reason} data-testid="caja-return-reason" placeholder="Escribe el motivo de la devolución" />
      </Field>
      {#if storeCreditOn}
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={consentStoreCredit} data-testid="caja-return-store-credit" />
          <span>Convertir reembolso en crédito de tienda (sin efectivo ni CxC)</span>
        </label>
      {/if}
      <Button
        variant="danger"
        data-testid="caja-return-confirm"
        onclick={onConfirmReturn}
        disabled={status === 'enviando'}
        busy={status === 'enviando'}
        icon="rotate-ccw"
      >
        {status === 'enviando' ? 'Procesando…' : 'Confirmar devolución'}
      </Button>
    </div>
  {/if}
</div>

<style>
  .return-card {
    padding: var(--inset-card);
    max-width: 40rem;
  }
  .checkbox-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.875rem; cursor: pointer; font-size: 0.875rem; color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 500; }
  .checkbox-row input { width: auto; cursor: pointer; accent-color: var(--accent-primary); }
  .tenant-line { font-size: 0.8125rem; color: var(--text-dim); font-family: var(--font-mono); }
</style>
