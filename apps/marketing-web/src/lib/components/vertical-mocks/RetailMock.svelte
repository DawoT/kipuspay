<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  interface RetailItem {
    readonly id: string;
    readonly barcode: string;
    readonly qty: number;
    readonly name: string;
    readonly unit: string;
    readonly amount_cents: number;
  }

  interface PaymentPreset {
    readonly label: string;
    readonly paid_cents: number;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  const items: readonly RetailItem[] = [
    {
      id: 'r1',
      barcode: '7751234567890',
      qty: 1,
      name: 'Arroz Costeño Extra 5kg',
      unit: 'Bolsa 5kg',
      amount_cents: 2150,
    },
    {
      id: 'r2',
      barcode: '7750012345678',
      qty: 1,
      name: 'Aceite Vegetal Primor 1L',
      unit: 'Botella 1L',
      amount_cents: 920,
    },
    {
      id: 'r3',
      barcode: '7759876543210',
      qty: 1,
      name: 'Detergente Bolívar 1kg',
      unit: 'Bolsa 1kg',
      amount_cents: 650,
    },
  ];

  const total_cents = $derived(sumCents(items.map((i) => i.amount_cents)));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

  const paymentPresets: readonly PaymentPreset[] = [
    { label: 'S/ 50.00', paid_cents: 5000 },
    { label: 'S/ 40.00', paid_cents: 4000 },
    { label: 'Exacto', paid_cents: 3720 },
    { label: 'S/ 100.00', paid_cents: 10000 },
  ];

  let selectedPaidPreset = $state<number>(5000);
  let isCharging = $state(false);
  let isPaid = $state(false);

  const change_amount_cents = $derived(Math.max(0, selectedPaidPreset - total_cents));

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

<div class="vertical-mock-container" data-testid="retail-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Minimarket Express · KipusPay"
    statusBadge={isPaid ? 'Caja abierta · Venta OK' : 'Escáner activo'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de retail con escáner y calculadora de vuelto"
  >
    <div class="mock-screen">
      <!-- Scanner Status -->
      <div class="scanner-bar" class:scanned={!isPaid}>
        <div class="scanner-main">
          <span class="laser-beam" aria-hidden="true"></span>
          <span class="scanner-icon" aria-hidden="true">❚❙❘❙❚</span>
          <div class="scanner-text">
            <span class="barcode-val">EAN-13: 7751234567890 · Lectura 0.1s</span>
            <span class="scanner-sub">Lector USB / Bluetooth conectado</span>
          </div>
        </div>
        <span class="scanner-ready-dot" aria-hidden="true"></span>
      </div>

      <!-- Items List -->
      <div class="retail-scroll-area">
        <p class="section-micro-title">Productos escaneados en caja</p>
        <ul class="retail-items-list">
          {#each items as item (item.id)}
            <li class="retail-item-card">
              <div class="item-left">
                <span class="item-qty">{item.qty}x</span>
                <div class="item-details">
                  <span class="item-title">{item.name}</span>
                  <span class="item-unit">{item.unit} · {item.barcode}</span>
                </div>
              </div>
              <span class="item-price tabular-nums">S/ {formatCents(item.amount_cents)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Change Calculator (Calculadora de Vuelto) -->
      <div class="change-calc-card">
        <div class="calc-header">
          <span class="calc-label">Calculadora de vuelto</span>
          <span class="paga-badge">Paga con: S/ {formatCents(selectedPaidPreset)}</span>
        </div>

        <div class="preset-buttons" role="group" aria-label="Billetes o monto recibido">
          {#each paymentPresets as preset (preset.label)}
            <button
              type="button"
              class="preset-btn"
              class:active={selectedPaidPreset === preset.paid_cents}
              onclick={() => (selectedPaidPreset = preset.paid_cents)}
            >
              {preset.label}
            </button>
          {/each}
        </div>

        <div class="change-display-row">
          <span class="change-title">Vuelto a entregar:</span>
          <strong class="change-val tabular-nums">S/ {formatCents(change_amount_cents)}</strong>
        </div>
      </div>

      <!-- Totals Summary Card -->
      <div class="total-summary-card">
        <div class="tax-row">
          <span>Op. Gravada: S/ {formatCents(gravada_cents)}</span>
          <span>I.G.V. (18%): S/ {formatCents(igv_cents)}</span>
        </div>
        <div class="main-total-row">
          <span class="main-total-label">TOTAL A COBRAR</span>
          <span class="main-total-amount tabular-nums">
            <span class="cur">S/</span>
            {formatCents(total_cents)}
          </span>
        </div>
      </div>

      <!-- Action Button -->
      <div class="action-footer">
        <button
          type="button"
          class="charge-btn"
          class:paid={isPaid}
          data-testid="retail-charge-btn"
          onclick={handleCharge}
          disabled={isCharging}
        >
          {#if isCharging}
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Abriendo gaveta y cerrando venta…</span>
          {:else if isPaid}
            <span>Venta cerrada · Caja abierta ✓</span>
          {:else}
            <span>Cobrar venta S/ {formatCents(total_cents)}</span>
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

  /* Scanner Bar */
  .scanner-bar {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.28);
    border-radius: 8px;
    padding: 0.4rem 0.65rem;
    overflow: hidden;
  }

  .laser-beam {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
    background: #ef4444;
    box-shadow: 0 0 8px #ef4444;
    animation: scanPulse 2.5s ease-in-out infinite;
  }

  @keyframes scanPulse {
    0%, 100% { transform: translateX(0); opacity: 0.2; }
    50% { transform: translateX(330px); opacity: 0.85; }
  }

  .scanner-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .scanner-icon {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    letter-spacing: -1px;
    color: var(--amber-bright);
  }

  .scanner-text {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .barcode-val {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--paper);
  }

  .scanner-sub {
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .scanner-ready-dot {
    width: 7px;
    height: 7px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 6px #34d399;
  }

  /* Items list */
  .retail-scroll-area {
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

  .retail-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 160px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-right: 0.15rem;
  }

  .retail-items-list::-webkit-scrollbar {
    width: 4px;
  }

  .retail-items-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .retail-item-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-left {
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

  .item-details {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .item-title {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--paper);
  }

  .item-unit {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .item-price {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Change Calculator */
  .change-calc-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .calc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .calc-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.6);
  }

  .paga-badge {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .preset-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.75);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.3rem 0.2rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
  }

  .preset-btn:hover {
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .preset-btn.active {
    background: rgba(229, 169, 59, 0.22);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  .change-display-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.15rem;
    border-top: 1px dashed rgba(243, 239, 230, 0.1);
  }

  .change-title {
    font-size: 0.68rem;
    color: rgba(243, 239, 230, 0.8);
  }

  .change-val {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 800;
    color: #6ee7b7;
  }

  /* Totals Summary */
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
    .laser-beam {
      animation: none;
    }
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
