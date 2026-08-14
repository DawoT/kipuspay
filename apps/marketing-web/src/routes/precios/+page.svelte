<script lang="ts">
  import { PRICING_DISCLAIMERS, PRICING_PLANS } from '$lib/content/pricing';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
  import { formatCents } from '$lib/brand/money';

  let isAnnual = $state(false);

  const productLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'KipusPay POS y Facturación Electrónica',
    description: 'Punto de venta y facturación electrónica para comercios del Perú.',
    offers: PRICING_PLANS.filter((plan) => plan.monthlyCents !== null).map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      priceCurrency: 'PEN',
      price: formatCents(plan.monthlyCents ?? 0),
      description: plan.audience,
      url: 'https://kipuspay.com/precios',
    })),
  });
</script>

<svelte:head>
  <title>Precios · KipusPay</title>
  <meta
    name="description"
    content="Planes Arranque, Crece, Cadena y Enterprise. El cobro nunca se apaga por volumen."
  />
  <meta property="og:title" content="Precios · KipusPay" />
  <meta property="og:description" content="Cuatro planes. Cupo transparente. Sin apagar la caja." />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/precios" />
  <script type="application/ld+json">{@html productLd}</script>
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Pricing
      </p>
      <h1>Planes claros. El cobro no se apaga.</h1>
      <p class="hero-sub">
        Empieza en Arranque, sube cuando tu negocio pida una capacidad nueva — nunca porque se te
        acabaron los comprobantes.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#planes">Ver planes</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="planes" data-testid="pricing-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Planes
        </p>
        <h2>Cuatro planes. Sin letra chica de “sin límite”.</h2>
        <p class="section-lead">
          Arranque incluye 1,000 comprobantes/mes; el adicional se factura fuera del cobro. Nunca hay
          interrupción en la caja.
        </p>
      </div>

      <div class="pricing-toggle-wrap" use:reveal>
        <button
          type="button"
          class="pricing-toggle-btn"
          class:active={!isAnnual}
          onclick={() => (isAnnual = false)}
        >
          Mensual
        </button>
        <button
          type="button"
          class="pricing-toggle-btn"
          class:active={isAnnual}
          onclick={() => (isAnnual = true)}
        >
          Anual
          <span class="discount-badge">2 meses gratis (ahorra 20%)</span>
        </button>
      </div>

      <div class="pricing-grid">
        {#each PRICING_PLANS as plan, i (plan.id)}
          <article
            class="pricing-card"
            class:highlight={plan.id === 'crece'}
            data-plan={plan.id}
            use:reveal
            data-reveal-delay={i % 3}
          >
            <p class="pricing-name">
              {plan.name}
              {#if plan.badge}
                <span class="pricing-badge">{plan.badge}</span>
              {/if}
            </p>
            <p class="pricing-price">
              {isAnnual ? plan.annualLabel : plan.monthlyLabel}
            </p>
            {#if isAnnual && plan.id !== 'enterprise'}
              <p class="pricing-annual-sub">Facturación anual diferida</p>
            {/if}
            <p class="pricing-audience">{plan.audience}</p>
            <ul>
              {#each plan.features as feature (feature)}
                <li class="pricing-feature">{feature}</li>
              {/each}
            </ul>
            <ul class="pricing-limits">
              {#each plan.limits as limit (limit)}
                <li>{limit}</li>
              {/each}
            </ul>
            {#if plan.upgradeGates.length > 0}
              <p class="pricing-gates">
                Subes de plan cuando pides: {plan.upgradeGates.join(' · ')}.
              </p>
            {/if}
            {#if plan.id === 'arranque'}
              <a class="btn" href="/empezar">Empezar en Arranque</a>
            {:else if plan.id === 'enterprise'}
              <a class="btn btn-ghost" href="/empezar">Hablar con nosotros</a>
            {:else}
              <a class="btn btn-ghost" href="/empezar">Probar y decidir</a>
            {/if}
          </article>
        {/each}
      </div>
      <p class="pricing-note" use:reveal>{PRICING_DISCLAIMERS.cupo}</p>
      <p class="pricing-note" use:reveal>{PRICING_DISCLAIMERS.gracia}</p>
    </div>
  </div>
</section>

<style>
  .pricing-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem;
    background: var(--ink-2);
    border: 1px solid var(--line);
    margin-bottom: 2.5rem;
  }
  .pricing-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.1rem;
    font-family: var(--font-mono);
    font-size: 0.88rem;
    border: none;
    background: transparent;
    color: rgba(243, 239, 230, 0.7);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pricing-toggle-btn.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 700;
  }
  .discount-badge {
    padding: 0.2rem 0.45rem;
    background: var(--sello-bright);
    color: var(--paper);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .pricing-card.highlight {
    border-color: var(--amber);
    box-shadow: 0 8px 32px rgba(217, 154, 61, 0.15);
  }
  .pricing-badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.2rem 0.5rem;
    background: var(--amber);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
  }
  .pricing-annual-sub {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--sello-bright);
    margin: -0.5rem 0 1rem;
  }
</style>
