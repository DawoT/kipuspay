<script lang="ts">
  import { SECURITY_PAGE } from '$lib/content/security';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { ogImageFor } from '$lib/seo';

  /** Los 5 pasos del flujo visual — sin jerga técnica (V-26). */
  const FLOW_STEPS = [
    {
      label: 'Tu venta',
      description: 'Registras la venta en tu caja, con o sin internet. El comprobante se genera al instante.',
      icon: 'cart',
    },
    {
      label: 'KipusPay lo recibe',
      description: 'Revisamos que los datos del comprobante sean correctos antes de enviarlo.',
      icon: 'shield-check',
    },
    {
      label: 'Envío automático',
      description: 'Enviamos tu comprobante de forma automática. No necesitas hacer nada extra.',
      icon: 'cloud-upload',
    },
    {
      label: 'Confirmación oficial',
      description: 'La autoridad tributaria recibe el comprobante y emite su respuesta. Mostramos el estado real: pendiente, aceptado o rechazado.',
      icon: 'institution',
    },
    {
      label: 'Tu comprobante válido',
      description: 'El comprobante queda disponible en tu panel y puedes enviárselo a tu cliente cuando quieras.',
      icon: 'document',
    },
  ] as const;

  let activeStep = $state<number | null>(null);
</script>

