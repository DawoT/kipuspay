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
        min="5"
        max="300"
        step="1"
        style="--track-fill: {Math.round(((ticketsPerDay - 5) / (300 - 5)) * 100)}%;"
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
        style="--track-fill: {Math.round(((minutesPerTicket - 0.5) / (5 - 0.5)) * 100)}%;"
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
        style="--track-fill: {Math.round(((hourlyRateSoles - 10) / (50 - 10)) * 100)}%;"
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

    <div class="audit-seal" data-testid="savings-audit-seal">
      <span class="audit-knot" aria-hidden="true">◆</span>
      <div class="audit-info">
        <strong class="audit-title">AHORRO AUDITADO</strong>
        <span class="audit-desc">Cálculo transparente basado en tiempos reales de mostrador</span>
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

  /* ── Controls & Diamond Knot Sliders ─────────────────────── */
  .calc-control {
    margin-bottom: 1.5rem;
  }
  .calc-control label {
    display: block;
    font-size: 1.05rem;
    margin-bottom: 0.5rem;
  }
  .calc-control label strong {
    color: var(--amber-bright);
    font-family: var(--font-mono);
  }
  .calc-control input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 44px;
    background: transparent;
    cursor: pointer;
    margin: 0;
  }
  .calc-control input[type='range']:focus-visible {
    outline: 2px solid var(--amber-bright);
    outline-offset: 4px;
  }

  /* Pista estilo regla contable con relleno dinámico --track-fill */
  .calc-control input[type='range']::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    background: linear-gradient(
      to right,
      var(--amber) 0%,
      var(--amber) var(--track-fill, 0%),
      var(--ink-3) var(--track-fill, 0%),
      var(--ink-3) 100%
    );
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .calc-control input[type='range']::-moz-range-track {
    width: 100%;
    height: 6px;
    background: linear-gradient(
      to right,
      var(--amber) 0%,
      var(--amber) var(--track-fill, 0%),
      var(--ink-3) var(--track-fill, 0%),
      var(--ink-3) 100%
    );
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  /* Tirador (thumb) en forma de nudo diamante a 45° con borde ámbar y micro-resplandor */
  .calc-control input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--amber);
    border: 2px solid var(--amber-bright);
    border-radius: 0;
    transform: rotate(45deg);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    margin-top: -6px;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }
  .calc-control input[type='range']:hover::-webkit-slider-thumb,
  .calc-control input[type='range']:active::-webkit-slider-thumb {
    box-shadow: var(--shadow-glow);
    background: var(--amber-bright);
    transform: rotate(45deg) scale(1.15);
  }

  .calc-control input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--amber);
    border: 2px solid var(--amber-bright);
    border-radius: 0;
    transform: rotate(45deg);
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }
  .calc-control input[type='range']:hover::-moz-range-thumb,
  .calc-control input[type='range']:active::-moz-range-thumb {
    box-shadow: var(--shadow-glow);
    background: var(--amber-bright);
    transform: rotate(45deg) scale(1.15);
  }

  @media (prefers-reduced-motion: reduce) {
    .calc-control input[type='range']::-webkit-slider-thumb {
      transition: none;
      transform: rotate(45deg);
    }
    .calc-control input[type='range']:hover::-webkit-slider-thumb,
    .calc-control input[type='range']:active::-webkit-slider-thumb {
      transform: rotate(45deg);
    }
    .calc-control input[type='range']::-moz-range-thumb {
      transition: none;
      transform: rotate(45deg);
    }
    .calc-control input[type='range']:hover::-moz-range-thumb,
    .calc-control input[type='range']:active::-moz-range-thumb {
      transform: rotate(45deg);
    }
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
  /* ── Sello Contable Ahorro Auditado ───────────────────────── */
  .audit-seal {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    background: rgba(15, 107, 76, 0.12);
    border: 1px solid var(--sello-bright);
    border-radius: var(--radius-xs);
  }
  .audit-knot {
    color: var(--sello-bright);
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  .audit-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .audit-title {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--sello-bright);
    font-weight: 700;
  }
  .audit-desc {
    font-size: 0.78rem;
    color: rgba(243, 239, 230, 0.75);
    line-height: 1.3;
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
