<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesReturnsEnabled } from '$lib/features';
  import { submitSalesReturn } from '$lib/sales/returns-client';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const returnsOn = isSalesReturnsEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let originSaleId = $state('');
  let series = $state('NVR1');
  let itemId = $state('');
  let qty = $state(1);
  let reason = $state('');
  let status = $state('');
  let resultMsg = $state('');
  let refundCents = $state<number | null>(null);

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

<section class="caja-return" data-testid="caja-devolucion">
  <h1>Devolución</h1>
  <p class="lede">
    Devolvé ítems de una venta dentro de la ventana N días. Genera NC (07) o NV_RETURN según
    formalización. Motivo obligatorio.
  </p>

  {#if !returnsOn}
    <p class="off" data-testid="caja-returns-off">
      PUBLIC_FEATURE_SALES_RETURNS desactivado. Activá el flag para devoluciones en caja.
    </p>
  {:else}
    <p data-testid="caja-returns-tenant">Tenant {session.tenantId}</p>

    <label>
      ID venta origen
      <input bind:value={originSaleId} data-testid="caja-return-sale-id" />
    </label>
    <label>
      Serie documento
      <input bind:value={series} data-testid="caja-return-series" />
    </label>
    <label>
      ID ítem original
      <input bind:value={itemId} data-testid="caja-return-item-id" />
    </label>
    <label>
      Cantidad
      <input type="number" min="0.001" step="any" bind:value={qty} data-testid="caja-return-qty" />
    </label>
    <label>
      Motivo (obligatorio)
      <input bind:value={reason} data-testid="caja-return-reason" />
    </label>

    <button type="button" data-testid="caja-return-confirm" onclick={onConfirmReturn}>
      Confirmar devolución
    </button>

    {#if status}
      <p data-testid="caja-return-status">{status}</p>
    {/if}
    {#if resultMsg}
      <p data-testid="caja-return-msg">{resultMsg}</p>
    {/if}
    {#if refundCents !== null}
      <p data-testid="caja-return-refund">Reembolso: {formatCents(refundCents)}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-return {
    max-width: 32rem;
    margin: 1.5rem auto;
    padding: 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .lede {
    color: #444;
    margin-bottom: 1rem;
  }
  .off {
    color: #8a1f1f;
  }
  label {
    display: block;
    margin: 0.5rem 0;
  }
  input {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
  }
  button {
    margin-top: 1rem;
  }
</style>
