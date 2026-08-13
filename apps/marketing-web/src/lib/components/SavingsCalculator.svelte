<script lang="ts">
  import { reveal } from './reveal';

  let ticketsPerDay = $state(40);

  // Horas ahorradas al mes en arqueo y digitación manual (aprox. 1.5 min por ticket evitado en cuadre)
  const hoursSavedPerMonth = $derived(Math.round((ticketsPerDay * 30 * 1.5) / 60));

  // Ahorro estimado de dinero en horas de trabajo al mes (asumiendo valor hora base de S/ 15)
  const monthlySavingsCents = $derived(hoursSavedPerMonth * 15 * 100);
  const monthlySavingsWhole = $derived(Math.trunc(monthlySavingsCents / 100));
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
      />
    </div>

    <div class="calc-results">
      <div class="result-metric">
        <span class="metric-number">~{hoursSavedPerMonth} hrs</span>
        <span class="metric-label">Tiempo ahorrado al mes en arqueos y cuadres</span>
      </div>
      <div class="result-metric highlight">
        <span class="metric-number">S/ {monthlySavingsWhole}</span>
        <span class="metric-label">Valor estimado en tiempo de trabajo recuperado</span>
      </div>
    </div>
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
  @media (min-width: 640px) {
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
</style>
