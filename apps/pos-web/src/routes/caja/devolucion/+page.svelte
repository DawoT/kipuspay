<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled, isSalesReturnsEnabled } from '$lib/features';
  import { submitSalesReturn } from '$lib/sales/returns-client';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';

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
    const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await submitSalesReturn(apiBase || 'https://api.kipuspay.local', auth, {
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
      <p class="page-lede">Devuelve ítems dentro de la ventana N días. Genera NC (07) o NV_RETURN según formalización. Motivo obligatorio.</p>
    </div>
  </div>

  {#if resultMsg}
    <div class="status-alert {status === 'ok' ? 'info' : 'danger'}" aria-live="polite" data-testid="caja-return-msg">
      <Icon name={status === 'ok' ? 'check' : 'alert'} size={16} />
      <span>{resultMsg}</span>
    </div>
  {/if}

  {#if refundCents !== null}
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">Reembolso</span>
        <span class="stat-value emerald" data-testid="caja-return-refund">{formatCents(refundCents)}</span>
      </div>
    </div>
  {/if}

  {#if !returnsOn}
    <div class="feature-off-banner" data-testid="caja-returns-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_SALES_RETURNS</code> desactivado.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-returns-tenant">Tenant {session.tenantId}</p>

    <div class="glass-card return-card">
      <div class="card-header">
        <h2>Procesar devolución</h2>
        <span class="badge badge-danger">Reversa</span>
      </div>
      <div class="two-col">
        <div class="field-group">
          <label for="ret-sale">ID venta origen</label>
          <input id="ret-sale" bind:value={originSaleId} data-testid="caja-return-sale-id" />
        </div>
        <div class="field-group">
          <label for="ret-series">Serie documento</label>
          <input id="ret-series" bind:value={series} data-testid="caja-return-series" />
        </div>
      </div>
      <div class="two-col">
        <div class="field-group">
          <label for="ret-item">ID ítem original</label>
          <input id="ret-item" bind:value={itemId} data-testid="caja-return-item-id" />
        </div>
        <div class="field-group">
          <label for="ret-qty">Cantidad</label>
          <input id="ret-qty" type="number" min="0.001" step="any" bind:value={qty} data-testid="caja-return-qty" />
        </div>
      </div>
      <div class="field-group">
        <label for="ret-reason">Motivo (obligatorio)</label>
        <input id="ret-reason" bind:value={reason} data-testid="caja-return-reason" placeholder="Escribe el motivo de la devolución" />
      </div>
      {#if storeCreditOn}
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={consentStoreCredit} data-testid="caja-return-store-credit" />
          <span>Convertir reembolso en crédito de tienda (sin efectivo ni CxC)</span>
        </label>
      {/if}
      <button type="button" class="primary danger-btn" data-testid="caja-return-confirm" onclick={onConfirmReturn} disabled={status === 'enviando'}>
        <Icon name="rotate-ccw" size={14} />
        {status === 'enviando' ? 'Procesando…' : 'Confirmar devolución'}
      </button>
    </div>
  {/if}
</div>

<style>
  .return-card {
    padding: 1.25rem;
    max-width: 40rem;
  }
  .field-group { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.875rem; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .checkbox-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.875rem; cursor: pointer; font-size: 0.875rem; color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 500; }
  .checkbox-row input { width: auto; cursor: pointer; accent-color: var(--accent-primary); }
  .tenant-line { font-size: 0.8125rem; color: var(--text-dim); font-family: var(--font-mono); }
  .danger-btn { background: rgba(217, 106, 60, 0.15); color: var(--rose-red); border: 1px solid rgba(217, 106, 60, 0.35); }
  .danger-btn:hover { background: rgba(217, 106, 60, 0.25); }
  @media (max-width: 600px) { .two-col { grid-template-columns: 1fr; } }
</style>
