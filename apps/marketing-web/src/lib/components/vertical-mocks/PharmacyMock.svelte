<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

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

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

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
</script>

<div class="vertical-mock-container" data-testid="pharmacy-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Botica & Farmacia · KipusPay"
    statusBadge={isPaid ? 'Comprobante emitido · En línea' : 'Caja 1 · En línea'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de farmacia con control FEFO de lotes y recetas"
  >
    <div class="mock-screen">
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

  /* Search bar */
  .search-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .search-input-box {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.12);
    border-radius: 8px;
    padding: 0.35rem 0.6rem;
  }

  .search-icon {
    font-size: 0.7rem;
    opacity: 0.6;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--paper);
    font-family: var(--font-sans);
    font-size: 0.72rem;
  }

  .search-input::placeholder {
    color: rgba(243, 239, 230, 0.4);
  }

  .quick-chips {
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .quick-chips::-webkit-scrollbar {
    display: none;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.6);
    padding: 0.15rem 0.4rem;
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
    border-radius: 8px;
    padding: 0.4rem 0.65rem;
  }

  .patient-main {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .rx-symbol {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: #34d399;
  }

  .patient-details {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .patient-name {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--paper);
  }

  .rx-verified {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
  }

  .fefo-badge {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    background: rgba(46, 158, 116, 0.18);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.3);
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
  }

  /* Medicine List */
  .medicine-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .medicine-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .fefo-legend {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.45);
  }

  .medicine-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 175px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
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
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
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
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--paper);
  }

  .med-amount {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--paper);
  }

  .med-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
  }

  .med-meta {
    font-family: var(--font-mono);
    color: rgba(243, 239, 230, 0.55);
  }

  .fefo-tag {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    background: rgba(229, 169, 59, 0.16);
    color: var(--amber-bright);
    border-radius: 3px;
    padding: 0.05rem 0.3rem;
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

  .stock-check-hint {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    text-align: center;
    padding-top: 0.1rem;
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