<svelte:head>
  <title>{SECURITY_PAGE.title} · KipusPay</title>
  <meta name="description" content={SECURITY_PAGE.lede} />
  <meta property="og:title" content="{SECURITY_PAGE.title} · KipusPay" />
  <meta property="og:description" content={SECURITY_PAGE.lede} />
  <meta property="og:image" content={ogImageFor()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{SECURITY_PAGE.title} · KipusPay" />
  <meta name="twitter:description" content={SECURITY_PAGE.lede} />
  <meta name="twitter:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/seguridad" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Confianza y Seguridad
      </p>
      <p class="brand-mark">KipusPay</p>
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
        <p class="section-lead">Hecho para que la caja no falle cuando más la necesitas.</p>
      </div>

      <ol class="pillar-rows" data-testid="security-pillars">
        {#each SECURITY_PAGE.pillars as p, i (p.id)}
          <li class="pillar-row" data-testid="security-pillar" use:reveal data-reveal-delay={i % 3}>
            <span class="pillar-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          </li>
        {/each}
      </ol>

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

      <!-- Sprint 11C: Diagrama visual interactivo del flujo de emisión -->
      <div class="sunat-flow" data-testid="security-sunat-flow" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {SECURITY_PAGE.sunatFlow.eyebrow}
        </p>
        <h2 class="flow-title">{SECURITY_PAGE.sunatFlow.heading}</h2>

        <!-- Diagrama visual de 5 pasos — sin jerga técnica (V-26) -->
        <ol
          class="trust-flow"
          role="list"
          aria-label="Pasos del proceso de emisión de comprobantes"
        >
          {#each FLOW_STEPS as step, i}
            <li
              class="trust-flow__step"
              class:is-active={activeStep === i}
              data-testid="flow-step-{i + 1}"
              role="listitem"
              onmouseenter={() => (activeStep = i)}
              onmouseleave={() => (activeStep = null)}
              aria-label="{step.label}: {step.description}"
            >
              <div class="trust-flow__node" aria-hidden="true">
                <span class="trust-flow__icon">
                  <Icon name={step.icon} size={20} />
                </span>
                <span class="trust-flow__num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <p class="trust-flow__label">{step.label}</p>
              <div
                class="trust-flow__tooltip"
                role="tooltip"
                id="flow-tooltip-{i + 1}"
                aria-hidden={activeStep !== i}
              >
                {step.description}
              </div>
              {#if i < FLOW_STEPS.length - 1}
                <div class="trust-flow__connector" aria-hidden="true">
                  <div class="trust-flow__line"></div>
                  <div class="trust-flow__arrow">›</div>
                </div>
              {/if}
            </li>
          {/each}
        </ol>

        <!-- Vista de lista compacta (accesibilidad / no-JS / móvil pequeño) -->
        <ol class="flow-steps flow-steps-detail" aria-label="Detalle del proceso de emisión">
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
          <ul class="severity-list">
            {#each SECURITY_PAGE.sla.severities as severity (severity.title)}
              <li>
                <strong>{severity.title}.</strong> {severity.body}
              </li>
            {/each}
          </ul>
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
  /* ── Sprint 11C: Trust-flow interactive diagram ───────────────────── */

  .trust-flow {
    list-style: none;
    margin: 0 0 2.5rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    align-items: flex-start;
  }

  .trust-flow__step {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    /* min 44×44 touch target on the node */
    min-width: 5rem;
    flex: 1 1 5rem;
    cursor: default;
    outline: none;
    padding: 0.75rem 0.5rem;
    transition: none;
  }

  /* Focus ring matches brand amber */
  .trust-flow__step:focus-visible .trust-flow__node {
    outline: 2px solid var(--amber-bright);
    outline-offset: 3px;
  }

  .trust-flow__node {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    min-width: 44px;
    min-height: 44px;
    border: 2px solid var(--line-ink);
    background: var(--paper);
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .trust-flow__step.is-active .trust-flow__node,
  .trust-flow__step:focus-visible .trust-flow__node {
    border-color: var(--amber);
    background: var(--amber);
  }

  .trust-flow__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: var(--ink);
    transition: color 0.2s ease;
  }

  .trust-flow__num {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--muted-ink);
    letter-spacing: 0.06em;
  }

  .trust-flow__step.is-active .trust-flow__num,
  .trust-flow__step:focus-visible .trust-flow__num {
    color: var(--ink);
  }

  .trust-flow__label {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.78rem;
    font-weight: 700;
    text-align: center;
    color: var(--ink);
    line-height: 1.3;
    max-width: 5rem;
  }

  /* Tooltip — shown on hover/focus */
  .trust-flow__tooltip {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    width: 13rem;
    padding: 0.65rem 0.85rem;
    background: var(--ink-2);
    color: var(--paper);
    font-size: 0.82rem;
    line-height: 1.5;
    border: 1px solid var(--amber);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .trust-flow__step.is-active .trust-flow__tooltip,
  .trust-flow__step:focus-visible .trust-flow__tooltip {
    opacity: 1;
  }

  /* Connector between steps */
  .trust-flow__connector {
    position: absolute;
    top: 1.8rem; /* center of the node */
    right: -1rem;
    display: flex;
    align-items: center;
    gap: 0;
    width: 2rem;
    height: 2px;
    z-index: 1;
  }

  .trust-flow__line {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, var(--line-ink) 0%, var(--amber) 100%);
    background-size: 200% 100%;
    background-position: 100% 0;
    animation: flowLine 2.4s ease-in-out infinite alternate;
  }

  .trust-flow__arrow {
    font-size: 1rem;
    color: var(--amber);
    line-height: 1;
    margin-top: -1px;
    transition: transform 0.2s ease, color 0.2s ease, text-shadow 0.2s ease;
  }

  .trust-flow__step:hover .trust-flow__line,
  .trust-flow__step:focus-visible .trust-flow__line,
  .trust-flow__step:focus-within .trust-flow__line,
  .trust-flow__step.is-active .trust-flow__line {
    background: linear-gradient(90deg, var(--amber) 0%, var(--amber-bright) 100%);
    box-shadow: 0 0 10px rgba(217, 154, 61, 0.7);
    animation: flowPulse 0.8s ease-in-out infinite alternate;
  }

  .trust-flow__step:hover .trust-flow__arrow,
  .trust-flow__step:focus-visible .trust-flow__arrow,
  .trust-flow__step:focus-within .trust-flow__arrow,
  .trust-flow__step.is-active .trust-flow__arrow {
    color: var(--amber-bright);
    text-shadow: 0 0 8px rgba(238, 183, 101, 0.8);
    transform: translateX(2px);
  }

  @keyframes flowLine {
    from { background-position: 100% 0; }
    to   { background-position: 0% 0;   }
  }

  @keyframes flowPulse {
    0% {
      opacity: 0.8;
      transform: scaleY(1);
      box-shadow: 0 0 4px rgba(217, 154, 61, 0.4);
    }
    100% {
      opacity: 1;
      transform: scaleY(1.8);
      box-shadow: 0 0 12px rgba(238, 183, 101, 0.85);
    }
  }

  /* Respect prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    .trust-flow__line,
    .trust-flow__step:hover .trust-flow__line,
    .trust-flow__step:focus-visible .trust-flow__line,
    .trust-flow__step:focus-within .trust-flow__line,
    .trust-flow__step.is-active .trust-flow__line {
      animation: none;
      background: var(--amber);
      background-position: 0% 0;
      box-shadow: none;
      transform: none;
    }
    .trust-flow__step:hover .trust-flow__arrow,
    .trust-flow__step:focus-visible .trust-flow__arrow,
    .trust-flow__step:focus-within .trust-flow__arrow,
    .trust-flow__step.is-active .trust-flow__arrow {
      transform: none;
      text-shadow: none;
    }
    .trust-flow__node,
    .trust-flow__tooltip {
      transition: none;
    }
  }

  /* Mobile: vertical stack */
  @media (max-width: 719px) {
    .trust-flow {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
    }
    .trust-flow__step {
      flex-direction: row;
      align-items: flex-start;
      width: 100%;
      min-width: 0;
    }
    .trust-flow__label {
      text-align: left;
      max-width: none;
    }
    .trust-flow__connector {
      display: none;
    }
    .trust-flow__tooltip {
      position: static;
      transform: none;
      width: auto;
      opacity: 0;
      max-height: 0;
      overflow: hidden;
      padding: 0;
      border: none;
      transition: none;
    }
    .trust-flow__step.is-active .trust-flow__tooltip,
    .trust-flow__step:focus-visible .trust-flow__tooltip {
      opacity: 1;
      max-height: 10rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--amber);
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */

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

  .severity-list {
    margin-top: 0.75rem;
    padding-left: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
  }

  .severity-list li {
    color: rgba(243, 239, 230, 0.82);
    line-height: 1.55;
    font-size: 0.875rem;
  }

  .severity-list strong {
    color: var(--paper);
    font-weight: 700;
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
