<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  type PharmacyTab = 'despacho' | 'fefo' | 'fraccionamiento';

  interface MedicineItem {
    readonly id: string;
    readonly name: string;
    readonly presentation: string;
    readonly lab: string;
    readonly lot: string;
    readonly expiry: string;
    readonly amount_cents: number;
    readonly fefoPriority: boolean;
  }

  interface FractionOption {
    readonly id: string;
    readonly name: string;
    readonly amount_cents: number;
    readonly unitNote: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<PharmacyTab>('despacho');

  const medicines: readonly MedicineItem[] = [
    {
      id: 'm1',
      name: 'Paracetamol 500mg x 20 tab',
      presentation: 'Blíster x 20 tabletas',
      lab: 'Lab. Genfar',
      lot: 'A24',
      expiry: '12/27',
      amount_cents: 850,
      fefoPriority: true,
    },
    {
      id: 'm2',
      name: 'Amoxicilina 500mg x 12 cap',
      presentation: 'Caja x 12 cápsulas',
      lab: 'Lab. Portugal',
      lot: 'P18',
      expiry: '09/28',
      amount_cents: 1400,
      fefoPriority: false,
    },
    {
      id: 'm3',
      name: 'Alcohol medicinal 70° 1L',
      presentation: 'Frasco 1000ml',
      lab: 'Alkofarma',
      lot: 'L02',
      expiry: '03/29',
      amount_cents: 900,
      fefoPriority: false,
    },
  ];

  let searchQuery = $state('Amoxicilina');
  let isCharging = $state(false);
  let isPaid = $state(false);

  // FEFO control state
  let fefoDiscountApplied = $state(false);

  // Fraccionamiento state
  const fractionOptions: readonly FractionOption[] = [
    { id: 'caja', name: 'Caja x 100 tab', amount_cents: 3500, unitNote: 'Descuenta 100 tabletas' },
    { id: 'blister', name: 'Blíster x 10 tab', amount_cents: 400, unitNote: 'Descuenta 10 tabletas' },
    { id: 'sueltas', name: '4 tabletas sueltas', amount_cents: 180, unitNote: 'Descuenta 4 tabletas' },
  ];

  let selectedFractionId = $state<string>('blister');
  let fractionAdded = $state(false);

  const selectedFraction = $derived(
    fractionOptions.find((f) => f.id === selectedFractionId) ?? fractionOptions[1],
  );

  const total_cents = $derived(sumCents(medicines.map((m) => m.amount_cents)));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

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

  function handleAddFraction() {
    fractionAdded = true;
    setTimeout(() => {
      fractionAdded = false;
    }, 1800);
  }
</script>

<div class="vertical-mock-container" data-testid="pharmacy-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Botica & Farmacia · KipusPay"
    statusBadge={activeTab === 'despacho'
      ? (isPaid ? 'Comprobante emitido · En línea' : 'Caja 1 · En línea')
      : activeTab === 'fefo'
        ? 'Control FEFO · Activo'
        : 'Fraccionamiento · Activo'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de farmacia con control FEFO de lotes, recetas y venta fraccionada"
  >
    <div class="mock-screen">
      <!-- Main Mode Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de farmacia">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'despacho'}
          class="mock-nav-tab"
          class:active={activeTab === 'despacho'}
          onclick={() => (activeTab = 'despacho')}
        >
          [Despacho]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'fefo'}
          class="mock-nav-tab"
          class:active={activeTab === 'fefo'}
          onclick={() => (activeTab = 'fefo')}
        >
          [Control FEFO]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'fraccionamiento'}
          class="mock-nav-tab"
          class:active={activeTab === 'fraccionamiento'}
          onclick={() => (activeTab = 'fraccionamiento')}
        >
          [Fraccionamiento]
        </button>
      </div>

      <!-- VISTA 1: DESPACHO -->
      {#if activeTab === 'despacho'}
        <div class="tab-view-content" data-testid="pharmacy-view-despacho">
          <!-- Search Simulated Bar -->
          <div class="search-wrap">
            <div class="search-input-box">
              <span class="search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                class="search-input"
                bind:value={searchQuery}
                placeholder="Buscar principio activo o marca..."
                aria-label="Buscar principio activo o marca"
              />
            </div>
            <div class="quick-chips">
              <span class="chip active">Amoxicilina 500mg</span>
              <span class="chip">Paracetamol</span>
              <span class="chip">Genéricos</span>
            </div>
          </div>

          <!-- Patient & Rx Header -->
          <div class="patient-card">
            <div class="patient-main">
              <span class="rx-symbol" aria-hidden="true">℞</span>
              <div class="patient-details">
                <span class="patient-name">Paciente: DNI 44892134 · Receta Dr. Mendoza</span>
                <span class="rx-verified">✓ Receta médica verificada y vinculada</span>
              </div>
            </div>
            <span class="fefo-badge">FEFO ACTIVO</span>
          </div>

          <!-- Items List with FEFO Lots -->
          <div class="medicine-scroll-area">
            <div class="medicine-header">
              <p class="section-micro-title">Medicamentos a despachar</p>
              <span class="fefo-legend">Lote más próximo primero</span>
            </div>

            <ul class="medicine-list">
              {#each medicines as med (med.id)}
                <li class="med-item" class:fefo-prio={med.fefoPriority}>
                  <div class="med-top">
                    <span class="med-name">{med.name}</span>
                    <span class="med-amount tabular-nums">S/ {formatCents(med.amount_cents)}</span>
                  </div>
                  <div class="med-bottom">
                    <span class="med-meta">{med.lab} · Lote {med.lot} Vence: {med.expiry}</span>
                    {#if med.fefoPriority}
                      <span class="fefo-tag">Prioridad FEFO</span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Totals & Taxes Summary -->
          <div class="total-summary-card">
            <div class="tax-row">
              <span>Op. Gravada: S/ {formatCents(gravada_cents)}</span>
              <span>I.G.V. (18%): S/ {formatCents(igv_cents)}</span>
            </div>
            <div class="main-total-row">
              <span class="main-total-label">TOTAL RECETA</span>
              <span class="main-total-amount tabular-nums">
                <span class="cur">S/</span>
                {formatCents(total_cents)}
              </span>
            </div>
            <div class="stock-check-hint">
              <span>✓ Stock descontado automáticamente por lote y presentación</span>
            </div>
          </div>

          <!-- Action Button -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={isPaid}
              data-testid="pharmacy-charge-btn"
              onclick={handleCharge}
              disabled={isCharging}
            >
              {#if isCharging}
                <span class="btn-spinner" aria-hidden="true"></span>
                <span>Emitiendo comprobante farmacéutico…</span>
              {:else if isPaid}
                <span>Comprobante farmacia emitido ✓</span>
              {:else}
                <span>Cobrar despacho S/ {formatCents(total_cents)}</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 2: CONTROL FEFO -->
      {:else if activeTab === 'fefo'}
        <div class="tab-view-content" data-testid="pharmacy-view-fefo">
          <div class="fefo-header-bar">
            <span class="fefo-title-tag">Tablero de Control de Vencimientos</span>
            <span class="fefo-sub-badge">FEFO Automático</span>
          </div>

          <!-- Semáforo de Lotes -->
          <div class="fefo-semaphore-grid">
            <div class="semaphore-card tone-green">
              <div class="sem-top">
                <span class="sem-dot green" aria-hidden="true">🟢</span>
                <strong class="sem-count">48 Lotes vigentes</strong>
              </div>
              <span class="sem-desc">> 12 meses · Stock seguro</span>
            </div>

            <div class="semaphore-card tone-yellow">
              <div class="sem-top">
                <span class="sem-dot yellow" aria-hidden="true">🟡</span>
                <strong class="sem-count">3 Lotes próximos</strong>
              </div>
              <span class="sem-desc">Vencen en &lt;90 días · Ej: Ibuprofeno Lote X02</span>
            </div>

            <div class="semaphore-card tone-red">
              <div class="sem-top">
                <span class="sem-dot red" aria-hidden="true">🔴</span>
                <strong class="sem-count">1 Lote crítico</strong>
              </div>
              <span class="sem-desc">Vence en 15 días · Alerta de rotación prioritaria</span>
            </div>
          </div>

          <!-- Priority Alert Box -->
          <div class="fefo-alert-box" class:discounted={fefoDiscountApplied}>
            <div class="fab-header">
              <strong class="fab-title">Lote Crítico: Amoxicilina Lote C09</strong>
              <span class="fab-timer">15 días</span>
            </div>
            <p class="fab-text">
              {#if fefoDiscountApplied}
                ✓ Descuento FEFO del 15% aplicado para rotación acelerada de stock crítico.
              {:else}
                14 unidades en mostrador. Priorizar en dispensación para evitar merma.
              {/if}
            </p>
          </div>

          <!-- Action Button for FEFO -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={fefoDiscountApplied}
              onclick={() => (fefoDiscountApplied = !fefoDiscountApplied)}
            >
              {#if fefoDiscountApplied}
                <span>Descuento FEFO aplicado (15% dto) ✓</span>
              {:else}
                <span>Aplicar descuento FEFO automático</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 3: FRACCIONAMIENTO -->
      {:else if activeTab === 'fraccionamiento'}
        <div class="tab-view-content" data-testid="pharmacy-view-fraccionamiento">
          <div class="frac-header-bar">
            <span class="frac-title-tag">Venta Fraccionada de Medicamentos</span>
            <span class="frac-stock-tag">Stock: 450 tabletas</span>
          </div>

          <!-- Product Card -->
          <div class="frac-product-hero">
            <strong class="fph-name">Paracetamol 500mg</strong>
            <span class="fph-meta">Lab. Genfar · Principio activo: Paracetamol · Registro sanitario vigente</span>
          </div>

          <!-- Fractions Radio Options -->
          <div class="fraction-options-list" role="radiogroup" aria-label="Opciones de fraccionamiento">
            {#each fractionOptions as opt (opt.id)}
              <button
                type="button"
                role="radio"
                aria-checked={selectedFractionId === opt.id}
                class="fraction-card"
                class:active={selectedFractionId === opt.id}
                onclick={() => (selectedFractionId = opt.id)}
              >
                <div class="fc-main">
                  <span class="fc-radio-dot" aria-hidden="true"></span>
                  <div class="fc-info">
                    <strong class="fc-name">{opt.name}</strong>
                    <span class="fc-note">{opt.unitNote}</span>
                  </div>
                </div>
                <span class="fc-price tabular-nums">S/ {formatCents(opt.amount_cents)}</span>
              </button>
            {/each}
          </div>

          <!-- Conversion Breakdown Summary -->
          <div class="frac-summary-card">
            <div class="fsc-row">
              <span>Fracción seleccionada:</span>
              <strong class="fsc-name">{selectedFraction.name}</strong>
            </div>
            <div class="fsc-row total">
              <span>Importe a cobrar:</span>
              <strong class="fsc-amount tabular-nums">S/ {formatCents(selectedFraction.amount_cents)}</strong>
            </div>
          </div>

          <!-- Action Button for Fraction -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={fractionAdded}
              onclick={handleAddFraction}
            >
              {#if fractionAdded}
                <span>Fraccionamiento agregado al ticket ✓</span>
              {:else}
                <span>Agregar fraccionado al ticket</span>
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

  /* Search bar */
  .search-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .search-input-box {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.12);
    border-radius: 7px;
    padding: 0.3rem 0.55rem;
  }

  .search-icon {
    font-size: 0.65rem;
    opacity: 0.6;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--paper);
    font-family: var(--font-sans);
    font-size: 0.7rem;
  }

  .search-input::placeholder {
    color: rgba(243, 239, 230, 0.4);
  }

  .quick-chips {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .quick-chips::-webkit-scrollbar {
    display: none;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.6);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    white-space: nowrap;
  }

  .chip.active {
    background: rgba(229, 169, 59, 0.18);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 600;
  }

  /* Patient Card */
  .patient-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #12161f;
    border: 1px solid rgba(52, 211, 153, 0.22);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    flex-shrink: 0;
  }

  .patient-main {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .rx-symbol {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 700;
    color: #34d399;
  }

  .patient-details {
    display: flex;
    flex-direction: column;
  }

  .patient-name {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--paper);
  }

  .rx-verified {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: #6ee7b7;
  }

  .fefo-badge {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    background: rgba(46, 158, 116, 0.18);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
  }

  /* Medicine List */
  .medicine-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 0;
  }

  .medicine-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .fefo-legend {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.45);
  }

  .medicine-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 140px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-right: 0.15rem;
  }

  .medicine-list::-webkit-scrollbar {
    width: 4px;
  }

  .medicine-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .med-item {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    transition: all 0.2s ease;
  }

  .med-item.fefo-prio {
    border-color: rgba(229, 169, 59, 0.3);
    background: #171a22;
  }

  .med-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .med-name {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--paper);
  }

  .med-amount {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--paper);
  }

  .med-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.58rem;
  }

  .med-meta {
    font-family: var(--font-mono);
    color: rgba(243, 239, 230, 0.55);
  }

  .fefo-tag {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    font-weight: 700;
    background: rgba(229, 169, 59, 0.16);
    color: var(--amber-bright);
    border-radius: 3px;
    padding: 0.05rem 0.25rem;
  }

  /* Totals Breakdown */
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

  .stock-check-hint {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    color: #6ee7b7;
    text-align: center;
    padding-top: 0.05rem;
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

  /* FEFO VIEW SPECIFICS */
  .fefo-header-bar, .frac-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0.1rem;
    flex-shrink: 0;
  }

  .fefo-title-tag, .frac-title-tag {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--amber-bright);
  }

  .fefo-sub-badge, .frac-stock-tag {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .fefo-semaphore-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    max-height: 280px;
    overflow-y: auto;
  }

  .semaphore-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .semaphore-card.tone-green {
    border-left: 3.5px solid #34d399;
  }

  .semaphore-card.tone-yellow {
    border-left: 3.5px solid var(--amber);
  }

  .semaphore-card.tone-red {
    border-left: 3.5px solid #f87171;
    background: #191214;
  }

  .sem-top {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .sem-dot {
    font-size: 0.7rem;
  }

  .sem-count {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--paper);
  }

  .sem-desc {
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.65);
    padding-left: 1.15rem;
  }

  .fefo-alert-box {
    background: #17151a;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .fefo-alert-box.discounted {
    border-color: rgba(52, 211, 153, 0.4);
    background: #101915;
  }

  .fab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .fab-title {
    font-family: var(--font-mono);
    font-size: 0.66rem;
    color: #f87171;
  }

  .fefo-alert-box.discounted .fab-title {
    color: #34d399;
  }

  .fab-timer {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    color: #f87171;
    background: rgba(239, 68, 68, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .fefo-alert-box.discounted .fab-timer {
    color: #34d399;
    background: rgba(52, 211, 153, 0.15);
  }

  .fab-text {
    margin: 0;
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.8);
    line-height: 1.3;
  }

  /* FRACCIONAMIENTO VIEW SPECIFICS */
  .frac-product-hero {
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .fph-name {
    font-size: 0.78rem;
    color: var(--amber-bright);
  }

  .fph-meta {
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .fraction-options-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    max-height: 250px;
    overflow-y: auto;
  }

  .fraction-card {
    background: #141820;
    border: 1.5px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 48px;
    text-align: left;
  }

  .fraction-card:hover {
    border-color: rgba(229, 169, 59, 0.35);
    background: #181d26;
  }

  .fraction-card.active {
    border-color: var(--amber);
    background: rgba(229, 169, 59, 0.16);
  }

  .fc-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fc-radio-dot {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(243, 239, 230, 0.3);
    border-radius: 50%;
    position: relative;
    flex-shrink: 0;
  }

  .fraction-card.active .fc-radio-dot {
    border-color: var(--amber-bright);
  }

  .fraction-card.active .fc-radio-dot::after {
    content: '';
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--amber-bright);
    border-radius: 50%;
    top: 2px;
    left: 2px;
  }

  .fc-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .fc-name {
    font-size: 0.72rem;
    color: var(--paper);
  }

  .fc-note {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .fc-price {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .frac-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .fsc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.65);
  }

  .fsc-name {
    color: var(--paper);
  }

  .fsc-row.total {
    padding-top: 0.15rem;
    border-top: 1px solid rgba(243, 239, 230, 0.1);
  }

  .fsc-amount {
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--amber-bright);
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
