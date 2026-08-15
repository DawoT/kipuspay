<script lang="ts">
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';
  import { kdsEventLabel } from '$lib/ui/ops-copy';
  import { apiFetch } from '$lib/auth/api-client';

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
      const createRes = await apiFetch('/api/orders', {
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
        error = created.error ?? 'No se pudo crear la comanda.';
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

      const fireRes = await apiFetch('/api/orders/fire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const fired = (await fireRes.json()) as { status?: string; error?: string };
      if (!fireRes.ok) {
        error = fired.error ?? 'No se pudo enviar a cocina.';
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

<svelte:head><title>Salón · KipusPay</title></svelte:head>

<div class="floor-board" data-testid="salon-root">
  <div class="floor-toolbar">
    <h1>Salón</h1>
    <a class="link-action" href="/salon/split">
      <Icon name="percent" size={14} />
      Dividir cuenta
    </a>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" data-testid="salon-off">
      <Icon name="info" size={18} />
      <span>Las comandas no están activas para esta tienda.</span>
    </div>
  {:else}
    {#if error}
      <StatusMessage tone="danger" aria-live="polite" data-testid="salon-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </StatusMessage>
    {/if}

    {#if status}
      <StatusMessage tone="info" aria-live="polite" data-testid="salon-status">
        <Icon name="check" size={16} />
        <span>Estado: {kdsEventLabel(status)}</span>
      </StatusMessage>
    {/if}

    <div class="ledger-card salon-card" data-testid="salon">
      <div class="card-header">
        <h2>Nueva comanda</h2>
        <span class="badge badge-warning">Mesa {tableLabel || '—'}</span>
      </div>
      <div class="salon-board">
        <div class="field-group">
          <label for="salon-tbl">Mesa / Ubicación</label>
          <input id="salon-tbl" data-testid="salon-table" bind:value={tableLabel} placeholder="Ej. 12" />
        </div>
        <div class="field-group">
          <label for="salon-prod">Producto</label>
          <input id="salon-prod" data-testid="salon-product" bind:value={productId} placeholder="Código o nombre" />
        </div>
        <div class="field-group">
          <label for="salon-qty-input">Cantidad</label>
          <input id="salon-qty-input" data-testid="salon-qty" type="number" min="1" bind:value={quantity} />
        </div>
        <Button variant="primary" size="full" data-testid="salon-fire" onclick={createAndFire} icon="plus">
          Enviar a cocina
        </Button>
      </div>

      {#if orderId}
        <div class="order-id-box" data-testid="salon-order-id">
          <span class="label">Comanda:</span>
          <code>{orderId}</code>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .salon-card {
    padding: 1.25rem;
    flex: 1;
    max-width: none;
  }

  .salon-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem 1rem;
    align-items: end;
  }

  .salon-board :global(.ui-btn) {
    grid-column: 1 / -1;
  }

  @media (max-width: 899px) {
    .salon-board {
      grid-template-columns: 1fr;
    }
  }

  .order-id-box {
    margin-top: 1rem;
    padding: 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .order-id-box code {
    font-family: var(--font-mono);
    color: var(--accent-primary);
    font-weight: 700;
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
    transition: all var(--transition-fast);
    min-height: 44px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }
</style>
