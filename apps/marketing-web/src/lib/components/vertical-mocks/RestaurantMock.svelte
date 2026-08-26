<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  interface MenuItem {
    readonly id: string;
    readonly qty: number;
    readonly name: string;
    readonly amount_cents: number;
    readonly note?: string;
  }

  interface TableData {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MenuItem[];
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  const tables: readonly TableData[] = [
    {
      id: 'm04',
      label: 'Mesa 04',
      items: [
        { id: 'i1', qty: 1, name: 'Ceviche clásico de pescado', amount_cents: 3800, note: 'Ají suave' },
        { id: 'i2', qty: 1, name: 'Lomo saltado criollo', amount_cents: 4200, note: 'Término medio' },
        { id: 'i3', qty: 1, name: 'Jarra chicha morada 1L', amount_cents: 1600 },
      ],
    },
    {
      id: 'm08',
      label: 'Mesa 08',
      items: [
        { id: 'i4', qty: 2, name: 'Arroz con mariscos', amount_cents: 7600 },
        { id: 'i5', qty: 2, name: 'Limonada frozen 500ml', amount_cents: 1800 },
      ],
    },
    {
      id: 'm12',
      label: 'Mesa 12',
      items: [
        { id: 'i6', qty: 1, name: 'Causa limeña de pollo', amount_cents: 2400 },
        { id: 'i7', qty: 1, name: 'Seco de res con frijoles', amount_cents: 3900 },
      ],
    },
    {
      id: 'takeaway',
      label: 'Para Llevar',
      items: [
        { id: 'i8', qty: 1, name: 'Tacu tacu con lomo al jugo', amount_cents: 4400 },
        { id: 'i9', qty: 1, name: 'Maracuyá frozen 1L', amount_cents: 1500 },
      ],
    },
  ];

  let selectedTableId = $state<string>('m04');
  let splitMode = $state<'full' | 'split2'>('full');
  let isCharging = $state(false);
  let isPaid = $state(false);

  const activeTable = $derived(
    tables.find((t) => t.id === selectedTableId) ?? tables[0],
  );

  const total_cents = $derived(sumCents(activeTable.items.map((i) => i.amount_cents)));
  const split_cents = $derived(Math.round(total_cents / 2));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

  function handleSelectTable(tableId: string) {
    selectedTableId = tableId;
    isPaid = false;
    isCharging = false;
  }

  function handleCharge() {
    if (isCharging) return;
    if (isPaid) {
      isPaid = false;
      return;
    }
    isCharging = true;
    setTimeout(() => {
      isCharging = false;
      isPaid = true;
    }, 600);
  }
</script>

<div class="vertical-mock-container" data-testid="restaurant-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Restaurante · KipusPay"
    statusBadge={`${activeTable.label} · Salón`}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de comandas y división de cuenta de restaurante"
  >
    <div class="mock-screen">
      <!-- Table Selector -->
      <div class="table-tabs" role="tablist" aria-label="Seleccionar mesa o comanda rápida">
        {#each tables as table (table.id)}
          <button
            type="button"
            role="tab"
            aria-selected={selectedTableId === table.id}
            class="tab-chip"
            class:active={selectedTableId === table.id}
            onclick={() => handleSelectTable(table.id)}
          >
            {table.label}
          </button>
        {/each}
      </div>

      <!-- KDS Kitchen Status Banner -->
      <div class="kds-status-bar" class:paid={isPaid}>
        <div class="kds-indicator">
          <span class="kds-dot" aria-hidden="true"></span>
          <span class="kds-label">
            {#if isPaid}
              Mesa cerrada · Pedido despachado ✓
            {:else}
              Cocina: En preparación ✓
            {/if}
          </span>
        </div>
        <span class="kds-ticket">Comanda #CMD-084</span>
      </div>

      <!-- Order Items List -->
      <div class="order-scroll-area">
        <p class="section-micro-title">Consumo de comanda</p>
        <ul class="order-items-list">
          {#each activeTable.items as item (item.id)}
            <li class="item-card">
              <div class="item-main">
                <span class="item-qty">{item.qty}x</span>
                <div class="item-info">
                  <span class="item-name">{item.name}</span>
                  {#if item.note}
                    <span class="item-note">Nota: {item.note}</span>
                  {/if}
                </div>
              </div>
              <span class="item-amount tabular-nums">S/ {formatCents(item.amount_cents)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Split Bill Selector -->
      <div class="split-card">
        <div class="split-header">
          <span class="split-title">División de cuenta</span>
          {#if splitMode === 'split2'}
            <span class="split-badge">2 partes iguales</span>
          {/if}
        </div>
        <div class="split-controls" role="group" aria-label="Modo de pago de la cuenta">
          <button
            type="button"
            class="split-toggle-btn"
            class:active={splitMode === 'full'}
            onclick={() => (splitMode = 'full')}
          >
            Cuenta completa
          </button>
          <button
            type="button"
            class="split-toggle-btn"
            class:active={splitMode === 'split2'}
            onclick={() => (splitMode = 'split2')}
          >
            Dividir entre 2 (S/ {formatCents(split_cents)} c/u)
          </button>
        </div>
      </div>

      <!-- Totals Breakdown -->
      <div class="total-summary-card">
        <div class="tax-row">
          <span>Op. Gravada: S/ {formatCents(gravada_cents)}</span>
          <span>I.G.V. (18%): S/ {formatCents(igv_cents)}</span>
        </div>
        <div class="main-total-row">
          <span class="main-total-label">
            {splitMode === 'split2' ? 'COBRAR 1/2 CUENTA' : 'TOTAL COMANDA'}
          </span>
          <span class="main-total-amount tabular-nums">
            <span class="cur">S/</span>
            {formatCents(splitMode === 'split2' ? split_cents : total_cents)}
          </span>
        </div>
        {#if splitMode === 'split2'}
          <p class="split-hint">
            Cobro por comensal: 2 pagos de S/ {formatCents(split_cents)} con comprobante individual.
          </p>
        {/if}
      </div>

      <!-- Action Button -->
      <div class="action-footer">
        <button
          type="button"
          class="charge-btn"
          class:paid={isPaid}
          data-testid="restaurant-charge-btn"
          onclick={handleCharge}
          disabled={isCharging}
        >
          {#if isCharging}
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Procesando pago de mesa…</span>
          {:else if isPaid}
            <span>Mesa cobrada y liberada ✓</span>
          {:else if splitMode === 'split2'}
            <span>Cobrar fracción S/ {formatCents(split_cents)}</span>
          {:else}
            <span>Cobrar Mesa S/ {formatCents(total_cents)}</span>
          {/if}
        </button>
      </div>
    </div>
  </PhoneMockFrame>
</div>

<style>
  .vertical-mock-container {
    width: 380px;
    max-width: 100%;
    margin: 0 auto;
  }

  .mock-screen {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    gap: 0.45rem;
    padding: 0.15rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* Table selector tabs */
  .table-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }

  .table-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab-chip {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
  }

  .tab-chip:hover {
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .tab-chip.active {
    background: rgba(229, 169, 59, 0.2);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  /* KDS Status Bar */
  .kds-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(46, 158, 116, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.25);
    border-radius: 8px;
    padding: 0.35rem 0.65rem;
    font-size: 0.68rem;
    transition: all 0.3s ease;
  }

  .kds-status-bar.paid {
    background: rgba(52, 211, 153, 0.2);
    border-color: rgba(52, 211, 153, 0.4);
  }

  .kds-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .kds-dot {
    width: 7px;
    height: 7px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 6px #34d399;
  }

  .kds-label {
    font-family: var(--font-sans);
    font-weight: 700;
    color: #6ee7b7;
  }

  .kds-ticket {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.6);
  }

  /* Order items */
  .order-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .order-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 155px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-right: 0.15rem;
  }

  .order-items-list::-webkit-scrollbar {
    width: 4px;
  }

  .order-items-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .item-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .item-qty {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.75rem;
    color: var(--amber-bright);
    min-width: 1.5rem;
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .item-name {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--paper);
  }

  .item-note {
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.5);
    font-style: italic;
  }

  .item-amount {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Split card */
  .split-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .split-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .split-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.6);
  }

  .split-badge {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    background: rgba(229, 169, 59, 0.15);
    color: var(--amber-bright);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .split-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
  }

  .split-toggle-btn {
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-sans);
    font-size: 0.66rem;
    font-weight: 600;
    padding: 0.35rem 0.3rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 38px;
    text-align: center;
  }

  .split-toggle-btn.active {
    background: rgba(229, 169, 59, 0.22);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  /* Totals Breakdown */
  .total-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tax-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .main-total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.15rem;
    border-top: 1px solid rgba(243, 239, 230, 0.1);
  }

  .main-total-label {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--paper);
  }

  .main-total-amount {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .main-total-amount .cur {
    font-size: 0.9rem;
  }

  .split-hint {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    text-align: center;
  }

  /* Action button */
  .action-footer {
    margin-top: 0.15rem;
  }

  .charge-btn {
    width: 100%;
    min-height: 44px;
    background: linear-gradient(180deg, var(--amber-bright) 0%, var(--amber) 100%);
    color: var(--ink);
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
    gap: 0.4rem;
    box-shadow: 0 4px 14px rgba(217, 154, 61, 0.35);
  }

  .charge-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(238, 183, 101, 0.45);
  }

  .charge-btn.paid {
    background: #0f6b4c;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(15, 107, 76, 0.35);
  }

  .charge-btn:disabled {
    opacity: 0.85;
    cursor: wait;
  }

  .btn-spinner {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(20, 22, 28, 0.3);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-spinner {
      animation: none;
    }
    .charge-btn {
      transition: none;
    }
    .charge-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
