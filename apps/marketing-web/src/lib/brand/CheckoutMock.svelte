<script lang="ts">
  import PhoneMockFrame from '$lib/components/PhoneMockFrame.svelte';
  import { formatCents, sumCents } from './money';

  interface CheckoutLine {
    readonly qty: number;
    readonly name: string;
    readonly amount_cents: number;
  }

  interface Props {
    lines: readonly CheckoutLine[];
    documentLabel: string;
    register?: string;
    syncState?: 'pending' | 'synced';
    caption?: string;
    theme?: 'light' | 'dark';
  }

  let {
    lines,
    documentLabel,
    register = 'Caja 1',
    syncState: initialSyncState = 'pending',
    caption,
    theme = 'light',
  }: Props = $props();

  let activeSyncState = $state<'pending' | 'synced'>(initialSyncState);
  let isCharging = $state(false);
  let selectedMethod = $state<'efectivo' | 'yape' | 'tarjeta'>('yape');

  const total_cents = $derived(sumCents(lines.map((line) => line.amount_cents)));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

  function triggerCheckout() {
    if (isCharging) return;
    isCharging = true;
    activeSyncState = 'pending';
    setTimeout(() => {
      activeSyncState = 'synced';
      isCharging = false;
    }, 650);
  }
</script>

<figure
  class="pos-container"
  class:theme-dark={theme === 'dark'}
  class:theme-light={theme === 'light'}
  data-testid="checkout-mock"
  data-theme={theme}
