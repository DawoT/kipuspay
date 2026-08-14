<script lang="ts">
  /**
   * Timeline honesto de migración (M5B): dos carriles derivados de las
   * filas cualitativas de COMPARE_ROWS — cero cifras inventadas sobre el
   * sistema ajeno. "Lo que nos cuentan" vs "Con KipusPay".
   */

  interface Props {
    competitorName: string;
  }

  let { competitorName }: Props = $props();

  const REPORTED = [
    { label: 'Coordinar instalación', note: 'con visita técnica' },
    { label: 'Capacitación del equipo', note: 'antes de cobrar' },
    { label: 'Recién la primera venta', note: 'semanas después' },
  ];

  const KIPUS = [
    { label: 'Te registras', note: 'sin tarjeta' },
    { label: 'Importas tu catálogo', note: 'CSV de tu sistema actual' },
    { label: 'Cobras el mismo día', note: 'en minutos' },
  ];
</script>

<div class="migration-timeline" data-testid="migration-timeline" aria-label={`De ${competitorName} a tu primera venta con KipusPay`}>
  <div class="lane lane-reported">
    <p class="lane-title">Con {competitorName} (lo que nos cuentan)</p>
    <ol class="lane-steps">
      {#each REPORTED as step, i (step.label)}
        <li>
          <span class="lane-dot" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step.label}</strong>
            <p>{step.note}</p>
          </div>
        </li>
      {/each}
    </ol>
  </div>
  <div class="lane lane-kipus">
    <p class="lane-title">Con KipusPay</p>
    <ol class="lane-steps">
      {#each KIPUS as step, i (step.label)}
        <li>
          <span class="lane-dot" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step.label}</strong>
            <p>{step.note}</p>
          </div>
        </li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .migration-timeline {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-top: 2.5rem;
  }

  .lane {
    border: 1px solid var(--line);
    padding: 1.5rem;
    background: var(--ink-2);
    color: var(--paper);
  }

  .lane-kipus {
    border-color: var(--amber);
  }

  .lane-title {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 1.4rem;
  }

  .lane-kipus .lane-title {
    color: var(--amber-bright);
  }

  .lane-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }

  .lane-steps li {
    display: flex;
    gap: 0.9rem;
    align-items: flex-start;
  }

  .lane-dot {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
    border: 1px solid var(--line);
    min-width: 1.9rem;
    height: 1.9rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.1rem;
  }

  .lane-kipus .lane-dot {
    color: var(--ink);
    background: var(--amber);
    border-color: var(--amber);
    font-weight: 700;
  }

  .lane-steps strong {
    display: block;
    font-size: 1rem;
    margin-bottom: 0.15rem;
  }

  .lane-steps p {
    color: rgba(243, 239, 230, 0.72);
    font-size: 0.85rem;
    margin: 0;
  }
</style>
