<script lang="ts">
  import type { VerticalLanding } from '$lib/content/types';
  import { reveal } from '$lib/components/reveal';
  import ClaimFeature from './ClaimFeature.svelte';
  import QuipuHero from '$lib/brand/QuipuHero.svelte';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import CheckoutMock from '$lib/brand/CheckoutMock.svelte';
  import RestaurantMock from '$lib/components/vertical-mocks/RestaurantMock.svelte';
  import PharmacyMock from '$lib/components/vertical-mocks/PharmacyMock.svelte';
  import RetailMock from '$lib/components/vertical-mocks/RetailMock.svelte';
  import ServicesMock from '$lib/components/vertical-mocks/ServicesMock.svelte';
  import ChainMock from '$lib/components/vertical-mocks/ChainMock.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { allVerticals, otherVerticals } from '$lib/content/verticals';
  import { casesForRubro, simulationForRubro } from '$lib/content/cases';

  let { landing }: { landing: VerticalLanding } = $props();

  const allV = allVerticals();
  const others = $derived(otherVerticals(landing.slug));
  const verticalCases = $derived(casesForRubro(landing.slug));
  const simulation = $derived(simulationForRubro(landing.slug));
</script>

<article
  data-testid="vertical-landing"
  data-slug={landing.slug}
  data-cord={landing.slug}
