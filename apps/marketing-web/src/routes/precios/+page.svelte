<script lang="ts">
  import { PRICING_DISCLAIMERS, PRICING_PLANS } from '$lib/content/pricing';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
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
  <link rel="canonical" href="https://kipuspay.pe/precios" />
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
          GTM §4.1
        </p>
        <h2>Cuatro planes. Sin letra chica de “sin limite”.</h2>
        <p class="section-lead">
          Arranque incluye 1,000 comprobantes/mes; el adicional se factura fuera del cobro. Nunca hay
          HTTP 402 en la caja.
        </p>
      </div>
      <div class="pricing-grid">
        {#each PRICING_PLANS as plan, i (plan.id)}
          <article class="pricing-card" data-plan={plan.id} use:reveal data-reveal-delay={i % 3}>
            <p class="pricing-name">{plan.name}</p>
            <p class="pricing-price">{plan.monthlyLabel}</p>
            <p class="pricing-annual">{plan.annualLabel}</p>
            <p class="pricing-audience">{plan.audience}</p>
            <ul>
              {#each plan.limits as limit (limit)}
                <li>{limit}</li>
              {/each}
            </ul>
            {#if plan.upgradeGates.length > 0}
              <p class="pricing-gates">
                Subes de plan cuando pedis: {plan.upgradeGates.join(' · ')}.
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
