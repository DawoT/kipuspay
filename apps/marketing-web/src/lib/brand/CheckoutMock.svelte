<script lang="ts">
  import { formatCents, sumCents } from './money';

  interface CheckoutLine {
    readonly qty: number;
    readonly name: string;
    readonly amount_cents: number;
  }

  interface Props {
    lines: readonly CheckoutLine[];
    /** Documento que emite esta caja segun la etapa del negocio. */
    documentLabel: string;
    register?: string;
    /** 'pending' cose; 'synced' remata en verde. */
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

  // Captura inicial intencional: el prop solo fija la pose de arranque del demo;
  // triggerCheckout() reasigna el estado localmente, por eso $derived no aplica.
  // Los padres pasan literales estaticos del contenido: el prop nunca muta.
  // svelte-ignore state_referenced_locally
  let activeSyncState = $state<'pending' | 'synced'>(initialSyncState);
  let isCharging = $state(false);

  const total_cents = $derived(sumCents(lines.map((line) => line.amount_cents)));

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
  class="pos"
  class:theme-dark={theme === 'dark'}
  class:theme-light={theme === 'light'}
  data-testid="checkout-mock"
  data-theme={theme}
>
  <div class="pos-frame">
    <div class="screen">
      <header class="bar">
        <div class="bar-title">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="doc">{documentLabel}</span>
        </div>
        <span class="reg">{register}</span>
      </header>

      <ul class="lines" aria-label="Lista de productos en venta">
        {#each lines as line (line.name)}
          <li>
            <span class="qty">{line.qty}</span>
            <span class="name">{line.name}</span>
            <span class="amount">S/ {formatCents(line.amount_cents)}</span>
          </li>
        {/each}
      </ul>

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

      <div class="total">
        <span class="total-label">Total</span>
        <span class="total-amount">S/ {formatCents(total_cents)}</span>
      </div>

      <div class="ticket-perforation" aria-hidden="true"></div>

      <div class="ticket-validation">
        <span class="validation-code">RESUMEN: KP-{formatCents(total_cents).replace(/[.,]/g, '')}-F89A</span>
        <span class="validation-badge">COMPROBANTE AUTORIZADO</span>
      </div>

      <div class="foot">
        <button
          type="button"
          class="pay-btn"
          onclick={triggerCheckout}
          disabled={isCharging}
          aria-label="Cobrar venta en demo"
        >
          {isCharging ? 'Procesando…' : activeSyncState === 'synced' ? 'Comprobante emitido ✓' : 'Cobrar venta'}
        </button>
        <span class="sync" class:synced={activeSyncState === 'synced'}>
          <span class="stitch" class:in={activeSyncState === 'synced'}>
            {activeSyncState === 'synced' ? 'Sincronizado' : 'Sincronizando'}
          </span>
        </span>
      </div>

      <div class="ticket-bottom-tear" aria-hidden="true"></div>
    </div>
  </div>

  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>

<style>
  .pos {
    margin: 0;
    max-width: 24rem;
    width: 100%;
  }

  .pos-frame {
    border-radius: 12px;
    padding: 3px;
    background: linear-gradient(145deg, #e4e7ec 0%, #cbd5e1 50%, #94a3b8 100%);
    box-shadow:
      0 20px 45px -10px rgba(0, 0, 0, 0.45),
      0 4px 12px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  .theme-dark .pos-frame {
    background: linear-gradient(145deg, #2a2f38 0%, #1e2229 50%, #14171d 100%);
    box-shadow:
      0 20px 45px -10px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .screen {
    border-radius: 9px;
    background: #ffffff;
    color: var(--ink);
    border: 1px solid rgba(26, 29, 35, 0.1);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
    overflow: hidden;
  }

  .theme-dark .screen {
    background: var(--ink-2);
    color: var(--paper);
    border: 1px solid rgba(243, 239, 230, 0.18);
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(26, 29, 35, 0.09);
    font-family: var(--font-mono);
    font-size: var(--step--1);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #f8fafc;
  }

  .theme-dark .bar {
    border-bottom-color: rgba(243, 239, 230, 0.12);
    background: rgba(0, 0, 0, 0.18);
  }

  .bar-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .live-dot {
    width: 7px;
    height: 7px;
    background: var(--sello-bright, #2e9e74);
    border-radius: 50%;
    display: inline-block;
  }

  .doc {
    color: var(--ink);
    font-weight: 700;
  }

  .theme-dark .doc {
    color: var(--cord, var(--amber-bright));
  }

  .reg {
    color: var(--muted-ink);
    font-size: 0.74rem;
  }

  .theme-dark .reg {
    color: var(--muted);
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0.4rem 0;
    max-height: 180px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(26, 29, 35, 0.22) transparent;
  }

  .theme-dark .lines {
    scrollbar-color: rgba(243, 239, 230, 0.22) transparent;
  }

  .lines::-webkit-scrollbar {
    width: 4px;
  }

  .lines::-webkit-scrollbar-track {
    background: transparent;
  }

  .lines::-webkit-scrollbar-thumb {
    background: rgba(26, 29, 35, 0.22);
    border-radius: 4px;
  }

  .theme-dark .lines::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.22);
  }

  .lines li {
    display: grid;
    grid-template-columns: 1.6rem 1fr auto;
    align-items: baseline;
    gap: 0.7rem;
    padding: 0.45rem 1rem;
    font-size: 0.92rem;
    line-height: 1.35;
    border-bottom: 1px solid rgba(26, 29, 35, 0.04);
  }

  .theme-dark .lines li {
    border-bottom-color: rgba(243, 239, 230, 0.04);
  }

  .qty {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--muted-ink);
    text-align: right;
  }

  .theme-dark .qty {
    color: var(--muted);
  }

  .name {
    color: var(--ink);
    font-weight: 500;
  }

  .theme-dark .name {
    color: rgba(243, 239, 230, 0.92);
  }

  .amount {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    font-weight: 600;
  }

  .theme-dark .amount {
    color: rgba(243, 239, 230, 0.82);
  }

  .fiscal-breakdown {
    padding: 0.5rem 1rem;
    border-top: 1px dashed rgba(26, 29, 35, 0.15);
    font-family: var(--font-mono);
    font-size: 0.76rem;
    background: #fbfbfb;
  }

  .theme-dark .fiscal-breakdown {
    border-top-color: rgba(243, 239, 230, 0.14);
    background: transparent;
  }

  .fiscal-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.15rem 0;
    color: var(--muted-ink);
  }

  .theme-dark .fiscal-row {
    color: var(--muted);
  }

  .fiscal-label {
    letter-spacing: 0.08em;
    font-size: 0.72rem;
  }

  .fiscal-amount {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .theme-dark .fiscal-amount {
    color: rgba(243, 239, 230, 0.88);
  }

  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border-top: 1px solid rgba(26, 29, 35, 0.16);
    background: #ffffff;
  }

  .theme-dark .total {
    border-top-color: rgba(243, 239, 230, 0.18);
    background: transparent;
  }

  .total-label {
    font-family: var(--font-mono);
    font-size: var(--step--1);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted-ink);
    font-weight: 600;
  }

  .theme-dark .total-label {
    color: var(--muted);
  }

  .total-amount {
    font-family: var(--font-display);
    font-size: var(--step-3);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .theme-dark .total-amount {
    color: var(--paper);
  }

  .ticket-perforation {
    position: relative;
    height: 1px;
    margin: 0.25rem 0;
    background: repeating-linear-gradient(
      90deg,
      rgba(26, 29, 35, 0.25) 0,
      rgba(26, 29, 35, 0.25) 5px,
      transparent 5px,
      transparent 10px
    );
  }

  .theme-dark .ticket-perforation {
    background: repeating-linear-gradient(
      90deg,
      rgba(243, 239, 230, 0.3) 0,
      rgba(243, 239, 230, 0.3) 5px,
      transparent 5px,
      transparent 10px
    );
  }

  .ticket-validation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 1rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    background: #f1f5f9;
    border-top: 1px solid rgba(26, 29, 35, 0.08);
    border-bottom: 1px solid rgba(26, 29, 35, 0.08);
  }

  .theme-dark .ticket-validation {
    background: rgba(0, 0, 0, 0.2);
    border-top-color: rgba(243, 239, 230, 0.06);
    border-bottom-color: rgba(243, 239, 230, 0.06);
  }

  .validation-code {
    color: var(--muted-ink);
  }

  .theme-dark .validation-code {
    color: var(--muted);
  }

  .validation-badge {
    color: var(--sello);
    font-weight: 700;
  }

  .theme-dark .validation-badge {
    color: var(--sello-bright);
    font-weight: 600;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    background: #ffffff;
  }

  .theme-dark .foot {
    background: transparent;
  }

  .pay-btn {
    padding: 0.55rem 1.25rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--ink);
    color: #ffffff;
    border: 1px solid var(--ink);
    border-radius: 4px;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .pay-btn:hover:not(:disabled) {
    background: #000000;
    color: var(--amber-bright);
    transform: translateY(-1px);
  }

  .theme-dark .pay-btn {
    background: var(--paper);
    color: var(--ink);
    border-color: var(--amber);
  }

  .theme-dark .pay-btn:hover:not(:disabled) {
    background: var(--amber);
    color: var(--ink);
  }

  .pay-btn:disabled {
    opacity: 0.85;
    cursor: wait;
  }

  .sync {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--alerta);
    font-weight: 600;
  }

  .sync.synced {
    color: var(--sello);
  }

  .theme-dark .sync {
    color: var(--alerta-bright);
  }

  .theme-dark .sync.synced {
    color: var(--sello-bright);
  }

  .ticket-bottom-tear {
    height: 7px;
    width: 100%;
    background-color: #ffffff;
    clip-path: polygon(
      0% 0%, 100% 0%,
      100% 100%, 97.5% 35%, 95% 100%, 92.5% 35%, 90% 100%, 87.5% 35%, 85% 100%, 82.5% 35%,
      80% 100%, 77.5% 35%, 75% 100%, 72.5% 35%, 70% 100%, 67.5% 35%, 65% 100%, 62.5% 35%,
      60% 100%, 57.5% 35%, 55% 100%, 52.5% 35%, 50% 100%, 47.5% 35%, 45% 100%, 42.5% 35%,
      40% 100%, 37.5% 35%, 35% 100%, 32.5% 35%, 30% 100%, 27.5% 35%, 25% 100%, 22.5% 35%,
      20% 100%, 17.5% 35%, 15% 100%, 12.5% 35%, 10% 100%, 7.5% 35%, 5% 100%, 2.5% 35%, 0% 100%
    );
  }

  .theme-dark .ticket-bottom-tear {
    background-color: var(--ink-2);
  }

  figcaption {
    margin-top: 0.85rem;
    font-family: var(--font-mono);
    font-size: var(--step--1);
    line-height: 1.5;
    letter-spacing: 0.06em;
    color: inherit;
    opacity: 0.72;
  }

  @media (prefers-reduced-motion: reduce) {
    .pay-btn {
      transition: none;
    }
    .pay-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
