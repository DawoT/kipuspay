<script lang="ts">
  import { reveal } from './reveal';
  import { computeSavings, DEFAULT_ASSUMPTIONS } from './savings';

  interface Preset {
    readonly id: string;
    readonly label: string;
    readonly ticketsPerDay: number;
    readonly avgTicketSoles: number;
  }

  const PRESETS: readonly Preset[] = [
    { id: 'bodega',      label: 'Bodega',      ticketsPerDay: 8,  avgTicketSoles: 15 },
    { id: 'cafeteria',   label: 'Cafetería',   ticketsPerDay: 35, avgTicketSoles: 22 },
    { id: 'minimarket',  label: 'Minimarket',  ticketsPerDay: 60, avgTicketSoles: 45 },
  ];

  let ticketsPerDay = $state(DEFAULT_ASSUMPTIONS.ticketsPerDay);
  let minutesPerTicket = $state(DEFAULT_ASSUMPTIONS.minutesPerTicket);
  let hourlyRateSoles = $state(DEFAULT_ASSUMPTIONS.hourlyRateSoles);
  let activePreset = $state<string | null>(null);

  const result = $derived(computeSavings({ ticketsPerDay, minutesPerTicket, hourlyRateSoles }));

  function applyPreset(preset: Preset) {
    ticketsPerDay = preset.ticketsPerDay;
    hourlyRateSoles = preset.avgTicketSoles;
    activePreset = preset.id;
  }

  function clearPreset() {
    activePreset = null;
  }
</script>

<div class="savings-calculator" use:reveal data-testid="savings-calculator">
  <div class="calc-header">
    <p class="eyebrow">
      <span class="knot-dot" aria-hidden="true"></span>
      Calculadora de Mostrador
    </p>
    <h3>¿Cuánto tiempo y dinero pierdes en el cierre de caja manual?</h3>
  </div>

  <div class="calc-body">
    <div class="preset-row" role="group" aria-label="Tipo de negocio">
      {#each PRESETS as preset (preset.id)}
        <button
          type="button"
          class="preset-btn"
          class:preset-active={activePreset === preset.id}
          data-testid="preset-{preset.id}"
          aria-pressed={activePreset === preset.id}
          onclick={() => applyPreset(preset)}
        >
          {preset.label}
        </button>
      {/each}
    </div>

    <div class="calc-control">
      <label for="ticket-slider">
        Ventas o tickets por día en tu local:
        <strong>{ticketsPerDay} ventas/día</strong>
      </label>
      <input
        id="ticket-slider"
        type="range"
        min="10"
        max="300"
        step="10"
        bind:value={ticketsPerDay}
        oninput={clearPreset}
      />
    </div>

    <div class="calc-control">
      <label for="minutes-slider">
        Minutos que toma cuadrar cada venta:
        <strong>{minutesPerTicket} min</strong>
      </label>
      <input
        id="minutes-slider"
        type="range"
        min="0.5"
        max="5"
        step="0.5"
        bind:value={minutesPerTicket}
        oninput={clearPreset}
      />
    </div>

    <div class="calc-control">
      <label for="rate-slider">
        Valor de una hora de trabajo en tu local (S/):
        <strong>S/ {hourlyRateSoles}</strong>
      </label>
      <input
        id="rate-slider"
        type="range"
        min="10"
        max="50"
        step="5"
        bind:value={hourlyRateSoles}
        oninput={clearPreset}
      />
    </div>

    <div class="calc-results">
      <div class="result-metric">
        <span class="metric-number">~{result.hoursSavedPerMonth} hrs</span>
        <span class="metric-label">Tiempo estimado ahorrado al mes en arqueos y cuadres</span>
      </div>
      <div class="result-metric highlight">
        <span class="metric-number">S/ {result.monthlySavingsSoles}</span>
        <span class="metric-label">Valor estimado en tiempo de trabajo recuperado</span>
      </div>
    </div>

    <p class="calc-assumptions">
      Estimación con tus parámetros de arriba. No es una promesa de ahorro: cada local cuadra
      distinto.
    </p>
  </div>
</div>

<style>
  .savings-calculator {
    margin-top: 3rem;
    padding: 2.2rem;
    background: var(--ink-2);
    color: var(--paper);
    border: 1px solid var(--line);
  }
  .calc-header h3 {
    font-size: 1.4rem;
    margin-bottom: 1.5rem;
  }

  /* ── Presets ─────────────────────────────────────────────── */
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .preset-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1.5px solid var(--line);
    color: var(--paper);
    font-family: var(--font-body);
    font-size: 0.9rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .preset-btn:hover {
    border-color: var(--amber);
    color: var(--amber-bright);
  }
  .preset-btn.preset-active {
    border-color: var(--amber);
    background: rgba(217, 154, 61, 0.15);
    color: var(--amber-bright);
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    .preset-btn {
      transition: none;
    }
  }

  /* ── Controls ────────────────────────────────────────────── */
  .calc-control label {
    display: block;
    font-size: 1.05rem;
    margin-bottom: 0.85rem;
  }
  .calc-control label strong {
    color: var(--amber-bright);
    font-family: var(--font-mono);
  }
  .calc-control input[type='range'] {
    width: 100%;
    accent-color: var(--amber);
    cursor: pointer;
  }
  .calc-results {
    display: grid;
    gap: 1.5rem;
    margin-top: 2rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }
  @media (min-width: 719px) {
    .calc-results {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .result-metric {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .metric-number {
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--paper);
  }
  .result-metric.highlight .metric-number {
    color: var(--amber-bright);
  }
  .metric-label {
    font-size: 0.9rem;
    color: rgba(243, 239, 230, 0.78);
  }
  .calc-assumptions {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    font-size: 0.8125rem;
    color: rgba(243, 239, 230, 0.6);
    line-height: 1.5;
  }
</style>
