<script lang="ts">
  import { isOrdersKdsEnabled } from '$lib/features';
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

{#if !enabled}
  <p data-testid="split-off">Split desactivado (FEATURE_ORDERS_KDS off).</p>
{:else}
  <main data-testid="split">
    <h1>Split bill</h1>
    <label>Orden <input data-testid="split-order" bind:value={orderId} /></label>
    <label>Ítem A <input data-testid="split-item-a" bind:value={itemA} /></label>
    <label>Ítem B <input data-testid="split-item-b" bind:value={itemB} /></label>
    <label>Sesión caja <input data-testid="split-session" bind:value={sessionId} /></label>
    <label>Método pago <input data-testid="split-pm" bind:value={paymentMethodId} /></label>
    <label>Serie <input data-testid="split-series" bind:value={series} /></label>
    <button type="button" data-testid="split-submit" onclick={splitBill}>Cobrar split</button>
    {#if result}
      <p data-testid="split-result">{result}</p>
    {/if}
    {#if error}
      <p data-testid="split-error">{error}</p>
    {/if}
  </main>
{/if}

<style>
  main {
    max-width: 28rem;
    margin: 2rem auto;
    display: grid;
    gap: 0.75rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
</style>
