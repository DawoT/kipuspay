<script lang="ts">
  import type { VerticalLanding } from '$lib/content/types';
  import { reveal } from '$lib/components/reveal';
  import ClaimFeature from './ClaimFeature.svelte';
  import QuipuHero from '$lib/brand/QuipuHero.svelte';
  import CheckoutMock from '$lib/brand/CheckoutMock.svelte';
  import LineIcon from '$lib/brand/LineIcon.svelte';
  import { otherVerticals } from '$lib/content/verticals';

  let { landing }: { landing: VerticalLanding } = $props();

  const others = $derived(otherVerticals(landing.slug));
</script>

<article
  data-testid="vertical-landing"
  data-slug={landing.slug}
  data-cord={landing.slug}
>
  <section class="hero">
    <QuipuHero activeCord={landing.slug} />
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {landing.navLabel}
        </p>
        <p class="brand-mark">KipusPay</p>
        <h1>{landing.hook}</h1>
        <p class="hero-sub">{landing.pain}</p>
        <div class="hero-actions">
          <a class="btn" href="/empezar">Empieza gratis</a>
          <a class="btn btn-ghost" href="#destacado">Ver detalle</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-paper">
    <div class="section-inner">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Lo que escuchamos en tu rubro
        </p>
        <h2>Si esto te suena, ya sabemos por que viniste.</h2>
      </div>
      <div class="pain-grid">
        {#each landing.pains as item, i (item.pain)}
          <article use:reveal data-reveal-delay={i % 3}>
            <span class="pain-icon" aria-hidden="true">
              <LineIcon name={item.icon} size={22} />
            </span>
            <p class="quote">“{item.pain}”</p>
            <p class="relief">{item.relief}</p>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <section class="section" id="destacado">
    <div class="section-inner">
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
  </section>

  <section class="section section-paper">
    <div class="section-inner product-grid">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Asi se ve en tu mostrador
        </p>
        <h2>La pantalla que usa tu equipo, no una demo de catalogo.</h2>
        <p class="section-lead">
          El producto arriba, el total grande y el boton de cobrar. Debajo, la costura que avisa que
          la venta ya quedo guardada.
        </p>
      </div>
      <div class="product-screen" use:reveal>
        <CheckoutMock
          lines={landing.checkout.lines}
          documentLabel={landing.checkout.documentLabel}
          register={landing.checkout.register}
          syncState={landing.checkout.syncState}
          caption={landing.checkout.caption}
        />
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-inner">
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
            <p class="a">{item.a}</p>
          </details>
        {/each}
      </div>
    </div>
  </section>

  <section class="section section-paper">
    <div class="section-inner" use:reveal>
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Empezar
      </p>
      <p class="cta-brand">Tu rubro merece una caja que no se cae.</p>
      <div class="cta-row" style="margin-top: 1.6rem;">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/">Ver el sitio</a>
      </div>

      <nav class="cross-links" aria-label="Otros rubros">
        <p class="cross-title">Tu negocio es otro:</p>
        <ul>
          {#each others as other (other.slug)}
            <li>
              <a href="/para/{other.slug}" data-cord={other.slug}>
                <span class="knot-dot" aria-hidden="true"></span>
                {other.navLabel}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  </section>

  <a class="btn btn-sticky" href="/empezar">Empieza gratis</a>
</article>
