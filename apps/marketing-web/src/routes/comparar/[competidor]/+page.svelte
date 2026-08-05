<script lang="ts">
  import { COMPARE_ROWS, compareDisclaimer } from '$lib/content/compare';
  import { absoluteUrl, ogImageFor, pageTitle } from '$lib/seo';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';

  let { data } = $props();

  const url = $derived(absoluteUrl(`/comparar/${data.page.slug}`));
  const rows = $derived([...COMPARE_ROWS, ...data.page.rows]);

  const breadcrumbLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KipusPay', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: data.page.title, item: url },
      ],
    }),
  );

  const faqLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.page.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }),
  );
</script>

<svelte:head>
  <title>{pageTitle(data.page.title)}</title>
  <meta name="description" content={data.page.metaDescription} />
  <meta property="og:title" content={data.page.title} />
  <meta property="og:description" content={data.page.metaDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={ogImageFor()} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <link rel="canonical" href={url} />
  <script type="application/ld+json">{@html breadcrumbLd}</script>
  <script type="application/ld+json">{@html faqLd}</script>
</svelte:head>

<article data-testid="compare-page" data-slug={data.page.slug}>
  <section class="hero hero-compact">
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Comparativa
        </p>
        <h1>{data.page.title}</h1>
        <p class="hero-sub">{data.page.hook}</p>
        <p class="compare-intro">{data.page.intro}</p>
        <div class="hero-actions">
          <a class="btn" href="/empezar">Empieza gratis</a>
          <a class="btn btn-ghost" href="#tabla">Ver la tabla</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-paper">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="entry" tone="paper" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Por que migran
          </p>
          <h2>Las tres razones que más escuchamos.</h2>
        </div>
        <div class="why-grid editorial-pains">
          {#each data.page.whyMigrate as item, i (item.title)}
            <article use:reveal data-reveal-delay={i % 3}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="tabla">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="synced" tone="ink" />
      </div>
      <div class="section-body">
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Lado a lado
          </p>
          <h2>El día a día de tu caja, fila por fila.</h2>
        </div>
        <div class="ledger-table-wrap comparison-table-wrap" use:reveal>
          <table class="ledger-table comparison-table" aria-label={data.page.title}>
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Lo que nos cuentan de {data.page.name}</th>
                <th scope="col">KipusPay</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as row (row.label)}
                <tr>
                  <th scope="row">{row.label}</th>
                  <td data-label={`Experiencia con ${data.page.name}`}>{row.reported}</td>
                  <td class="kipus" data-label="KipusPay">{row.kipus}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="compare-note">{compareDisclaimer(data.page.name)}</p>
      </div>
    </div>
  </section>

  <section class="section section-paper" use:reveal>
    <div class="section-inner">
      <div class="sec-head">
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Cambiarse
        </p>
        <h2>Lo que preguntan antes de mover la caja.</h2>
      </div>
      <div class="faq">
        {#each data.page.faq as item, i (item.q)}
          <details class="faq-item">
            <summary>
              <span class="num">{String(i + 1).padStart(2, '0')}</span>
              <span class="q">{item.q}</span>
            </summary>
            <p class="a">{item.a}</p>
          </details>
        {/each}
      </div>
      <div class="cta-row" style="margin-top: 2.4rem;">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/">Ver el sitio</a>
      </div>
    </div>
  </section>
</article>
