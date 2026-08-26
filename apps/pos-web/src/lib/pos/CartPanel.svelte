<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { addOrBumpLine, cartPayableCents, cartTotalCents, type CartLine } from '$lib/pos-checkout/cart';
  import { requiresCustomerIdentity } from '$lib/pos-checkout/charge';
  import { stitchClass, stitchStateFromFlags } from '$lib/ui/sync-stitch';
  import { chargeButtonLabel } from '$lib/ui/cashier-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';

  let {
    lines = $bindable([]),
    status = 'listo',
    message = '',
    tipCents = $bindable<number | null>(0),
    tipOn = false,
    clientDocNumber = '',
    clientName = '',
    chargeSettled = false,
    onCharge,
    onQuickSale,
    onRemoveLine,
    onUpdateQuantity,
  }: {
    lines: CartLine[];
    status: string;
    message: string;
    tipCents?: number | null;
    tipOn?: boolean;
    clientDocNumber?: string;
    clientName?: string;
    chargeSettled?: boolean;
    onCharge: () => void;
    onQuickSale: () => void;
    onRemoveLine: (productId: string) => void;
    onUpdateQuantity: (productId: string, delta: number) => void;
  } = $props();

  const totalCents = $derived(cartTotalCents(lines));
  const payableCents = $derived(cartPayableCents(lines));

  // Micro-interacción carrito: scale 0.98→1 120ms (GTM §6.4) — bump por addOrBumpLine
  let bumpedId = $state<string | null>(null);
  let bumpTimer: ReturnType<typeof setTimeout> | null = null;
  function lineKey(line: CartLine): string {
    return `${line.productId}|${line.uomId ?? ''}|${line.serialId ?? ''}|${line.weightMeasurement?.measurementId ?? ''}|${line.saleItemId ?? ''}`;
  }
  export function triggerCartBump(next: CartLine): void {
    const key = lineKey(next);
    bumpedId = key;
    if (bumpTimer) clearTimeout(bumpTimer);
    bumpTimer = setTimeout(() => {
      bumpedId = null;
    }, 160);
  }

  const cobroStitch = $derived(
    stitchClass(
      stitchStateFromFlags({
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        pendingCount: 0,
        charging: status === 'cobrando',
      }),
    ),
  );

  // Feedback optimista <100ms: Skeleton shimmer 1.4s en total al mutar carrito (usa Skeleton.svelte)
  let optimisticTotal = $state(false);
  let optimisticTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void lines.length;
    void payableCents;
    if (lines.length === 0) {
      optimisticTotal = false;
      if (optimisticTimer) {
        clearTimeout(optimisticTimer);
        optimisticTimer = null;
      }
      return;
    }
    optimisticTotal = true;
    if (optimisticTimer) clearTimeout(optimisticTimer);
    optimisticTimer = setTimeout(() => {
      optimisticTotal = false;
    }, 80);
    return () => {
      if (optimisticTimer) clearTimeout(optimisticTimer);
    };
  });
</script>

