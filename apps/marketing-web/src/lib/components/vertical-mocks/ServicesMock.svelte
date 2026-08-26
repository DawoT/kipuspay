<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  type ServicesTab = 'orden' | 'historial' | 'detraccion';

  interface ServiceItem {
    readonly id: string;
    readonly qty: number;
    readonly name: string;
    readonly category: string;
    readonly amount_cents: number;
  }

  interface HistoryEntry {
    readonly date: string;
    readonly service: string;
    readonly amount_cents: number;
    readonly invoiceCode: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<ServicesTab>('orden');

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

  // Historial Placa state
  const historyEntries: readonly HistoryEntry[] = [
    {
      date: '15/04/2026',
      service: 'Cambio de pastillas de freno',
      amount_cents: 18000,
      invoiceCode: 'Factura F001-000388',
    },
    {
      date: '10/01/2026',
      service: 'Mantenimiento 5,000 km',
      amount_cents: 9500,
      invoiceCode: 'Factura F001-000240',
    },
  ];

  let plateLoaded = $state(false);

  // Detracción SUNAT state (12% sobre S/ 850.00)
  const spotTotalCents = 85000;
  const spotDetractionCents = 10200;
  const spotNetCents = 74800;
  let spotGenerated = $state(false);

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

  function handleLoadPlateData() {
    plateLoaded = true;
    setTimeout(() => {
      plateLoaded = false;
      activeTab = 'orden';
    }, 1200);
  }

  function handleGenerateSpot() {
    spotGenerated = true;
    setTimeout(() => {
      spotGenerated = false;
    }, 2000);
  }
</script>

<div class="vertical-mock-container" data-testid="services-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Servicios & Taller · KipusPay"
    statusBadge={activeTab === 'orden'
      ? (isPaid ? 'Factura emitida · Sincronizada' : 'Orden #OT-402')
      : activeTab === 'historial'
        ? 'Historial ABC-123'
        : 'SPOT SUNAT 12%'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de servicios, taller, historial por placa y cálculo de detracción SUNAT"
  >
    <div class="mock-screen">
      <!-- Main Mode Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de servicios">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orden'}
          class="mock-nav-tab"
          class:active={activeTab === 'orden'}
          onclick={() => (activeTab = 'orden')}
        >
          [Orden #OT-402]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'historial'}
          class="mock-nav-tab"
          class:active={activeTab === 'historial'}
          onclick={() => (activeTab = 'historial')}
        >
          [Historial Placa]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'detraccion'}
          class="mock-nav-tab"
          class:active={activeTab === 'detraccion'}
          onclick={() => (activeTab = 'detraccion')}
        >
          [Detracción SUNAT]
        </button>
      </div>

      <!-- VISTA 1: ORDEN #OT-402 -->
      {#if activeTab === 'orden'}
        <div class="tab-view-content" data-testid="services-view-orden">
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

      <!-- VISTA 2: HISTORIAL PLACA -->
      {:else if activeTab === 'historial'}
        <div class="tab-view-content" data-testid="services-view-historial">
          <!-- Plate Header -->
          <div class="plate-hero-card">
            <div class="ph-top">
              <span class="ph-badge">PLACA VEHICULAR</span>
              <span class="ph-mileage">48,200 km</span>
            </div>
            <strong class="ph-title">Placa ABC-123 · Toyota Hilux 2022</strong>
            <span class="ph-client">Cliente: Transportes del Sur SAC · 8 servicios realizados</span>
          </div>

          <!-- Services Timeline -->
          <div class="history-scroll-area">
            <p class="section-micro-title">Historial de mantenimientos</p>
            <div class="history-timeline">
              {#each historyEntries as h (h.date)}
                <div class="history-card">
                  <div class="hc-top">
                    <span class="hc-date">{h.date}</span>
                    <span class="hc-code">{h.invoiceCode}</span>
                  </div>
                  <strong class="hc-service">{h.service}</strong>
                  <span class="hc-amount tabular-nums">S/ {formatCents(h.amount_cents)}</span>
                </div>
              {/each}
            </div>
          </div>

          <div class="history-stats-box">
            <span>✓ Historial completo sincronizado · Cliente frecuente con RUC</span>
          </div>

          <!-- Action Button for History -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={plateLoaded}
              onclick={handleLoadPlateData}
            >
              {#if plateLoaded}
                <span>Datos cargados en orden #OT-402 ✓</span>
              {:else}
                <span>Cargar datos para nueva orden</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 3: DETRACCIÓN SUNAT -->
      {:else if activeTab === 'detraccion'}
        <div class="tab-view-content" data-testid="services-view-detraccion">
          <div class="spot-header-bar">
            <span class="spot-title-tag">Régimen SPOT SUNAT</span>
            <span class="spot-rate-pill">Tasa: 12% Servicios</span>
          </div>

          <!-- Service Quote Card -->
          <div class="spot-quote-card">
            <span class="sq-label">Servicio cotizado:</span>
            <strong class="sq-name">Mantenimiento de flota · S/ 850.00</strong>
            <span class="sq-sub">Servicio técnico corporativo sujeto a detracción SUNAT</span>
          </div>

          <!-- SPOT Breakdown Card -->
          <div class="spot-breakdown-card">
            <p class="section-micro-title">Cálculo de Detracción SUNAT</p>
            <div class="spot-rows">
              <div class="spot-row">
                <span>Total Bruto del Servicio:</span>
                <strong class="tabular-nums">S/ {formatCents(spotTotalCents)}</strong>
              </div>
              <div class="spot-row detraction">
                <span>Monto detracción SUNAT: S/ 102.00 (12%)</span>
                <strong class="tabular-nums text-red">-S/ {formatCents(spotDetractionCents)}</strong>
              </div>
              <div class="spot-row net">
                <span class="net-title">Neto a pagar: S/ 748.00</span>
                <strong class="net-val tabular-nums">S/ {formatCents(spotNetCents)}</strong>
              </div>
            </div>
            <span class="spot-account-note">Depósito en Cuenta BN: 00-068-123456</span>
          </div>

          <div class="spot-compliance-badge">
            <span>✓ Incluye leyenda obligatoria y código de detracción para Factura B2B</span>
          </div>

          <!-- Action Button for Detraction -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={spotGenerated}
              onclick={handleGenerateSpot}
            >
              {#if spotGenerated}
                <span>Comprobante SPOT generado con detracción ✓</span>
              {:else}
                <span>Generar comprobante con código de detracción</span>
              {/if}
            </button>
          </div>
        </div>
      {/if}
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
    gap: 0.35rem;
    padding: 0.1rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* Main Navigation Tabs */
  .mock-nav-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    background: #0d1117;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.15rem;
    flex-shrink: 0;
  }

  .mock-nav-tab {
    background: transparent;
    border: none;
    color: rgba(243, 239, 230, 0.65);
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 600;
    padding: 0.35rem 0.2rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mock-nav-tab:hover {
    color: var(--paper);
    background: rgba(243, 239, 230, 0.05);
  }

  .mock-nav-tab.active {
    background: rgba(229, 169, 59, 0.22);
    color: var(--amber-bright);
    font-weight: 700;
    border: 1px solid rgba(229, 169, 59, 0.35);
  }

  .tab-view-content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex: 1;
    min-height: 0;
    gap: 0.35rem;
  }

  /* B2B Work Order Card */
  .order-b2b-card {
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .b2b-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .doc-badge {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--amber);
    color: var(--ink);
    padding: 0.08rem 0.3rem;
    border-radius: 4px;
  }

  .ot-number {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .b2b-vehicle-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--paper);
  }

  .vehicle-icon {
    font-size: 0.72rem;
  }

  .b2b-client-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.7);
  }

  .client-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .ruc-status {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    color: #6ee7b7;
    font-weight: 600;
  }

  /* Services Items */
  .services-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 0;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .services-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 125px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
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
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .item-qty {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.72rem;
    color: var(--amber-bright);
    min-width: 1.4rem;
  }

  .item-details {
    display: flex;
    flex-direction: column;
  }

  .item-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--paper);
  }

  .item-category {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .item-price {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Accounting Breakdown Card */
  .accounting-breakdown-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .tax-breakdown-rows {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.1rem;
  }

  .tax-line {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.65);
  }

  .total-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.15rem;
    border-top: 1px solid rgba(243, 239, 230, 0.12);
  }

  .total-name {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--paper);
  }

  .total-val {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .total-val .cur {
    font-size: 0.85rem;
  }

  /* Stamp */
  .invoice-stamp-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.56rem;
    padding: 0.1rem 0.15rem;
    flex-shrink: 0;
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
    margin-top: 0.1rem;
    flex-shrink: 0;
  }

  .charge-btn {
    width: 100%;
    min-height: 44px;
    background: linear-gradient(180deg, var(--amber-bright) 0%, var(--amber) 100%);
    color: var(--ink);
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.82rem;
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

  /* HISTORIAL PLACA SPECIFICS */
  .plate-hero-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .ph-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ph-badge {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }

  .ph-mileage {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .ph-title {
    font-size: 0.76rem;
    color: var(--paper);
  }

  .ph-client {
    font-size: 0.58rem;
    color: #6ee7b7;
  }

  .history-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-height: 0;
  }

  .history-timeline {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 0.15rem;
  }

  .history-timeline::-webkit-scrollbar {
    width: 4px;
  }

  .history-timeline::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .history-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-left: 3px solid #38bdf8;
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .hc-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.56rem;
  }

  .hc-date {
    color: rgba(243, 239, 230, 0.6);
  }

  .hc-code {
    color: #38bdf8;
  }

  .hc-service {
    font-size: 0.7rem;
    color: var(--paper);
  }

  .hc-amount {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .history-stats-box {
    background: #10131a;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    flex-shrink: 0;
  }

  /* DETRACCIÓN SUNAT SPECIFICS */
  .spot-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0.1rem;
    flex-shrink: 0;
  }

  .spot-title-tag {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--amber-bright);
  }

  .spot-rate-pill {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .spot-quote-card {
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .sq-label {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .sq-name {
    font-size: 0.74rem;
    color: var(--paper);
  }

  .sq-sub {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .spot-breakdown-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1;
    justify-content: center;
  }

  .spot-rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .spot-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.64rem;
    color: rgba(243, 239, 230, 0.75);
    font-family: var(--font-mono);
  }

  .spot-row.detraction {
    color: #f87171;
  }

  .text-red {
    color: #f87171;
  }

  .spot-row.net {
    padding-top: 0.25rem;
    border-top: 1px solid rgba(243, 239, 230, 0.12);
  }

  .net-title {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    color: #6ee7b7;
  }

  .net-val {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 800;
    color: #6ee7b7;
  }

  .spot-account-note {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    color: rgba(243, 239, 230, 0.5);
    text-align: center;
  }

  .spot-compliance-badge {
    background: #101915;
    border: 1px solid rgba(52, 211, 153, 0.25);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: #6ee7b7;
    flex-shrink: 0;
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
