<script lang="ts">
  import { publishedCases } from '$lib/content/cases';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';

  const cases = publishedCases();
</script>

<svelte:head>
  <title>Casos de clientes · KipusPay</title>
  <meta
    name="description"
    content="Actualmente no hay casos de clientes publicados."
  />
  <meta property="og:title" content="Casos de clientes · KipusPay" />
  <meta property="og:description" content="Actualmente no hay casos de clientes publicados." />
  <meta property="og:image" content={ogImageFor()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Casos de clientes · KipusPay" />
  <meta
    name="twitter:description"
    content="Actualmente no hay casos de clientes publicados."
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
        Historias de clientes
      </p>
      <p class="brand-mark">KipusPay</p>
      <h1>Casos de clientes</h1>
      <p class="hero-sub">
        Esta sección publicará historias cuando existan autorización explícita y evidencia verificable para compartir.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="casos-publicados" data-testid="casos-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      {#if cases.length === 0}
        <div class="empty-cases-box" data-testid="casos-empty" use:reveal>
          <h3>Aún no hay casos publicados</h3>
          <p>
            Todavía no hay casos publicados con autorización explícita y resultados verificados. Esta sección se actualizará cuando contemos con evidencia y permiso para compartirla.
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

    </div>
  </div>
</section>

<style>
</style>