<section class="ledger-card cart-panel">
  <div class="card-header">
    <h2>Detalle de Venta</h2>
    <span class="badge badge-success" data-testid="cart-item-count"
      >{lines.length} {lines.length === 1 ? 'ítem' : 'ítems'}</span
    >
  </div>

  <!-- Items List -->
  <div class="cart-items-scroll">
    {#if lines.length === 0}
      <EmptyState
        icon="cart"
        title="El carrito está vacío"
        description="Agrega un producto del catálogo o cobra una venta rápida."
      >
        <Button variant="secondary" data-testid="empty-cart-quick" onclick={onQuickSale}>
          Venta rápida
        </Button>
      </EmptyState>
    {:else}
      {#each lines as line (line.productId + (line.saleItemId ?? '') + (line.weightMeasurement?.measurementId ?? '') + (line.serialId ?? '') + (line.uomId ?? ''))}
        <div class="cart-item-row" class:bump={bumpedId === lineKey(line)} data-testid="cart-item-row">
          <div class="item-details">
            <span class="item-name">{line.name}</span>
            <span class="item-unit-price tabular-nums">S/ {formatCents(line.unitPriceCents)} c/u</span>
          </div>
          <div class="item-actions">
            <div class="quantity-controls">
              <button type="button" class="qty-btn" aria-label="Quitar uno" onclick={() => onUpdateQuantity(line.productId, -1)}
                >-</button
              >
              <span class="qty-value tabular-nums">{line.quantity}</span>
              <button type="button" class="qty-btn" aria-label="Agregar uno" onclick={() => onUpdateQuantity(line.productId, 1)}
                >+</button
              >
            </div>
            <span class="item-line-total tabular-nums">
              S/ {formatCents(line.unitPriceCents * line.quantity)}
            </span>
            <button
              type="button"
              class="remove-item-btn"
              aria-label="Quitar del carrito"
              onclick={() => onRemoveLine(line.productId)}>×</button
            >
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Total & Charge Section -->
  <div class="cart-summary-footer">
    {#if payableCents < totalCents}
      <div class="cart-discount-row" data-testid="cart-discount-badge">
        <span class="badge badge-warning">Descuento aplicado: -S/ {formatCents(totalCents - payableCents)}</span>
      </div>
    {/if}

    <div class="summary-total-box">
      <span class="total-label">Total a cobrar</span>
      {#if optimisticTotal}
        <Skeleton lines={1} width="8rem" data-testid="total-skeleton" />
      {:else}
        <span data-testid="total" class={['total-amount', 'tabular-nums', cobroStitch, chargeSettled && 'settled']}>
          S/ {formatCents(payableCents)}
        </span>
      {/if}
    </div>

    {#if chargeSettled}
      <div class="settled-seal" data-testid="settled-seal" role="status" aria-live="polite">
        <span class="settled-seal-check" aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
        <BrandKnot size={10} />
        <span class="settled-label">Venta cobrada</span>
      </div>
    {/if}

    <!-- Status Alerts -->
    {#if status}
      <StatusMessage tone="warning">
        <span data-testid="status" class="status-tag">{status}</span>
        {#if message}
          <span data-testid="message" class="status-msg">{message}</span>
        {/if}
      </StatusMessage>
    {/if}

    <!-- Primary Action Button -->
    {#if requiresCustomerIdentity(totalCents, clientDocNumber, clientName)}
      <StatusMessage tone="warning" role="alert" data-testid="id-required">
        Boleta ≥ S/ 700 requiere documento y nombre del cliente (SUNAT).
      </StatusMessage>
    {/if}
    {#if tipOn}
      <div class="tip-input-row">
        <label for="tip-cents">Propina</label>
        <MoneyInput id="tip-cents" bind:value={tipCents} min={0} data-testid="tip-cents" placeholder="0" />
        {#each [0.05, 0.1, 0.15] as frac}
          <button
            type="button"
            class="secondary tip-quick"
            data-testid={`tip-quick-${frac}`}
            onclick={() => (tipCents = Math.round(payableCents * frac))}
          >
            {Math.round(frac * 100)}%
          </button>
        {/each}
      </div>
    {/if}
    <div data-testid="charge">
      <Button
        variant="primary"
        size="xl"
        data-testid="charge-btn"
        onclick={onCharge}
        disabled={lines.length === 0}
        icon="credit-card"
      >
        {chargeButtonLabel(formatCents(payableCents))}
      </Button>
    </div>
    <Button
      variant="secondary"
      size="xl"
      data-testid="quick-sale"
      style="margin-top: 0.5rem"
      onclick={onQuickSale}
      icon="plus"
    >
      Venta rápida (sin catálogo)
    </Button>
  </div>
</section>

<style>
  .cart-panel {
    display: flex;
    flex-direction: column;
    min-height: 520px;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .card-header h2 {
    font-size: 1.125rem;
    font-weight: 700;
  }
  .cart-items-scroll {
    flex: 1;
    overflow-y: auto;
    max-height: 320px;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .cart-item-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  @keyframes cart-bump {
    from {
      transform: scale(0.98);
    }
    to {
      transform: scale(1);
    }
  }
  .cart-item-row.bump {
    animation: cart-bump 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .item-details {
    display: flex;
    flex-direction: column;
  }
  .item-name {
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .item-unit-price {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .quantity-controls {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }
  .qty-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-main);
    font-weight: 700;
    transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .qty-btn:active {
    transform: scale(0.96);
  }
  .qty-value {
    padding: 0 0.5rem;
    font-weight: 700;
    font-size: 0.875rem;
  }
  .item-line-total {
    font-weight: 700;
    color: var(--emerald-green);
  }
  .remove-item-btn {
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 1.25rem;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
  }
  .remove-item-btn:hover {
    color: var(--rose-red);
  }
  .cart-summary-footer {
    border-top: 1px solid var(--border-subtle);
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .summary-total-box {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .total-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
  .total-amount {
    font-family: var(--font-mono);
    font-size: 2.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--text-main);
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.625rem;
  }
  .total-amount.settled {
    color: var(--emerald-green);
    animation: pulse-emerald 2s infinite;
    box-shadow: var(--shadow-emerald);
    border-radius: var(--radius-sm);
    padding: 0.625rem 0.5rem 0.5rem;
  }
  .settled-seal {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid color-mix(in srgb, var(--emerald-green) 30%, transparent);
    background: color-mix(in srgb, var(--emerald-green) 12%, transparent);
    color: var(--emerald-green);
    font-weight: 700;
    font-size: 0.875rem;
    box-shadow: var(--shadow-emerald);
    border-radius: var(--radius-sm);
  }
  .settled-seal-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-full);
    background: var(--emerald-green);
    color: #ffffff;
  }
  .settled-label {
    letter-spacing: 0.01em;
  }
  .status-tag {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent-primary);
  }
  .status-msg {
    font-size: 0.8125rem;
    color: var(--text-main);
  }
  .tip-input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .cart-item-row.bump,
    .total-amount.settled,
    .qty-btn,
    .qty-btn:active {
      animation: none !important;
      transition: none !important;
      transform: none !important;
    }
  }
</style>
