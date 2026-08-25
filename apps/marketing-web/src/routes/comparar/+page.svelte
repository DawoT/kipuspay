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

  /* ── Sprint 11C: Filtro por categoría de negocio ──────────────────── */

  interface CategoryTab {
    readonly id: string;
    readonly label: string;
    /** Filas relevantes para este tipo de negocio (undefined = todas). */
    readonly highlightLabels?: readonly string[];
  }

  const CATEGORY_TABS: readonly CategoryTab[] = [
    { id: 'todos', label: 'Todos' },
    {
      id: 'restaurante',
      label: 'Restaurante',
      highlightLabels: ['Si se corta el internet', 'Implementacion', 'Empezar a usarlo'],
    },
    {
      id: 'tienda',
      label: 'Tienda',
      highlightLabels: ['Si se corta el internet', 'Costo mensual', 'Equipo necesario'],
    },
    {
      id: 'servicios',
      label: 'Servicios',
      highlightLabels: ['Implementacion', 'Costo mensual', 'Soporte'],
    },
  ] as const;

  let activeCategory = $state<string>('todos');

  const filteredRows = $derived(
    activeCategory === 'todos'
      ? rows
      : rows.filter((r) => {
          const tab = CATEGORY_TABS.find((t) => t.id === activeCategory);
          return tab?.highlightLabels?.includes(r.label) ?? true;
        }),
  );
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

        <!-- Sprint 11C: Selector de categoría de negocio -->
        <div
          class="compare-tabs"
          role="tablist"
          aria-label="Filtrar comparativa por tipo de negocio"
        >
          {#each CATEGORY_TABS as tab}
            <button
              class="compare-tab"
              class:is-active={activeCategory === tab.id}
              role="tab"
              aria-selected={activeCategory === tab.id}
              data-testid="compare-tab-{tab.id}"
              onclick={() => (activeCategory = tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <div class="ledger-table-wrap comparison-table-wrap" use:reveal>
          {#if filteredRows.length > 0}
            <table class="ledger-table comparison-table" aria-label={selected.title}>
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Lo que nos cuentan de {selected.name}</th>
                  <th scope="col">KipusPay</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredRows as row (row.label)}
                  <tr>
                    <th scope="row">{row.label}</th>
                    <td data-label={`Experiencia con ${selected.name}`}>{row.reported}</td>
                    <td class="kipus" data-label="KipusPay">{row.kipus}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="compare-empty">
              No hay filas específicas para este tipo de negocio en la comparativa actual.
            </p>
          {/if}
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

<style>
  /* ── Sprint 11C: Compare category tabs ─────────────────────────────── */

  .compare-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .compare-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0.55rem 1.1rem;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--paper);
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }

  .compare-tab:hover,
  .compare-tab:focus-visible {
    border-color: var(--amber);
    color: var(--amber-bright);
    background: rgba(217, 154, 61, 0.08);
  }

  .compare-tab.is-active,
  .compare-tab[aria-selected='true'] {
    background: var(--amber);
    border-color: var(--amber);
    color: var(--ink);
  }

  @media (prefers-reduced-motion: reduce) {
    .compare-tab {
      transition: none;
    }
  }

  .compare-empty {
    padding: 2rem;
    text-align: center;
    color: rgba(243, 239, 230, 0.65);
    font-size: 0.9375rem;
    border: 1px dashed var(--line);
  }
</style>
