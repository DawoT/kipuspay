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
    { label: 'Solicitar cotización previa', note: 'esperar respuesta y coordinar fechas' },
    { label: 'Instalación técnica obligatoria', note: 'visita en sitio o software complejo' },
    { label: 'Capacitación del personal', note: 'horas de entrenamiento antes de usar' },
    { label: 'Recién la primera venta', note: 'semanas después de iniciar el trámite' },
  ];

  const KIPUS = [
    { label: 'Te registras en 1 minuto', note: 'sin tarjeta de crédito ni contratos' },
    { label: 'Importas tu catálogo', note: 'archivo CSV de tu sistema anterior' },
    { label: 'Configuras tus puntos de venta', note: 'en cualquier celular, tablet o PC' },
    { label: 'Cobras el mismo día', note: 'en minutos con comprobantes válidos' },
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
    box-shadow: 0 0 20px rgba(217, 154, 61, 0.08);
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
    font-weight: 700;
  }

  .lane-steps {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.25rem;
  }

  /* Cordel vertical continuo de fibra quipu */
  .lane-steps::before {
    content: '';
    position: absolute;
    top: 0.95rem;
    bottom: 0.95rem;
    left: 0.95rem;
    width: var(--fiber-w);
    background: var(--fiber);
    transform: translateX(-50%);
    z-index: 0;
  }

  .lane-kipus .lane-steps::before {
    background: linear-gradient(180deg, var(--amber) 0%, var(--amber-bright) 100%);
    box-shadow: 0 0 10px rgba(217, 154, 61, 0.45);
  }

  .lane-steps li {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    transition: transform 0.2s ease;
  }

  .lane-dot {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
    border: 1px solid var(--line);
    min-width: 1.9rem;
    height: 1.9rem;
    background: var(--ink-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.1rem;
    border-radius: var(--radius-xs);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .lane-kipus .lane-dot {
    color: var(--ink);
    background: var(--amber);
    border-color: var(--amber-bright);
    font-weight: 700;
    box-shadow: 0 0 8px rgba(217, 154, 61, 0.4);
  }

  .lane-kipus li:hover .lane-dot {
    transform: scale(1.12);
    background: var(--amber-bright);
    box-shadow: 0 0 16px rgba(238, 183, 101, 0.7);
  }

  .lane-steps strong {
    display: block;
    font-size: 0.98rem;
    margin-bottom: 0.15rem;
  }

  .lane-steps p {
    color: rgba(243, 239, 230, 0.72);
    font-size: 0.85rem;
    margin: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .lane-steps li,
    .lane-dot,
    .lane-kipus li:hover .lane-dot {
      transition: none;
      transform: none;
    }
  }
</style>
