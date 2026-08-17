<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { allCompares, COMPARE_ROWS, compareDisclaimer, getCompare } from '$lib/content/compare';
  import { reveal } from '$lib/components/reveal';
  import MigrationTimeline from '$lib/components/MigrationTimeline.svelte';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';

  const compares = allCompares();

  const vsParam = $derived(browser ? ($page.url.searchParams.get('vs') ?? 'bsale') : 'bsale');
  const selected = $derived(getCompare(vsParam) ?? getCompare('bsale')!);

  const rows = $derived([...COMPARE_ROWS, ...selected.rows]);
</script>

<svelte:head>
  <title>KipusPay vs {selected.name} · Comparativas · KipusPay</title>
  <meta name="description" content={selected.metaDescription} />
  <meta property="og:title" content="KipusPay vs {selected.name} · KipusPay" />
  <meta property="og:description" content={selected.metaDescription} />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/comparar" />
</svelte:head>

<article data-testid="compare-page" data-slug={selected.slug}>
  <section class="hero hero-compact">
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Comparativa
        </p>
        <p class="brand-mark">KipusPay</p>
        <h1>{selected.title}</h1>
        <p class="hero-sub">{selected.hook}</p>
        <div class="hero-actions">
          <a class="btn" href="/empezar">Empieza gratis</a>
          <a class="btn btn-ghost" href="#tabla">Ver la tabla</a>
        </div>
      </div>
    </div>
  </section>

  <nav class="rubro-switch" aria-label="Elegir comparativa">
    <label class="rubro-switch-label" for="compare-select">Compara con</label>
    <select
      id="compare-select"
      class="rubro-select"
      value={selected.slug}
      onchange={(e) => {
        const el = e.currentTarget;
        if (el.value) window.location.assign(`/comparar?vs=${el.value}`);
      }}
    >
      {#each compares as c (c.slug)}
        <option value={c.slug}>{c.name}</option>
      {/each}
    </select>
    <ul class="rubro-links">
      {#each compares as c (c.slug)}
        <li>
          <a
            href={`/comparar?vs=${c.slug}`}
            class:active={c.slug === selected.slug}
            aria-current={c.slug === selected.slug ? 'page' : undefined}
          >
            <span class="knot-dot" aria-hidden="true"></span>
            {c.name}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <section class="section section-paper">
    <div class="section-frame">
      <div class="section-gutter" aria-hidden="true" use:reveal>
        <QuipuSectionMark state="entry" tone="paper" />
      </div>
      <div class="section-body">
        <p class="compare-intro lead" use:reveal>{selected.intro}</p>
        <div class="sec-head" use:reveal>
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Por que migran
          </p>
          <h2>Las tres razones que más escuchamos.</h2>
        </div>
        <div class="why-grid editorial-pains">
          {#each selected.whyMigrate as item, i (item.title)}
            <article use:reveal data-reveal-delay={i % 3}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          {/each}
        </div>

        <MigrationTimeline competitorName={selected.name} />
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
          <table class="ledger-table comparison-table" aria-label={selected.title}>
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Lo que nos cuentan de {selected.name}</th>
                <th scope="col">KipusPay</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as row (row.label)}
                <tr>
                  <th scope="row">{row.label}</th>
                  <td data-label={`Experiencia con ${selected.name}`}>{row.reported}</td>
                  <td class="kipus" data-label="KipusPay">{row.kipus}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="compare-note">{compareDisclaimer(selected.name)}</p>
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
        {#each selected.faq as item, i (item.q)}
          <details class="faq-item" use:reveal data-reveal-delay={i % 3}>
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
        <a class="btn btn-ghost" href="/precios">Ver planes</a>
      </div>
    </div>
  </section>
</article>
