<script lang="ts">
  import { allCompares, compareDisclaimer } from '$lib/content/compare';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';

  const compares = allCompares();
</script>

<svelte:head>
  <title>Comparativas · KipusPay</title>
  <meta name="description" content="KipusPay frente a los sistemas que ya conoces: la diferencia en el día a día de tu caja." />
  <meta property="og:title" content="Comparativas · KipusPay" />
  <meta property="og:description" content="Vende aunque se corte el internet: compara KipusPay con los sistemas que ya conoces." />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/comparar" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Comparativas
      </p>
      <h1>Elige con la caja abierta.</h1>
      <p class="hero-sub">
        Tres comparaciones directas contra los sistemas que más se usan en la región. Cada una
        cuenta lo que importa en el mostrador.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#tabla">Ver comparativas</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="tabla" data-testid="compare-index">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <ul class="compare-list">
        {#each compares as c, i (c.slug)}
          <li use:reveal data-reveal-delay={i % 3}>
            <a href={`/comparar/${c.slug}`} class="compare-row" data-testid="compare-link">
              <div class="compare-main">
                <p class="eyebrow">
                  <span class="knot-dot" aria-hidden="true"></span>
                  KipusPay vs {c.name}
                </p>
                <h3>{c.hook}</h3>
                <p>{c.intro}</p>
              </div>
              <span class="compare-arrow">Ver comparativa →</span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="compare-note" data-testid="compare-disclaimer">
        {compareDisclaimer(compares[0]?.name ?? 'los sistemas comparados')}
      </p>
    </div>
  </div>
</section>

<style>
  .compare-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .compare-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    padding: 1.75rem;
    background: var(--ink-2);
    color: var(--paper);
    border: 1px solid var(--line);
    text-decoration: none;
    transition: border-color 0.2s ease;
  }

  .compare-row:hover {
    border-color: var(--amber);
  }

  .compare-main h3 {
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 700;
    margin: 0.5rem 0 0.6rem;
  }

  .compare-main p:not(.eyebrow) {
    color: rgba(243, 239, 230, 0.78);
    line-height: 1.6;
    max-width: 40rem;
  }

  .compare-arrow {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--amber-bright);
    white-space: nowrap;
    padding-top: 0.3rem;
  }

  .compare-note {
    margin-top: 2rem;
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.55;
  }
</style>
