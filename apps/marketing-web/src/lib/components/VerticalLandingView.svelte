<script lang="ts">
  import type { VerticalLanding } from '$lib/content/types';
  import { reveal } from '$lib/components/reveal';
  import ClaimFeature from './ClaimFeature.svelte';
  import QuipuHero from '$lib/brand/QuipuHero.svelte';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import CheckoutMock from '$lib/brand/CheckoutMock.svelte';
  import { allVerticals, otherVerticals } from '$lib/content/verticals';
  import { casesForRubro } from '$lib/content/cases';

  let { landing }: { landing: VerticalLanding } = $props();

  const allV = allVerticals();
  const others = $derived(otherVerticals(landing.slug));
  const verticalCases = $derived(casesForRubro(landing.slug));
</script>

<article
  data-testid="vertical-landing"
  data-slug={landing.slug}
  data-cord={landing.slug}
>
  <section class="hero">
    <QuipuHero videoSrc="/media/hero-quipu.mp4" poster={landing.heroPoster} />
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

  <nav class="vertical-pills-bar" aria-label="Seleccionar rubro">
    <div class="pills-inner">
      <span class="pills-label">Cambiar rubro:</span>
      {#each allV as v (v.slug)}
        <a
          href="/para/{v.slug}"
          class="vertical-pill"
          class:active={v.slug === landing.slug}
        >
          <span class="knot-dot" aria-hidden="true"></span>
          {v.navLabel}
        </a>
      {/each}
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
            Lo que escuchamos en tu rubro
          </p>
          <h2>Si esto te suena, ya sabemos por qué viniste.</h2>
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
          <CheckoutMock
            lines={landing.checkout.lines}
            documentLabel={landing.checkout.documentLabel}
            register={landing.checkout.register}
            syncState={landing.checkout.syncState}
            caption={landing.checkout.caption}
          />
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
            Casos de tu rubro
          </p>
          <h2>Solo historias con permiso del dueño.</h2>
        </div>
        {#if verticalCases.length === 0}
          <p use:reveal>
            Aún no hay casos publicados para este rubro.
            <a href="/casos-de-exito">Ver el índice de casos</a>
            o
            <a href="/empezar">sé el primero en cobrar hoy</a>.
          </p>
        {:else}
          <ul>
            {#each verticalCases as c (c.id)}
              <li use:reveal>
                <p>“{c.quote}”</p>
                <p>{c.businessName}</p>
              </li>
            {/each}
          </ul>
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
              <p class="a">{item.a}</p>
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
        <a class="btn" href="/empezar">Empieza gratis</a>
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

  <a class="btn btn-sticky" href="/empezar">Empieza gratis</a>
</article>

<style>
  .vertical-pills-bar {
    background: var(--ink-2);
    border-bottom: 1px solid var(--line);
    padding: 0.75rem 1.5rem;
  }
  .pills-inner {
    max-width: 72rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    overflow-x: auto;
    white-space: nowrap;
    padding-bottom: 0.2rem;
  }
  .pills-label {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--muted);
    letter-spacing: 0.08em;
    margin-right: 0.4rem;
  }
  .vertical-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.85rem;
    font-size: 0.85rem;
    color: rgba(243, 239, 230, 0.8);
    border: 1px solid transparent;
    text-decoration: none;
    transition: all 0.2s ease;
  }
  .vertical-pill:hover {
    color: var(--amber-bright);
    background: rgba(243, 239, 230, 0.04);
  }
  .vertical-pill.active {
    background: var(--paper);
    color: var(--ink);
    border-color: var(--amber);
    font-weight: 700;
  }
  .vertical-pill.active .knot-dot {
    background: var(--ink);
  }
</style>
