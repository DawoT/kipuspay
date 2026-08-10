<script lang="ts">
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';

  const enabled = isOrdersKdsEnabled();
  let orderId = $state('');
  let itemA = $state('');
  let itemB = $state('');
  let sessionId = $state('');
  let paymentMethodId = $state('');
  let series = $state('NV01');
  let result = $state('');
  let error = $state('');

  async function splitBill() {
    error = '';
    result = '';
    const portions = [
      { saleId: crypto.randomUUID(), itemIds: [itemA].filter(Boolean) },
      { saleId: crypto.randomUUID(), itemIds: [itemB].filter(Boolean) },
    ].filter((p) => p.itemIds.length > 0);

    const res = await fetch('/api/orders/split', {
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
    result = `${body.orderStatus} · ${body.portions?.length ?? 0} sales`;
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

<div class="page-shell" data-testid="split-root">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="percent" size={12} /> Restaurante · Salón</p>
      <h1 class="page-title">Dividir cuenta (Split Bill)</h1>
      <p class="page-lede">Divide una comanda de mesa entre múltiples pagos independientes.</p>
    </div>
    <a class="link-action" href="/salon">
      <Icon name="arrow-left" size={14} />
      Comanda de salón
    </a>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" data-testid="split-off">
      <Icon name="info" size={18} />
      <span>Split desactivado (<code>FEATURE_ORDERS_KDS</code> off).</span>
    </div>
  {:else}
    {#if error}
      <div class="status-alert danger" aria-live="polite" data-testid="split-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if result}
      <div class="status-alert info" aria-live="polite" data-testid="split-result">
        <Icon name="check" size={16} />
        <span>{result}</span>
      </div>
    {/if}

    <div class="glass-card split-card" data-testid="split">
      <div class="card-header">
        <h2>Dividir orden</h2>
        <span class="badge badge-indigo">Multi-pago</span>
      </div>
      <div class="field-group">
        <label for="sp-order">ID Orden / Comanda</label>
        <input id="sp-order" data-testid="split-order" bind:value={orderId} placeholder="ID de la orden" />
      </div>

      <div class="two-col">
        <div class="field-group">
          <label for="sp-item-a">ID Ítem A</label>
          <input id="sp-item-a" data-testid="split-item-a" bind:value={itemA} placeholder="Primer ítem a cobrar" />
        </div>
        <div class="field-group">
          <label for="sp-item-b">ID Ítem B</label>
          <input id="sp-item-b" data-testid="split-item-b" bind:value={itemB} placeholder="Segundo ítem a cobrar" />
        </div>
      </div>

      <div class="two-col">
        <div class="field-group">
          <label for="sp-session">Sesión de caja</label>
          <input id="sp-session" data-testid="split-session" bind:value={sessionId} placeholder="s-demo" />
        </div>
        <div class="field-group">
          <label for="sp-pm">Método de pago</label>
          <input id="sp-pm" data-testid="split-pm" bind:value={paymentMethodId} placeholder="pm-cash" />
        </div>
      </div>

      <div class="field-group">
        <label for="sp-series">Serie documento</label>
        <input id="sp-series" data-testid="split-series" bind:value={series} />
      </div>

      <button type="button" class="primary split-btn" data-testid="split-submit" onclick={splitBill}>
        <Icon name="percent" size={14} />
        Cobrar split
      </button>
    </div>
  {/if}
</div>

<style>
  .split-card {
    padding: 1.25rem;
    max-width: 32rem;
  }

  .field-group { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.875rem; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .split-btn { width: 100%; margin-top: 0.5rem; }

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
    transition: all var(--transition-fast);
    min-height: 38px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  @media (max-width: 600px) { .two-col { grid-template-columns: 1fr; } }
</style>
