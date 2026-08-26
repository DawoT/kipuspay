<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  type RetailTab = 'caja' | 'balanza' | 'promociones';

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

  interface ScaleProduct {
    readonly id: string;
    readonly name: string;
    readonly price_per_kg_cents: number;
    readonly sampleWeightKg: number;
    readonly sampleAmountCents: number;
  }

  interface PromotionItem {
    readonly id: string;
    readonly title: string;
    readonly rule: string;
    readonly savingText: string;
    readonly finalPriceText?: string;
    readonly tone: 'amber' | 'green';
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<RetailTab>('caja');

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

  // Balanza Digital state
  let isTared = $state(false);
  let scaleItemAdded = $state(false);

  // Promociones state
  let promoApplied = $state(false);

  const promotions: readonly PromotionItem[] = [
    {
      id: 'p1',
      title: 'Promo 2x1 Detergente Bolívar 1kg',
      rule: 'Segunda unidad 100% gratis en caja express',
      savingText: 'Segunda unidad gratis · Ahorro S/ 6.50',
      tone: 'green',
    },
    {
      id: 'p2',
      title: 'Pack Abarrotes del Día',
      rule: 'Arroz 5kg + Aceite 1L con 10% dto · Total: S/ 27.63',
      savingText: 'Descuento pack combo · Ahorro S/ 3.07',
      finalPriceText: 'Total Pack: S/ 27.63',
      tone: 'amber',
    },
  ];

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

  function handleTare() {
    isTared = true;
    setTimeout(() => {
      isTared = false;
    }, 1500);
  }

  function handleAddScale() {
    scaleItemAdded = true;
    setTimeout(() => {
      scaleItemAdded = false;
    }, 1800);
  }
</script>

<div class="vertical-mock-container" data-testid="retail-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Minimarket Express · KipusPay"
    statusBadge={activeTab === 'caja'
      ? (isPaid ? 'Caja abierta · Venta OK' : 'Escáner activo')
      : activeTab === 'balanza'
        ? 'Balanza USB · Estable'
        : 'Promociones · Activas'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de retail con escáner, balanza digital y motor de promociones"
  >
    <div class="mock-screen">
      <!-- Main Mode Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de retail">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'caja'}
          class="mock-nav-tab"
          class:active={activeTab === 'caja'}
          onclick={() => (activeTab = 'caja')}
        >
          [Caja Express]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'balanza'}
          class="mock-nav-tab"
          class:active={activeTab === 'balanza'}
          onclick={() => (activeTab = 'balanza')}
        >
          [Balanza Digital]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'promociones'}
          class="mock-nav-tab"
          class:active={activeTab === 'promociones'}
          onclick={() => (activeTab = 'promociones')}
        >
          [Promociones]
        </button>
      </div>

      <!-- VISTA 1: CAJA EXPRESS -->
      {#if activeTab === 'caja'}
        <div class="tab-view-content" data-testid="retail-view-caja">
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

      <!-- VISTA 2: BALANZA DIGITAL -->
      {:else if activeTab === 'balanza'}
        <div class="tab-view-content" data-testid="retail-view-balanza">
          <!-- Scale status badge -->
          <div class="scale-status-card">
            <div class="ssc-top">
              <span class="ssc-icon" aria-hidden="true">⚖️</span>
              <div class="ssc-text">
                <strong class="ssc-title">Balanza USB / Bluetooth · Peso estable: 1.450 kg</strong>
                <span class="ssc-sub">Conexión directa en mostrador · Cero retardo</span>
              </div>
            </div>
            <span class="ssc-stable-pill">ESTABLE</span>
          </div>

          <!-- Active Bulk Product Card -->
          <div class="bulk-product-card">
            <div class="bpc-header">
              <strong class="bpc-title">Pollo fresco eviscerado · Precio: S/ 9.80 / kg</strong>
              <span class="bpc-tag">GRANEL</span>
            </div>
            <div class="bpc-display">
              <div class="bpc-weight-box">
                <span class="bpc-weight-val tabular-nums">{isTared ? '0.000' : '1.450'}</span>
                <span class="bpc-weight-unit">kg NETO</span>
              </div>
              <div class="bpc-calc-box">
                <span class="bpc-calc-formula">1.450 kg × S/ 9.80 = S/ 14.21</span>
                <span class="bpc-calc-total tabular-nums">S/ {formatCents(1421)}</span>
              </div>
            </div>
          </div>

          <!-- Quick Actions Bar for Scale -->
          <div class="scale-actions-row">
            <button
              type="button"
              class="scale-tare-btn"
              onclick={handleTare}
            >
              <span>{isTared ? 'Tara restablecida (0.000 kg) ✓' : 'Tara / Pesar'}</span>
            </button>
          </div>

          <div class="scale-hint-card">
            <span>✓ Importe exacto calculado automáticamente sin digitación manual</span>
          </div>

          <!-- Action Button for Scale -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={scaleItemAdded}
              onclick={handleAddScale}
            >
              {#if scaleItemAdded}
                <span>Pesado agregado a caja express S/ 14.21 ✓</span>
              {:else}
                <span>Agregar pesado a caja</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 3: PROMOCIONES -->
      {:else if activeTab === 'promociones'}
        <div class="tab-view-content" data-testid="retail-view-promociones">
          <div class="promo-header-bar">
            <span class="promo-title-tag">Motor de Promociones y Combos</span>
            <span class="promo-active-count">2 Promociones aplicables</span>
          </div>

          <div class="promotions-list">
            {#each promotions as promo (promo.id)}
              <div class="promo-card tone-{promo.tone}">
                <div class="promo-top">
                  <strong class="promo-name">{promo.title}</strong>
                  <span class="promo-badge">ACTIVA</span>
                </div>
                <p class="promo-rule">{promo.rule}</p>
                <div class="promo-footer">
                  <span class="promo-saving">{promo.savingText}</span>
                  {#if promo.finalPriceText}
                    <strong class="promo-final tabular-nums">{promo.finalPriceText}</strong>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="promo-summary-banner" class:applied={promoApplied}>
            <span>
              {#if promoApplied}
                ✓ Descuentos y 2x1 aplicados directamente al total de caja
              {:else}
                Ahorro total estimado para el cliente: S/ 9.57 en esta compra
              {/if}
            </span>
          </div>

          <!-- Action Button for Promotions -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={promoApplied}
              onclick={() => (promoApplied = !promoApplied)}
            >
              {#if promoApplied}
                <span>Promociones aplicadas al ticket ✓</span>
              {:else}
                <span>Aplicar promoción en caja</span>
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

  /* Scanner Bar */
  .scanner-bar {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.28);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    overflow: hidden;
    flex-shrink: 0;
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
    gap: 0.45rem;
  }

  .scanner-icon {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: -1px;
    color: var(--amber-bright);
  }

  .scanner-text {
    display: flex;
    flex-direction: column;
  }

  .barcode-val {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--paper);
  }

  .scanner-sub {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .scanner-ready-dot {
    width: 6px;
    height: 6px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 6px #34d399;
  }

  /* Items list */
  .retail-scroll-area {
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

  .retail-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 130px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
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

  .item-unit {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .item-price {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Change Calculator */
  .change-calc-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .calc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .calc-label {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.6);
  }

  .paga-badge {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.2rem;
  }

  .preset-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.75);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 600;
    padding: 0.25rem 0.15rem;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 32px;
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
    padding-top: 0.1rem;
    border-top: 1px dashed rgba(243, 239, 230, 0.1);
  }

  .change-title {
    font-size: 0.64rem;
    color: rgba(243, 239, 230, 0.8);
  }

  .change-val {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 800;
    color: #6ee7b7;
  }

  /* Totals Summary */
  .total-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.4rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .tax-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .main-total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.1rem;
    border-top: 1px solid rgba(243, 239, 230, 0.1);
  }

  .main-total-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--paper);
  }

  .main-total-amount {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .main-total-amount .cur {
    font-size: 0.85rem;
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

  /* BALANZA DIGITAL VIEW SPECIFICS */
  .scale-status-card {
    background: #141820;
    border: 1px solid rgba(52, 211, 153, 0.28);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .ssc-top {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .ssc-icon {
    font-size: 0.9rem;
  }

  .ssc-text {
    display: flex;
    flex-direction: column;
  }

  .ssc-title {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--paper);
  }

  .ssc-sub {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .ssc-stable-pill {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    color: #34d399;
    background: rgba(46, 158, 116, 0.18);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .bulk-product-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.3);
    border-radius: 8px;
    padding: 0.55rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
    justify-content: center;
  }

  .bpc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .bpc-title {
    font-size: 0.76rem;
    color: var(--paper);
  }

  .bpc-tag {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .bpc-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #0d1017;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.5rem 0.65rem;
  }

  .bpc-weight-box {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .bpc-weight-val {
    font-family: var(--font-mono);
    font-size: 1.45rem;
    font-weight: 800;
    color: #6ee7b7;
  }

  .bpc-weight-unit {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .bpc-calc-box {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
  }

  .bpc-calc-formula {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .bpc-calc-total {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .scale-actions-row {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .scale-tare-btn {
    flex: 1;
    background: rgba(243, 239, 230, 0.08);
    border: 1px solid rgba(243, 239, 230, 0.15);
    color: var(--paper);
    font-family: var(--font-sans);
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
  }

  .scale-tare-btn:hover {
    background: rgba(243, 239, 230, 0.14);
  }

  .scale-hint-card {
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

  /* PROMOCIONES VIEW SPECIFICS */
  .promo-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0.1rem;
    flex-shrink: 0;
  }

  .promo-title-tag {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--amber-bright);
  }

  .promo-active-count {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .promotions-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    max-height: 280px;
    overflow-y: auto;
  }

  .promo-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .promo-card.tone-green {
    border-left: 3.5px solid #34d399;
  }

  .promo-card.tone-amber {
    border-left: 3.5px solid var(--amber);
  }

  .promo-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .promo-name {
    font-size: 0.72rem;
    color: var(--paper);
  }

  .promo-badge {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    font-weight: 700;
    color: #34d399;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .promo-rule {
    margin: 0;
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.65);
  }

  .promo-footer {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.15rem;
    border-top: 1px dashed rgba(243, 239, 230, 0.08);
  }

  .promo-saving {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: #6ee7b7;
  }

  .promo-final {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--amber-bright);
  }

  .promo-summary-banner {
    background: #10131a;
    border: 1px solid rgba(229, 169, 59, 0.2);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: var(--amber-bright);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .promo-summary-banner.applied {
    border-color: rgba(52, 211, 153, 0.35);
    background: #101915;
    color: #6ee7b7;
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
