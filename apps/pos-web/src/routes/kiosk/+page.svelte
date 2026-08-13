<script lang="ts">
  /**
   * Kiosko thin: mismos guards fiscales que caja (chargeCartOffline).
   */
  import { formatCents } from '$lib/cents';
  import { isPosCheckoutEnabled } from '$lib/features';
  import { chargeCartOffline } from '$lib/pos-checkout/charge';
  import { createMemoryOfflineIdb, OfflineQueueStore } from '$lib/offline-sync/offline-queue';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  const enabled = isPosCheckoutEnabled();
  const queue = new OfflineQueueStore(createMemoryOfflineIdb());
  let message = $state('');
  let status = $state('idle');

  async function pay() {
    status = 'confirming';
    const outcome = await chargeCartOffline(
      [{ productId: 'k1', name: 'Item kiosko', unitPriceCents: 1180, quantity: 1 }],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b-kiosk',
        cashRegisterSessionId: 's-kiosk',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm-cash',
      },
      queue,
    );
    status = outcome.ok ? 'charged' : 'blocked';
    message = outcome.ok ? `OK ${outcome.documentType}` : outcome.message;
  }
</script>

<svelte:head><title>Kiosko de Autoatención · KipusPay</title></svelte:head>

<div class="kiosk-container" data-testid="kiosk-root">
  {#if !enabled}
    <div class="feature-off-banner" data-testid="kiosk-off">
      <Icon name="info" size={18} />
      <span>El kiosko está desactivado para esta tienda.</span>
    </div>
  {:else}
    <div class="glass-card kiosk-card">
      <div class="kiosk-header">
        <div class="brand-badge">
          <Icon name="store" size={24} />
        </div>
        <p class="page-eyebrow">Autoatención</p>
        <h1 class="page-title">Kiosko de pedidos</h1>
        <p class="page-lede">Realiza tu pedido y pago directo en autoservicio.</p>
      </div>

      <div class="cart-summary">
        <div class="cart-item">
          <span class="item-name">Producto de ejemplo</span>
          <span class="item-price tabular-nums">S/ {formatCents(1180)}</span>
        </div>
        <div class="total-row">
          <span>Total a pagar</span>
          <span class="total-amount tabular-nums">S/ {formatCents(1180)}</span>
        </div>
      </div>

      {#if message}
        <StatusMessage tone={status === 'charged' ? 'info' : 'danger'} aria-live="polite" data-testid="kiosk-message">
          <Icon name={status === 'charged' ? 'check' : 'alert'} size={16} />
          <span>{message}</span>
        </StatusMessage>
      {/if}

      <div class="status-line" data-testid="kiosk-status">
        Estado: <strong>{status}</strong>
      </div>

      <button
        type="button"
        class="primary pay-btn"
        data-testid="kiosk-pay"
        onclick={pay}
        disabled={status === 'confirming'}
      >
        <Icon name="credit-card" size={18} />
        {status === 'confirming' ? 'Procesando…' : 'Confirmar pago'}
      </button>
    </div>
  {/if}
</div>

<style>
  .kiosk-container {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .kiosk-card {
    max-width: 28rem;
    width: 100%;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .kiosk-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .brand-badge {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: var(--radius-full);
    background: rgba(217, 154, 61, 0.15);
    border: 1px solid var(--border-glow);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-primary);
    margin-bottom: 0.5rem;
  }

  .cart-summary {
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .cart-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.9375rem;
    color: var(--text-main);
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.75rem;
    font-weight: 700;
  }

  .total-amount {
    font-family: var(--font-mono);
    font-size: 1.35rem;
    color: var(--accent-primary);
  }

  .status-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    text-align: center;
  }

  .pay-btn {
    width: 100%;
    padding: 0.875rem;
    font-size: 1.05rem;
  }
</style>
