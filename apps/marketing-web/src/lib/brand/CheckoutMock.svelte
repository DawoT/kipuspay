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
  }

  let {
    lines,
    documentLabel,
    register = 'Caja 1',
    syncState: initialSyncState = 'pending',
    caption,
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

<figure class="pos" data-testid="checkout-mock">
  <div class="screen">
    <header class="bar">
      <span class="doc">{documentLabel}</span>
      <span class="reg">{register}</span>
    </header>

    <ul class="lines">
      {#each lines as line (line.name)}
        <li>
          <span class="qty">{line.qty}</span>
          <span class="name">{line.name}</span>
          <span class="amount">S/ {formatCents(line.amount_cents)}</span>
        </li>
      {/each}
    </ul>

    <div class="total">
      <span class="total-label">Total</span>
      <span class="total-amount">S/ {formatCents(total_cents)}</span>
    </div>

    <div class="foot">
      <button type="button" class="pay-btn" onclick={triggerCheckout} disabled={isCharging}>
        {isCharging ? 'Procesando…' : 'Cobrar (Demo)'}
      </button>
      <span class="sync" class:synced={activeSyncState === 'synced'}>
        <span class="stitch" class:in={activeSyncState === 'synced'}>
          {activeSyncState === 'synced' ? 'Sincronizado' : 'Sincronizando'}
        </span>
      </span>
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
  }

  .screen {
    border: 1px solid rgba(243, 239, 230, 0.22);
    background: var(--ink-2);
    color: var(--paper);
    box-shadow: none;
  }

  .bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(243, 239, 230, 0.12);
    font-family: var(--font-mono);
    font-size: var(--step--1);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .doc {
    color: var(--cord, var(--amber-bright));
    font-weight: 600;
  }

  .reg {
    color: var(--muted);
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0.4rem 0;
  }

  .lines li {
    display: grid;
    grid-template-columns: 1.6rem 1fr auto;
    align-items: baseline;
    gap: 0.7rem;
    padding: 0.5rem 1rem;
    font-size: 0.94rem;
    line-height: 1.35;
  }

  .qty {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--muted);
    text-align: right;
  }

  .name {
    color: rgba(243, 239, 230, 0.92);
  }

  .amount {
    font-variant-numeric: tabular-nums;
    color: rgba(243, 239, 230, 0.82);
  }

  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem;
    border-top: 1px solid rgba(243, 239, 230, 0.12);
  }

  .total-label {
    font-family: var(--font-mono);
    font-size: var(--step--1);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .total-amount {
    font-family: var(--font-display);
    font-size: var(--step-3);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1rem 1rem;
    border-top: 1px solid rgba(243, 239, 230, 0.12);
  }

  .pay-btn {
    padding: 0.55rem 1.25rem;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--amber);
    font-weight: 700;
    font-size: 0.92rem;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .pay-btn:hover {
    background: var(--amber);
    color: var(--ink);
    transform: translateY(-1px);
  }

  .sync {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--alerta-bright);
  }

  .sync.synced {
    color: var(--sello-bright);
  }

  figcaption {
    margin-top: 0.85rem;
    font-family: var(--font-mono);
    font-size: var(--step--1);
    line-height: 1.5;
    letter-spacing: 0.06em;
    color: inherit;
    opacity: 0.66;
  }
</style>
