<script lang="ts">
  import { publishedCases, allSimulations } from '$lib/content/cases';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import SavingsCalculator from '$lib/components/SavingsCalculator.svelte';
  import { ogImageFor } from '$lib/seo';

  const cases = publishedCases();
  const simulations = allSimulations();
</script>

<svelte:head>
  <title>Casos de éxito y simulaciones de mostrador · KipusPay</title>
  <meta
    name="description"
    content="Simulaciones operativas de mostrador y casos de éxito reales para cafeterías, minimarkets y boticas en el Perú."
  />
  <meta property="og:title" content="Casos de éxito y simulaciones de mostrador · KipusPay" />
  <meta property="og:description" content="Simulaciones operativas y métricas de mostrador: Antes vs Con KipusPay." />
  <meta property="og:image" content={ogImageFor()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Casos de éxito y simulaciones de mostrador · KipusPay" />
  <meta
    name="twitter:description"
    content="Simulaciones operativas y métricas de mostrador: Antes vs Con KipusPay."
  />
  <meta name="twitter:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/casos-de-exito" />
  {#if cases.length === 0}
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Casos y simulaciones de mostrador
      </p>
      <p class="brand-mark">KipusPay</p>
      <h1>Historias con permiso y números de mostrador real.</h1>
      <p class="hero-sub">
        Solo publicamos testimonios cuando el negocio nos autoriza explícitamente y modelamos el impacto operativo con mediciones de tiempos de atención reales.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#simulaciones">Ver simulaciones operativas</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="simulaciones" data-testid="casos-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      {#if cases.length === 0}
        <div class="empty-cases-box" data-testid="casos-empty" use:reveal>
          <h3>Sin testimonios inflados</h3>
          <p>
            Todavía no hay casos publicados con autorización explícita. Preferimos esperar a métricas reales comprobadas antes de poner un logo en la vitrina. A continuación te mostramos simulaciones de mostrador construidas con tiempos y flujos reales de atención.
          </p>
          <p class="trust-more">
            <a class="btn btn-ghost" href="/para/retail">Ver tu rubro</a>
          </p>
        </div>
      {:else}
        <ul class="case-list">
          {#each cases as c (c.id)}
            <li data-testid="caso-item" use:reveal>
              <p class="quote">“{c.quote}”</p>
              <p class="who">{c.businessName} · {c.rubro}</p>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="simulations-header" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Impacto operativo medido
        </p>
        <h2>Simulaciones operativas de mostrador</h2>
        <p class="section-lead">
          Tres modelos de negocio comunes en el Perú y cómo cambia su velocidad de atención, cuadre de caja y control al pasar a KipusPay.
        </p>
      </div>

      <div class="simulations-grid">
        {#each simulations as sim, i (sim.id)}
          <article class="simulation-card" use:reveal data-reveal-delay={i % 3}>
            <header class="sim-header">
              <div class="sim-meta">
                <span class="sim-archetype">{sim.archetype}</span>
                <span class="sim-location">{sim.location} · {sim.dailyTransactions}</span>
              </div>
              <h3 class="sim-headline">{sim.headline}</h3>
            </header>

            <div class="sim-comparison">
              <div class="sim-col sim-before">
                <h4>Desafío con sistema anterior</h4>
                <p>{sim.operationalChallenge}</p>
              </div>
              <div class="sim-col sim-after">
                <h4>Solución con KipusPay</h4>
                <p>{sim.kipusSolution}</p>
              </div>
            </div>

            <div class="sim-metrics-table-wrap">
              <table class="sim-metrics-table" aria-label={`Métricas de simulación para ${sim.archetype}`}>
                <thead>
                  <tr>
                    <th scope="col">Métrica operativa</th>
                    <th scope="col">Antes</th>
                    <th scope="col">Con KipusPay</th>
                    <th scope="col">Impacto</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sim.metrics as m (m.label)}
                    <tr>
                      <th scope="row">{m.label}</th>
                      <td class="metric-before">{m.before}</td>
                      <td class="metric-kipus">{m.withKipus}</td>
                      <td class="metric-improvement">
                        <span class="badge-improvement">{m.improvement}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <footer class="sim-footer">
              <p class="sim-quote">
                <strong>Voz del dueño:</strong> “{sim.ownerTakeaway}”
              </p>
              <a class="btn btn-ghost sim-cta" href={`/para/${sim.rubro}`}>
                Ver solución para {sim.rubro} →
              </a>
            </footer>
          </article>
        {/each}
      </div>

      <div class="calculator-anchor" use:reveal>
        <SavingsCalculator />
      </div>
    </div>
  </div>
</section>

<style>
  .simulations-header {
    margin-top: 3.5rem;
    margin-bottom: 2rem;
  }

  .simulations-grid {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .simulation-card {
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: var(--inset-card);
    color: var(--paper);
  }

  .sim-header {
    margin-bottom: 1.5rem;
    border-bottom: 1px solid rgba(243, 239, 230, 0.1);
    padding-bottom: 1.25rem;
  }

  .sim-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .sim-archetype {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(229, 169, 59, 0.15);
    color: var(--amber-bright);
    padding: 0.25rem 0.6rem;
    border-radius: var(--radius-xs);
    font-weight: 600;
  }

  .sim-location {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: rgba(243, 239, 230, 0.65);
  }

  .sim-headline {
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 2.2vw, 1.5rem);
    font-weight: 700;
    line-height: 1.25;
    margin-top: 0.5rem;
    color: var(--paper);
  }

  .sim-comparison {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }

  @media (min-width: 719px) {
    .sim-comparison {
      grid-template-columns: 1fr 1fr;
    }
  }

  .sim-col {
    padding: 1rem;
    border-radius: 3px;
  }

  .sim-before {
    background: rgba(0, 0, 0, 0.25);
    border-left: 3px solid rgba(243, 239, 230, 0.3);
  }

  .sim-after {
    background: rgba(229, 169, 59, 0.08);
    border-left: 3px solid var(--amber-bright);
  }

  .sim-col h4 {
    font-size: 0.9rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.5rem;
    color: var(--paper);
  }

  .sim-col p {
    font-size: 0.95rem;
    line-height: 1.55;
    color: rgba(243, 239, 230, 0.85);
    margin: 0;
  }

  .sim-metrics-table-wrap {
    overflow-x: auto;
    margin-bottom: 1.5rem;
  }

  .sim-metrics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .sim-metrics-table th,
  .sim-metrics-table td {
    padding: 0.75rem 0.9rem;
    text-align: left;
    border-bottom: 1px solid rgba(243, 239, 230, 0.08);
  }

  .sim-metrics-table thead th {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.6);
    background: rgba(0, 0, 0, 0.2);
  }

  .metric-before {
    color: rgba(243, 239, 230, 0.6);
    font-family: var(--font-mono);
  }

  .metric-kipus {
    color: var(--paper);
    font-family: var(--font-mono);
    font-weight: 600;
  }

  .badge-improvement {
    display: inline-block;
    background: rgba(52, 211, 153, 0.15);
    color: #6ee7b7;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
  }

  .sim-footer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-top: 1px solid rgba(243, 239, 230, 0.1);
    padding-top: 1.25rem;
    align-items: flex-start;
  }

  @media (min-width: 719px) {
    .sim-footer {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }

  .sim-quote {
    font-style: italic;
    color: rgba(243, 239, 230, 0.9);
    margin: 0;
    max-width: 50ch;
    font-size: 0.92rem;
  }

  .sim-cta {
    white-space: nowrap;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .calculator-anchor {
    margin-top: 3.5rem;
  }
</style>