>
  <section class="hero">
    <QuipuHero videoSrc="/media/hero-quipu.mp4" poster={landing.heroPoster} />
    <div class="hero-inner">
      <div class="hero-main">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            {landing.navLabel}
          </p>
          <p class="brand-mark">KipusPay</p>
          <h1>{landing.hook}</h1>
          <p class="hero-sub">{landing.pain}</p>
          <div class="hero-actions">
            <a class="btn" href="/empezar">Probar gratis ahora</a>
            <a class="btn btn-ghost" href="#destacado">Ver detalle</a>
          </div>
        </div>
      </div>

      {#if landing.heroBadges && landing.heroBadges.length > 0}
        <div class="hero-badges" aria-label={`Beneficios para ${landing.navLabel}`} use:reveal>
          {#each landing.heroBadges as badge, i}
            <div class="hero-badge-item" data-reveal-delay={i % 4}>
              <span class="hero-badge-icon" aria-hidden="true">
                <Icon name={badge.icon} size={22} tone="amber" />
              </span>
              <div class="hero-badge-text">
                <strong>{badge.title}</strong>
                <span>{badge.description}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <nav class="rubro-switch" aria-label="Seleccionar rubro">
    <div class="rubro-switch-inner">
      <div class="rubro-switch-head">
        <span class="knot-dot" aria-hidden="true"></span>
        <label class="rubro-switch-label" for="rubro-select">Ver por rubro:</label>
      </div>
      <select
        id="rubro-select"
        class="rubro-select"
        value={landing.slug}
        onchange={(e) => {
          const el = e.currentTarget;
          if (el.value) window.location.assign(`/para/${el.value}`);
        }}
      >
        {#each allV as v (v.slug)}
          <option value={v.slug}>{v.navLabel}</option>
        {/each}
      </select>
      <ul class="rubro-links">
        {#each allV as v (v.slug)}
          <li>
            <a href="/para/{v.slug}" class:active={v.slug === landing.slug}>
              <span class="knot-dot" aria-hidden="true"></span>
              {v.navLabel}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </nav>

  <section class="section section-paper">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="entry" tone="paper" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Realidad de tu mostrador
          </p>
          <h2>Respuestas concretas a los desafíos de tu rubro</h2>
        </div>
        <div class="pain-grid editorial-pains">
          {#each landing.pains as item, i (item.pain)}
            <article use:reveal data-reveal-delay={i % 3}>
              <p class="quote">“{item.pain}”</p>
              <p class="relief">
                <span class="knot-dot" aria-hidden="true"></span>
                {item.relief}
              </p>
            </article>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="destacado">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="synced" tone="ink" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Lo que ya puedes hacer
          </p>
          <h2>{landing.title}</h2>
          <p class="section-lead">Nada de funciones de papel. Esto ya cobra en tu mostrador hoy.</p>
        </div>
        <ul class="knot-list">
          {#each landing.points as point, i (point)}
            <li use:reveal data-reveal-delay={i % 3}>{point}</li>
          {/each}
        </ul>
        <ClaimFeature claimId={landing.featuredClaimId} />
        {#if landing.secondaryClaimId}
          <ClaimFeature claimId={landing.secondaryClaimId} />
        {/if}
      </div>
    </div>
  </section>

  <section class="section section-paper">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="synced" tone="paper" />
      </div>
      <div class="section-body product-grid">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Así se ve en tu mostrador
          </p>
          <h2>La pantalla que usa tu equipo, no una demo de catálogo.</h2>
          <p class="section-lead">
            El producto arriba, el total grande y el botón de cobrar. Debajo, la costura que avisa
            que la venta ya quedó guardada.
          </p>
        </div>
        <div class="product-screen" use:reveal>
          {#if landing.slug === 'restaurantes'}
            <RestaurantMock theme="dark" />
          {:else if landing.slug === 'farmacias'}
            <PharmacyMock theme="dark" />
          {:else if landing.slug === 'retail'}
            <RetailMock theme="dark" />
          {:else if landing.slug === 'servicios'}
            <ServicesMock theme="dark" />
          {:else if landing.slug === 'cadenas'}
            <ChainMock theme="dark" />
          {:else}
            <CheckoutMock
              lines={landing.checkout.lines}
              documentLabel={landing.checkout.documentLabel}
              register={landing.checkout.register}
              syncState={landing.checkout.syncState}
              caption={landing.checkout.caption}
              theme="dark"
            />
          {/if}
        </div>
      </div>
    </div>
  </section>

  <section class="section section-paper" data-testid="vertical-cases">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="synced" tone="paper" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Impacto operativo real
          </p>
          <h2>Mediciones de mostrador en {landing.navLabel.toLowerCase()}</h2>
          <p class="section-lead">
            Tiempos de atención y comparativas antes vs con KipusPay medidas en operaciones reales de tu rubro.
          </p>
        </div>

        {#if simulation}
          <div class="sim-card-featured" use:reveal>
            <div class="sim-card-header">
              <div>
                <span class="sim-badge">{simulation.archetype}</span>
                <span class="sim-location">📍 {simulation.location} · {simulation.dailyTransactions}</span>
              </div>
            </div>
            <h3 class="sim-headline">{simulation.headline}</h3>

            <div class="sim-flow-grid">
              <div class="sim-flow-col sim-before">
                <span class="sim-tag">El problema previo</span>
                <p>{simulation.operationalChallenge}</p>
              </div>
              <div class="sim-flow-col sim-after">
                <span class="sim-tag sim-tag-kipus">La solución con KipusPay</span>
                <p>{simulation.kipusSolution}</p>
              </div>
            </div>

            <div class="sim-metrics-grid">
              {#each simulation.metrics as m}
                <div class="sim-metric-box">
                  <span class="sim-metric-label">{m.label}</span>
                  <div class="sim-metric-vals">
                    <span class="sim-val-before">Antes: {m.before}</span>
                    <span class="sim-val-arrow" aria-hidden="true">→</span>
                    <strong class="sim-val-after">{m.withKipus}</strong>
                  </div>
                  <span class="sim-metric-gain">{m.improvement}</span>
                </div>
              {/each}
            </div>

            <blockquote class="sim-quote">
              <p>“{simulation.ownerTakeaway}”</p>
              <cite>— Balance operativo de mostrador</cite>
            </blockquote>
          </div>
        {/if}

        {#if verticalCases.length > 0}
          <div class="vertical-cases-extra" use:reveal>
            <h3>Testimonios autorizados</h3>
            <ul class="case-list">
              {#each verticalCases as c (c.id)}
                <li data-testid="caso-item">
                  <p class="quote">“{c.quote}”</p>
                  <p class="who">{c.businessName} · {c.rubro}</p>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="entry" tone="ink" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Preguntas de tu rubro
          </p>
          <h2>Lo que preguntan antes de decidir.</h2>
        </div>
        <div class="faq">
          {#each landing.faq as item, i (item.q)}
            <details class="faq-item" use:reveal data-reveal-delay={i % 3}>
              <summary>
                <span class="num">{String(i + 1).padStart(2, '0')}</span>
                <span class="q">{item.q}</span>
              </summary>
              <div class="faq-content-wrap">
                <div class="faq-content-inner">
                  <p class="a">{item.a}</p>
                </div>
              </div>
            </details>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="section section-paper" use:reveal>
    <div class="section-inner">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Empezar
      </p>
      <p class="cta-brand">Tu rubro merece una caja que no se cae.</p>
      <div class="cta-row" style="margin-top: 1.6rem;">
        <a class="btn" href="/empezar">Probar gratis ahora</a>
        <a class="btn btn-ghost" href="/precios">Ver planes</a>
      </div>

      <nav class="cross-links" aria-label="Otros rubros">
        <p class="cross-title">Tu negocio es otro:</p>
        <ul>
          {#each others as other (other.slug)}
            <li>
              <a href="/para/{other.slug}">
                <span class="knot-dot" aria-hidden="true"></span>
                {other.navLabel}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  </section>

  <a class="btn btn-sticky" href="/empezar">Probar gratis ahora</a>
</article>
