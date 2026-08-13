<script lang="ts">
  import { publishedCases } from '$lib/content/cases';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import SavingsCalculator from '$lib/components/SavingsCalculator.svelte';
  import { ogImageFor } from '$lib/seo';

  const cases = publishedCases();
</script>

<svelte:head>
  <title>Casos de éxito · KipusPay</title>
  <meta
    name="description"
    content="Historias reales de comercios que cobran con KipusPay, con permiso del dueño."
  />
  <meta property="og:title" content="Casos de éxito · KipusPay" />
  <meta property="og:image" content={ogImageFor('home')} />
  <link rel="canonical" href="https://kipuspay.pe/casos-de-exito" />
  {#if cases.length === 0}
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Casos de éxito
      </p>
      <h1>Historias con permiso, no marketing inventado.</h1>
      <p class="hero-sub">
        Solo publicamos testimonios cuando el negocio nos autoriza explícitamente.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/para/retail">Ver tu rubro</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="casos-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      {#if cases.length === 0}
        <div class="empty-cases-box" data-testid="casos-empty" use:reveal>
          <h3>Sin testimonios inflados</h3>
          <p>
            Todavía no hay casos publicados con autorización explícita. Preferimos esperar a métricas reales comprobadas antes de poner un logo en la vitrina.
          </p>
          <div class="cta-row" style="margin-top: 1.5rem;">
            <a class="btn" href="/empezar">Empieza gratis hoy</a>
            <a class="btn btn-ghost" href="/para/retail">Explorar soluciones por rubro</a>
          </div>
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

      <SavingsCalculator />
    </div>
  </div>
</section>
