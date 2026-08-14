<script lang="ts">
  import { allHelpCategories, searchHelpItems } from '$lib/content/help';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
  import { OFFICIAL_CHANNELS } from '$lib/content/legal';

  const categories = allHelpCategories();
  let searchQuery = $state('');

  const filteredSearchResults = $derived(searchHelpItems(searchQuery));
  const isSearching = $derived(searchQuery.trim().length > 0);

  const allItems = categories.flatMap((c) => c.items);
  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  });
</script>

<svelte:head>
  <title>Centro de Ayuda · KipusPay</title>
  <meta
    name="description"
    content="Respuestas claras sobre facturacion SUNAT, impresoras, modo offline y cierre de caja."
  />
  <meta property="og:title" content="Centro de Ayuda · KipusPay" />
  <meta
    property="og:description"
    content="Guias y respuestas sobre tu punto de venta y comprobantes."
  />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/ayuda" />
  <script type="application/ld+json">{@html faqLd}</script>
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Soporte
      </p>
      <h1>¿En qué podemos ayudarte hoy?</h1>
      <p class="hero-sub">
        Respuestas directas sobre la operación de tu negocio, sin manuales complicados.
      </p>
      <div class="search-box">
        <label for="help-search" class="visually-hidden">Buscar en el centro de ayuda</label>
        <input
          id="help-search"
          type="search"
          placeholder="Busca por tema: impresora, SUNAT, offline, caja…"
          bind:value={searchQuery}
        />
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="ayuda-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      {#if isSearching}
        <div class="sec-head" use:reveal>
          <p class="eyebrow">Resultados de búsqueda</p>
          <h2>Resultados para "{searchQuery}"</h2>
        </div>
        {#if filteredSearchResults.length === 0}
          <p use:reveal>No encontramos preguntas que coincidan con tu búsqueda.</p>
        {:else}
          <div class="faq">
            {#each filteredSearchResults as item (item.id)}
              <details class="faq-item" open use:reveal>
                <summary>
                  <span class="q">{item.question}</span>
                </summary>
                <p class="a">{item.answer}</p>
              </details>
            {/each}
          </div>
        {/if}
      {:else}
        {#each categories as cat (cat.id)}
          <div class="help-category-group" id={cat.id}>
            <div class="sec-head" use:reveal>
              <p class="eyebrow">
                <span class="knot-dot" aria-hidden="true"></span>
                {cat.title}
              </p>
              <h2>{cat.description}</h2>
            </div>
            <div class="faq">
              {#each cat.items as item, i (item.id)}
                <details class="faq-item" use:reveal data-reveal-delay={i % 3}>
                  <summary>
                    <span class="num">{String(i + 1).padStart(2, '0')}</span>
                    <span class="q">{item.question}</span>
                  </summary>
                  <p class="a">{item.answer}</p>
                </details>
              {/each}
            </div>
          </div>
        {/each}
      {/if}

      <div class="help-contact-box" use:reveal>
        <h3>¿Necesitas asistencia directa?</h3>
        <p>Nuestro equipo de soporte atiende en español para acompañarte en tu configuración.</p>
        <div class="contact-channels">
          <a class="btn" href="mailto:{OFFICIAL_CHANNELS.soporte}">{OFFICIAL_CHANNELS.soporte}</a>
          <a class="btn btn-ghost" href="mailto:{OFFICIAL_CHANNELS.contacto}">{OFFICIAL_CHANNELS.contacto}</a>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .search-box {
    margin-top: 1.5rem;
  }
  .search-box input {
    width: 100%;
    max-width: 32rem;
    padding: 0.85rem 1.1rem;
    font-family: var(--font-body);
    font-size: 1rem;
    border: 1px solid var(--line);
    background: var(--ink-2);
    color: var(--paper);
    border-radius: var(--radius);
  }
  .search-box input:focus {
    outline: 2px solid var(--amber);
    border-color: var(--amber);
  }
  .help-category-group {
    margin-bottom: 4rem;
  }
  .contact-channels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .help-contact-box {
    margin-top: 4rem;
    padding: 2rem;
    background: rgba(26, 29, 35, 0.04);
    border-left: 3px solid var(--amber);
  }
  .help-contact-box h3 {
    font-size: 1.35rem;
    margin-bottom: 0.5rem;
  }
  .help-contact-box p {
    margin-bottom: 1.25rem;
    color: rgba(26, 29, 35, 0.8);
  }
</style>
