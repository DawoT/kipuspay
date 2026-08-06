<script lang="ts">
  import { isOrdersKdsEnabled } from '$lib/features';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';

  const enabled = isOrdersKdsEnabled();
  let tableLabel = $state('1');
  let productId = $state('');
  let quantity = $state(1);
  let orderId = $state('');
  let status = $state('');
  let error = $state('');

  async function createAndFire() {
    error = '';
    status = '';
    try {
      const createRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: 'default',
          tableLabel,
          items: [{ productId, quantity }],
        }),
      });
      const created = (await createRes.json()) as { id?: string; error?: string };
      if (!createRes.ok) {
        error = created.error ?? 'create failed';
        return;
      }
      orderId = created.id ?? '';
      publishVitrina({
        totalCents: 0,
        itemCount: quantity,
        documentType: 'ORDER',
        phase: 'order_open',
        message: vitrinaMessageForPhase('order_open', tableLabel),
        tableLabel,
      });

      const fireRes = await fetch('/api/orders/fire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const fired = (await fireRes.json()) as { status?: string; error?: string };
      if (!fireRes.ok) {
        error = fired.error ?? 'fire failed';
        return;
      }
      status = fired.status ?? 'FIRED';
      publishVitrina({
        totalCents: 0,
        itemCount: quantity,
        documentType: 'ORDER',
        phase: 'order_fired',
        message: vitrinaMessageForPhase('order_fired', tableLabel),
        tableLabel,
      });
    } catch (e) {
      error = String(e);
    }
  }
</script>

{#if !enabled}
  <p data-testid="salon-off">Comandas desactivadas (FEATURE_ORDERS_KDS off).</p>
{:else}
  <main data-testid="salon">
    <h1>Salón — comanda</h1>
    <label>
      Mesa
      <input data-testid="salon-table" bind:value={tableLabel} />
    </label>
    <label>
      Producto
      <input data-testid="salon-product" bind:value={productId} />
    </label>
    <label>
      Cantidad
      <input data-testid="salon-qty" type="number" min="1" bind:value={quantity} />
    </label>
    <button type="button" data-testid="salon-fire" onclick={createAndFire}>Enviar a cocina</button>
    {#if orderId}
      <p data-testid="salon-order-id">{orderId}</p>
    {/if}
    {#if status}
      <p data-testid="salon-status">{status}</p>
    {/if}
    {#if error}
      <p data-testid="salon-error">{error}</p>
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
