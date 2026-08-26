<script lang="ts">
  /**
   * Timeline honesto de migración: dos carriles derivados de las
   * filas cualitativas de COMPARE_ROWS. "Lo que nos cuentan" vs "Con KipusPay".
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
    { label: 'Te registras en 1 minuto', note: 'sin tarjeta de crédito ni contratos de amarre' },
    { label: 'Importas tu catálogo', note: 'archivo CSV/Excel de tu sistema anterior' },
    { label: 'Configuras tus puntos de venta', note: 'en cualquier celular, tablet o PC' },
    { label: 'Cobras el mismo día', note: 'en minutos con boletas y facturas válidas' },
  ];
</script>

<div
  class="migration-timeline"
  data-testid="migration-timeline"
  aria-label={`De ${competitorName} a tu primera venta con KipusPay`}
>
  <div class="lane lane-reported">
    <div class="lane-header">
      <span class="lane-tag">Proceso habitual</span>
      <h3 class="lane-title">Con {competitorName}</h3>
      <span class="lane-subtitle">Lo que nos cuentan quienes migraron</span>
    </div>
    <ol class="lane-steps">
      {#each REPORTED as step, i (step.label)}
        <li>
          <div class="lane-dot lane-rombo" aria-hidden="true">
            <span class="lane-num">{String(i + 1).padStart(2, '0')}</span>
          </div>
          <div class="lane-content">
            <strong>{step.label}</strong>
            <p>{step.note}</p>
          </div>
        </li>
      {/each}
    </ol>
  </div>

  <div class="lane lane-kipus">
    <div class="lane-header">
      <span class="lane-tag lane-tag-kipus">
        <span class="knot-dot" aria-hidden="true"></span>
        Puesta en marcha ágil
      </span>
      <h3 class="lane-title">Con KipusPay</h3>
      <span class="lane-subtitle">Tu mostrador listo en 5 minutos</span>
    </div>
    <ol class="lane-steps">
      {#each KIPUS as step, i (step.label)}
        <li>
          <div class="lane-dot lane-rombo" aria-hidden="true">
            <span class="lane-num">{String(i + 1).padStart(2, '0')}</span>
          </div>
          <div class="lane-content">
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
    grid-template-columns: 1fr;
    gap: 1.75rem;
    margin-top: 2.5rem;
  }

  @media (min-width: 719px) {
    .migration-timeline {
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }
  }

  .lane {
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: var(--radius-md, 0.75rem);
    padding: 1.75rem 1.75rem 2rem;
    background: rgba(20, 22, 28, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: var(--paper);
    position: relative;
    overflow: hidden;
    transition: all 0.25s ease;
  }

  .lane-reported {
    border-color: rgba(243, 239, 230, 0.1);
    background: rgba(20, 22, 28, 0.75);
  }

  .lane-kipus {
    border-color: var(--amber);
    background: linear-gradient(180deg, rgba(35, 28, 18, 0.9) 0%, rgba(20, 22, 28, 0.96) 100%);
    box-shadow: 0 8px 32px rgba(217, 154, 61, 0.12);
  }

  .lane-kipus:hover {
    box-shadow: 0 12px 40px rgba(217, 154, 61, 0.2);
    border-color: var(--amber-bright);
  }

  .lane-header {
    margin-bottom: 1.75rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(243, 239, 230, 0.08);
  }

  .lane-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: rgba(243, 239, 230, 0.08);
    color: rgba(243, 239, 230, 0.7);
    margin-bottom: 0.5rem;
  }

  .lane-tag-kipus {
    background: rgba(217, 154, 61, 0.18);
    color: var(--amber-bright);
    border: 1px solid rgba(217, 154, 61, 0.35);
  }

  .lane-tag-kipus .knot-dot {
    width: 5px;
    height: 5px;
    background: var(--amber-bright);
    box-shadow: 0 0 6px var(--amber-bright);
  }

  .lane-title {
    font-family: var(--font-display);
    font-size: 1.35rem;
    margin: 0.25rem 0 0.2rem;
    color: var(--paper);
  }

  .lane-subtitle {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .lane-steps {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.5rem;
  }

  /* Cordel vertical continuo de fibra quipu */
  .lane-steps::before {
    content: '';
    position: absolute;
    top: 1.1rem;
    bottom: 1.1rem;
    left: 1.1rem;
    width: var(--fiber-w, 2px);
    background: var(--fiber);
    transform: translateX(-50%);
    z-index: 0;
  }

  .lane-kipus .lane-steps::before {
    background: linear-gradient(180deg, var(--amber) 0%, var(--amber-bright) 100%);
    box-shadow: 0 0 8px rgba(217, 154, 61, 0.4);
  }

  .lane-steps li {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
  }

  /* Rombo Quipu estilizado */
  .lane-dot {
    width: 2.2rem;
    height: 2.2rem;
    min-width: 2.2rem;
    transform: rotate(45deg);
    display: grid;
    place-items: center;
    background: var(--ink-2, #1a1d24);
    border: 1px solid rgba(243, 239, 230, 0.2);
    border-radius: 4px;
    margin-top: 0.15rem;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .lane-num {
    transform: rotate(-45deg);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(243, 239, 230, 0.6);
    line-height: 1;
  }

  .lane-reported li:hover .lane-dot {
    border-color: rgba(243, 239, 230, 0.4);
    background: rgba(243, 239, 230, 0.08);
  }

  .lane-kipus .lane-dot {
    background: var(--amber);
    border-color: var(--amber-bright);
    box-shadow: 0 0 10px rgba(217, 154, 61, 0.45);
  }

  .lane-kipus .lane-num {
    color: var(--ink);
    font-weight: 800;
  }

  .lane-kipus li:hover .lane-dot {
    transform: rotate(45deg) scale(1.1);
    background: var(--amber-bright);
    box-shadow: 0 0 18px rgba(238, 183, 101, 0.75);
  }

  .lane-content {
    flex: 1;
    min-width: 0;
  }

  .lane-steps strong {
    display: block;
    font-size: 1rem;
    font-weight: 600;
    color: var(--paper);
    margin-bottom: 0.2rem;
    line-height: 1.35;
  }

  .lane-steps p {
    color: rgba(243, 239, 230, 0.7);
    font-size: 0.875rem;
    line-height: 1.45;
    margin: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .lane,
    .lane-dot,
    .lane-kipus li:hover .lane-dot {
      transition: none;
      transform: none;
    }
  }
</style>
