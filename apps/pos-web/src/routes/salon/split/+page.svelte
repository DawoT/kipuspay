<script lang="ts">
  import { onMount } from 'svelte';
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { kdsEventLabel } from '$lib/ui/ops-copy';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';
  import { apiFetch } from '$lib/auth/api-client';

  const enabled = isOrdersKdsEnabled();
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  let orderId = $state('');
  let itemA = $state('');
  let itemB = $state('');
  let sessionId = $state('');
  let paymentMethodId = $state('');
  let series = $state('NV01');
  let result = $state('');
  let error = $state('');

  onMount(() => {
    sessionId = cashSessionContext(localStorage).sessionId;
  });

  async function splitBill() {
    error = '';
    result = '';
    const portions = [
      { saleId: crypto.randomUUID(), itemIds: [itemA].filter(Boolean) },
      { saleId: crypto.randomUUID(), itemIds: [itemB].filter(Boolean) },
    ].filter((p) => p.itemIds.length > 0);

    const res = await apiFetch('/api/orders/split', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        cashRegisterSessionId: sessionId,
        series,
        paymentMethodId,
        portions,
      }),
    });
    const body = (await res.json()) as {
      orderStatus?: string;
      portions?: unknown[];
      error?: string;
    };
    if (!res.ok) {
      error = body.error ?? 'split failed';
      return;
    }
    result = `Cuenta dividida en ${body.portions?.length ?? 0} pagos · ${kdsEventLabel(body.orderStatus ?? '')}`;
    publishVitrina({
      totalCents: 0,
      itemCount: portions.length,
      documentType: 'ORDER',
      phase: 'order_paid',
      message: vitrinaMessageForPhase('order_paid'),
    });
  }
</script>

<svelte:head><title>Dividir cuenta · Salón · KipusPay</title></svelte:head>

<div class="floor-board" data-testid="split-root">
  <div class="floor-toolbar">
    <h1>Dividir cuenta</h1>
    <a class="link-action" href="/salon">
      <Icon name="arrow-left" size={14} />
      Comanda de salón
    </a>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" data-testid="split-off">
      <Icon name="info" size={18} />
      <span>La división de cuenta no está activa para esta tienda.</span>
    </div>
  {:else}
    {#if error}
      <StatusMessage tone="danger" aria-live="polite" data-testid="split-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </StatusMessage>
    {/if}

    {#if result}
      <StatusMessage tone="info" aria-live="polite" data-testid="split-result">
        <Icon name="check" size={16} />
        <span>{result}</span>
      </StatusMessage>
    {/if}

    <div class="ledger-card split-card" data-testid="split">
      <div class="card-header">
        <h2>Dividir cuenta</h2>
        <span class="badge badge-indigo">Multi-pago</span>
      </div>
      <div class="split-board">
        <div class="field-group">
          <label for="sp-order">Comanda</label>
          <input id="sp-order" data-testid="split-order" bind:value={orderId} placeholder="ID de la orden" />
        </div>
        <div class="field-group">
          <label for="sp-item-a">Ítem A</label>
          <input id="sp-item-a" data-testid="split-item-a" bind:value={itemA} placeholder="Primer ítem a cobrar" />
        </div>
        <div class="field-group">
          <label for="sp-item-b">Ítem B</label>
          <input id="sp-item-b" data-testid="split-item-b" bind:value={itemB} placeholder="Segundo ítem a cobrar" />
        </div>
        <div class="field-group">
          <label for="sp-session">Sesión de caja</label>
          <input id="sp-session" data-testid="split-session" bind:value={sessionId} placeholder="Sesión de caja" />
        </div>
        <div class="field-group">
          <label for="sp-pm">Método de pago</label>
          <input id="sp-pm" data-testid="split-pm" bind:value={paymentMethodId} placeholder="Efectivo u otro método" />
        </div>
        <div class="field-group">
          <label for="sp-series">Serie documento</label>
          <input id="sp-series" data-testid="split-series" bind:value={series} />
        </div>
        <Button variant="primary" size="full" data-testid="split-submit" onclick={splitBill} icon="percent">
          Cobrar por partes
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .split-card {
    padding: var(--inset-card);
    flex: 1;
    max-width: none;
  }

  .split-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem 1rem;
    align-items: end;
  }

  .split-board :global(.ui-btn) {
    grid-column: 1 / -1;
  }

  @media (max-width: 899px) {
    .split-board {
      grid-template-columns: 1fr;
    }
  }

  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    min-height: 44px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }
</style>
