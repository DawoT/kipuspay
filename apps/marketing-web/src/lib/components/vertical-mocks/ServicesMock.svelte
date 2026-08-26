<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  interface ServiceItem {
    readonly id: string;
    readonly qty: number;
    readonly name: string;
    readonly category: string;
    readonly amount_cents: number;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  const serviceItems: readonly ServiceItem[] = [
    {
      id: 's1',
      qty: 1,
      name: 'Mantenimiento preventivo 10k km',
      category: 'Mano de obra especializada',
      amount_cents: 12000,
    },
    {
      id: 's2',
      qty: 1,
      name: 'Aceite sintético 5W-30',
      category: '4 galones · Repuestos e insumos',
      amount_cents: 14000,
    },
    {
      id: 's3',
      qty: 1,
      name: 'Filtro de aire motor',
      category: 'Repuesto original',
      amount_cents: 4500,
    },
  ];

  const total_cents = $derived(sumCents(serviceItems.map((i) => i.amount_cents)));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

  let isCharging = $state(false);
  let isPaid = $state(false);

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

<div class="vertical-mock-container" data-testid="services-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Servicios & Taller · KipusPay"
    statusBadge={isPaid ? 'Factura emitida · Sincronizada' : 'Orden #OT-402'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de servicios, taller y factura electrónica con RUC"
  >
    <div class="mock-screen">
      <!-- Work Order & Customer Card -->
      <div class="order-b2b-card">
        <div class="b2b-header">
          <span class="doc-badge">Factura electrónica B2B</span>
          <span class="ot-number">Orden #OT-402</span>
        </div>
        <div class="b2b-vehicle-row">
          <span class="vehicle-icon" aria-hidden="true">🚗</span>
          <span class="vehicle-title">Vehículo: Toyota Hilux · Placa ABC-123</span>
        </div>
        <div class="b2b-client-row">
          <span class="client-name">Cliente: Transportes del Sur SAC (RUC 20601234567)</span>
          <span class="ruc-status">✓ Habido / Activo</span>
        </div>
      </div>

      <!-- Services & Parts Items -->
      <div class="services-scroll-area">
        <p class="section-micro-title">Servicios y repuestos cotizados</p>
        <ul class="services-items-list">
          {#each serviceItems as item (item.id)}
            <li class="service-item-card">
              <div class="item-left">
                <span class="item-qty">{item.qty}x</span>
                <div class="item-details">
                  <span class="item-title">{item.name}</span>
                  <span class="item-category">{item.category}</span>
                </div>
              </div>
              <span class="item-price tabular-nums">S/ {formatCents(item.amount_cents)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Accounting Breakdown -->
      <div class="accounting-breakdown-card">
        <p class="section-micro-title">Desglose tributario SUNAT</p>
        <div class="tax-breakdown-rows">
          <div class="tax-line">
            <span class="tax-name">OP. GRAVADA</span>
            <span class="tax-val tabular-nums">S/ {formatCents(gravada_cents)}</span>
          </div>
          <div class="tax-line">
            <span class="tax-name">I.G.V. (18%)</span>
            <span class="tax-val tabular-nums">S/ {formatCents(igv_cents)}</span>
          </div>
          <div class="total-line">
            <span class="total-name">TOTAL FACTURA</span>
            <span class="total-val tabular-nums">
              <span class="cur">S/</span>
              {formatCents(total_cents)}
            </span>
          </div>
        </div>
      </div>

      <!-- Validation Stamp -->
      <div class="invoice-stamp-card">
        <span class="stamp-code">FACTURA: F001-000492 · VALIDADA SUNAT</span>
        <span class="stamp-badge">100% LEGAL</span>
      </div>

      <!-- Action Button -->
      <div class="action-footer">
        <button
          type="button"
          class="charge-btn"
          class:paid={isPaid}
          data-testid="services-charge-btn"
          onclick={handleCharge}
          disabled={isCharging}
        >
          {#if isCharging}
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Generando comprobante tributario…</span>
          {:else if isPaid}
            <span>Factura electrónica emitida ✓</span>
          {:else}
            <span>Emitir Factura S/ {formatCents(total_cents)}</span>
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

  /* B2B Work Order Card */
  .order-b2b-card {
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .b2b-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .doc-badge {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--amber);
    color: var(--ink);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .ot-number {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .b2b-vehicle-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--paper);
  }

  .vehicle-icon {
    font-size: 0.75rem;
  }

  .b2b-client-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.7);
  }

  .client-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 210px;
  }

  .ruc-status {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    font-weight: 600;
  }

  /* Services Items */
  .services-scroll-area {
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

  .services-items-list {
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

  .services-items-list::-webkit-scrollbar {
    width: 4px;
  }

  .services-items-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .service-item-card {
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
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--paper);
  }

  .item-category {
    font-size: 0.6rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .item-price {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Accounting Breakdown Card */
  .accounting-breakdown-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tax-breakdown-rows {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.15rem;
  }

  .tax-line {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: rgba(243, 239, 230, 0.65);
  }

  .total-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.25rem;
    border-top: 1px solid rgba(243, 239, 230, 0.12);
  }

  .total-name {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--paper);
  }

  .total-val {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .total-val .cur {
    font-size: 0.9rem;
  }

  /* Stamp */
  .invoice-stamp-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    padding: 0.15rem 0.2rem;
  }

  .stamp-code {
    color: rgba(243, 239, 230, 0.5);
  }

  .stamp-badge {
    color: #34d399;
    font-weight: 700;
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