>
  <PhoneMockFrame
    {theme}
    title="Modo Mostrador · KipusPay"
    statusBadge={activeSyncState === 'synced' ? 'Comprobante emitido · EN VIVO' : 'Turno Abierto · EN VIVO'}
    statusTone="live"
    ariaLabel={`Smartphone mostrando la pantalla de cobro de ${documentLabel}`}
  >
    <div class="pos-screen">
      <div class="doc-header">
        <div class="doc-meta">
          <span class="doc-badge">{documentLabel}</span>
          <span class="reg-tag">{register}</span>
        </div>
        <span class="doc-number">KP-00342</span>
      </div>

      <div class="cart-scroll-area">
        <ul class="lines">
          {#each lines as line (line.name)}
            <li>
              <span class="qty">{line.qty}x</span>
              <span class="name">{line.name}</span>
              <span class="amount">S/ {formatCents(line.amount_cents)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <div class="fiscal-breakdown">
        <div class="fiscal-row">
          <span class="fiscal-label">OP. GRAVADA</span>
          <span class="fiscal-amount">S/ {formatCents(Math.round(total_cents / 1.18))}</span>
        </div>
        <div class="fiscal-row">
          <span class="fiscal-label">I.G.V. (18%)</span>
          <span class="fiscal-amount">S/ {formatCents(total_cents - Math.round(total_cents / 1.18))}</span>
        </div>
      </div>

      <div class="total-row">
        <span class="total-label">TOTAL A COBRAR</span>
        <span class="total-amount">S/ {formatCents(total_cents)}</span>
      </div>

      <div class="payment-methods" role="group" aria-label="Medios de pago">
        <button
          type="button"
          class="method-btn"
          class:active={selectedMethod === 'efectivo'}
          onclick={() => (selectedMethod = 'efectivo')}
        >
          Efectivo
        </button>
        <button
          type="button"
          class="method-btn"
          class:active={selectedMethod === 'yape'}
          onclick={() => (selectedMethod = 'yape')}
        >
          Yape / Plin
        </button>
        <button
          type="button"
          class="method-btn"
          class:active={selectedMethod === 'tarjeta'}
          onclick={() => (selectedMethod = 'tarjeta')}
        >
          Tarjeta
        </button>
      </div>

      <div class="action-footer">
        <button
          type="button"
          class="pay-btn"
          onclick={triggerCheckout}
          disabled={isCharging}
        >
          {#if isCharging}
            Procesando…
          {:else if activeSyncState === 'synced'}
            Comprobante emitido ✓
          {:else}
            Cobrar venta S/ {formatCents(total_cents)}
          {/if}
        </button>
      </div>

      <div class="ticket-perforation" aria-hidden="true"></div>

      <div class="ticket-validation">
        <span class="validation-code">RESUMEN: KP-{formatCents(total_cents).replace(/[.,]/g, '')}-F89A</span>
        <span class="validation-badge">COMPROBANTE AUTORIZADO</span>
      </div>

      <div class="ticket-bottom-tear" aria-hidden="true"></div>
    </div>
  </PhoneMockFrame>

  {#if caption}
    <figcaption class="caption">{caption}</figcaption>
  {/if}
</figure>

<style>
  .pos-container {
    margin: 0 auto;
    width: 380px;
    max-width: 100%;
  }

  .pos-screen {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    gap: 0.55rem;
    padding: 0.2rem 0.1rem;
    font-family: var(--font-sans);
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.4rem;
    border-bottom: 1px dashed rgba(20, 22, 28, 0.12);
  }

  .theme-dark .doc-header {
    border-bottom-color: rgba(243, 239, 230, 0.12);
  }

  .doc-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .doc-badge {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: #14161c;
    color: #ffffff;
  }

  .theme-dark .doc-badge {
    background: var(--amber);
    color: var(--ink);
  }

  .reg-tag {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(20, 22, 28, 0.6);
  }

  .theme-dark .reg-tag {
    color: rgba(243, 239, 230, 0.6);
  }

  .doc-number {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(20, 22, 28, 0.5);
  }

  .theme-dark .doc-number {
    color: rgba(243, 239, 230, 0.5);
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 180px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-right: 0.25rem;
  }

  .lines::-webkit-scrollbar {
    width: 4px;
  }
  .lines::-webkit-scrollbar-thumb {
    background: rgba(20, 22, 28, 0.2);
    border-radius: 4px;
  }
  .theme-dark .lines::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
  }

  .lines li {
    display: flex;
    align-items: baseline;
    font-size: 0.8rem;
    padding: 0.2rem 0;
  }

  .qty {
    font-family: var(--font-mono);
    font-weight: 700;
    width: 1.8rem;
    color: #8c5a14;
    flex-shrink: 0;
  }

  .theme-dark .qty {
    color: var(--amber-bright);
  }

  .name {
    flex: 1;
    font-weight: 500;
    color: var(--ink);
  }

  .theme-dark .name {
    color: var(--paper);
  }

  .amount {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.82rem;
    color: var(--ink);
  }

  .theme-dark .amount {
    color: var(--paper);
  }

  .fiscal-breakdown {
    background: #f8fafc;
    border: 1px solid rgba(20, 22, 28, 0.06);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .theme-dark .fiscal-breakdown {
    background: rgba(243, 239, 230, 0.04);
    border-color: rgba(243, 239, 230, 0.08);
  }

  .fiscal-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(20, 22, 28, 0.6);
  }

  .theme-dark .fiscal-row {
    color: rgba(243, 239, 230, 0.6);
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.4rem 0.2rem 0.2rem;
    border-top: 2px solid var(--ink);
  }

  .theme-dark .total-row {
    border-top-color: var(--amber);
  }

  .total-label {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--ink);
  }

  .theme-dark .total-label {
    color: var(--paper);
  }

  .total-amount {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ink);
  }

  .theme-dark .total-amount {
    color: var(--amber-bright);
  }

  .payment-methods {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
    margin-top: 0.2rem;
  }

  .method-btn {
    min-height: 36px;
    background: #f1f5f9;
    border: 1px solid rgba(20, 22, 28, 0.1);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .theme-dark .method-btn {
    background: rgba(243, 239, 230, 0.06);
    border-color: rgba(243, 239, 230, 0.12);
    color: var(--paper);
  }

  .method-btn.active {
    background: var(--amber);
    color: var(--ink);
    border-color: #8c5a14;
    font-weight: 700;
  }

  .action-footer {
    margin-top: 0.2rem;
  }

  .pay-btn {
    width: 100%;
    min-height: 44px;
    background: #14161c;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theme-dark .pay-btn {
    background: linear-gradient(180deg, var(--amber-bright) 0%, var(--amber) 100%);
    color: var(--ink);
  }

  .pay-btn:hover:not(:disabled) {
    background: #262a36;
    transform: translateY(-1px);
  }

  .theme-dark .pay-btn:hover:not(:disabled) {
    background: var(--amber-bright);
    box-shadow: 0 4px 16px rgba(217, 154, 61, 0.4);
  }

  .ticket-perforation {
    height: 1px;
    background: repeating-linear-gradient(
      90deg,
      rgba(20, 22, 28, 0.25) 0,
      rgba(20, 22, 28, 0.25) 4px,
      transparent 4px,
      transparent 8px
    );
    margin: 0.35rem 0;
  }

  .theme-dark .ticket-perforation {
    background: repeating-linear-gradient(
      90deg,
      rgba(243, 239, 230, 0.25) 0,
      rgba(243, 239, 230, 0.25) 4px,
      transparent 4px,
      transparent 8px
    );
  }

  .ticket-validation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    padding: 0.2rem 0;
  }

  .validation-code {
    color: rgba(20, 22, 28, 0.5);
  }

  .theme-dark .validation-code {
    color: rgba(243, 239, 230, 0.5);
  }

  .validation-badge {
    color: #059669;
    font-weight: 700;
  }

  .theme-dark .validation-badge {
    color: #34d399;
  }

  .ticket-bottom-tear {
    height: 6px;
    background: rgba(20, 22, 28, 0.08);
    clip-path: polygon(
      0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%,
      50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%
    );
  }

  .theme-dark .ticket-bottom-tear {
    background: rgba(243, 239, 230, 0.08);
  }

  .caption {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: rgba(243, 239, 230, 0.6);
    margin-top: 0.8rem;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .pay-btn,
    .pay-btn:hover:not(:disabled) {
      transition: none;
      transform: none;
    }
  }
</style>