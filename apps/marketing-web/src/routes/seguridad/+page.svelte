<script lang="ts">
  import { SECURITY_PAGE } from '$lib/content/security';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
</script>

<svelte:head>
  <title>{SECURITY_PAGE.title} · KipusPay</title>
  <meta name="description" content={SECURITY_PAGE.lede} />
  <meta property="og:title" content="{SECURITY_PAGE.title} · KipusPay" />
  <meta property="og:description" content={SECURITY_PAGE.lede} />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/seguridad" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Confianza y Seguridad
      </p>
      <h1>{SECURITY_PAGE.headline}</h1>
      <p class="hero-sub">{SECURITY_PAGE.lede}</p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#pilares">Ver pilares</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="pilares" data-testid="seguridad-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Pilares fundamentales
        </p>
        <h2>Tus datos, tu caja y tu tranquilidad.</h2>
        <p class="section-lead">Diseñado desde la arquitectura para responder cuando más importa.</p>
      </div>

      <div class="pillar-grid">
        {#each SECURITY_PAGE.pillars as p, i (p.id)}
          <article class="pillar-card" data-testid="security-pillar" use:reveal data-reveal-delay={i % 3}>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </article>
        {/each}
      </div>

      <aside class="disclaimers-box" data-testid="security-disclaimers" use:reveal>
        <h3>Transparencia: Lo que no afirmamos</h3>
        <ul>
          {#each SECURITY_PAGE.disclaimers as d (d)}
            <li>
              <span class="knot-dot" aria-hidden="true"></span>
              {d}
            </li>
          {/each}
        </ul>
      </aside>

      <div class="sunat-flow" data-testid="security-sunat-flow" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {SECURITY_PAGE.sunatFlow.eyebrow}
        </p>
        <h2 class="flow-title">{SECURITY_PAGE.sunatFlow.heading}</h2>
        <ol class="flow-steps">
          {#each SECURITY_PAGE.sunatFlow.steps as step, i (step.title)}
            <li>
              <span class="step-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          {/each}
        </ol>
      </div>

      <div class="legal-note-grid" use:reveal>
        <article class="legal-note-card">
          <h3>{SECURITY_PAGE.retention.heading}</h3>
          <p>{SECURITY_PAGE.retention.body}</p>
        </article>
        <article class="legal-note-card">
          <h3>{SECURITY_PAGE.sla.heading}</h3>
          <p>{SECURITY_PAGE.sla.body}</p>
        </article>
      </div>

      <div class="sunat-flow" data-testid="security-uptime" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {SECURITY_PAGE.uptime.eyebrow}
        </p>
        <h2 class="flow-title">{SECURITY_PAGE.uptime.heading}</h2>
        <ul class="uptime-points">
          {#each SECURITY_PAGE.uptime.points as point (point.title)}
            <li>
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </li>
          {/each}
        </ul>
      </div>

      <div class="cta-row" style="margin-top: 3rem;" use:reveal>
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/precios">Ver planes</a>
      </div>
    </div>
  </div>
</section>

<style>
  .sunat-flow {
    margin-top: 3rem;
    padding-top: 2.5rem;
    border-top: 1px solid var(--line);
  }

  .flow-title {
    font-family: var(--font-display);
    font-size: var(--step-3);
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 2rem;
  }

  .flow-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .flow-steps li {
    display: flex;
    gap: 1.25rem;
    padding: 1.1rem 0;
    border-bottom: 1px solid var(--line);
  }

  .flow-steps li:first-child {
    padding-top: 0;
  }

  .flow-steps li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .step-num {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--amber-bright);
    padding-top: 0.25rem;
  }

  .flow-steps h3 {
    font-size: 1.05rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }

  .flow-steps p {
    color: var(--muted);
    line-height: 1.6;
    max-width: 40rem;
  }

  .legal-note-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
    margin-top: 2.5rem;
  }

  .legal-note-card {
    background: var(--ink-2);
    color: var(--paper);
    border: 1px solid var(--line);
    padding: 1.5rem;
  }

  .legal-note-card h3 {
    font-size: 1.05rem;
    font-weight: 700;
    margin-bottom: 0.55rem;
  }

  .legal-note-card p {
    color: rgba(243, 239, 230, 0.82);
    line-height: 1.6;
    font-size: 0.9375rem;
  }

  .uptime-points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }

  .uptime-points li {
    padding: 1.25rem;
    background: var(--ink-2);
    color: var(--paper);
    border: 1px solid var(--line);
  }

  .uptime-points h3 {
    font-size: 1.05rem;
    font-weight: 700;
    margin-bottom: 0.4rem;
  }

  .uptime-points p {
    color: rgba(243, 239, 230, 0.82);
    line-height: 1.6;
    font-size: 0.9375rem;
  }
</style>
