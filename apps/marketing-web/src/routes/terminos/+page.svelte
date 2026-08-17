<script lang="ts">
  import { TERMS_PAGE } from '$lib/content/legal';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
</script>

<svelte:head>
  <title>{TERMS_PAGE.title} · KipusPay</title>
  <meta name="description" content={TERMS_PAGE.lede} />
  <meta property="og:title" content="{TERMS_PAGE.title} · KipusPay" />
  <meta property="og:description" content={TERMS_PAGE.lede} />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/terminos" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Legal
      </p>
      <p class="brand-mark">KipusPay</p>
      <h1>{TERMS_PAGE.headline}</h1>
      <p class="hero-sub">{TERMS_PAGE.lede}</p>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="terminos-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="paper" />
    </div>
    <div class="section-body">
      <div class="legal-list">
        {#each TERMS_PAGE.sections as section (section.id)}
          <article class="legal-item" use:reveal>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </article>
        {/each}
      </div>
      <p class="legal-note">
        KipusPay — POS y facturación electrónica para comercios del Perú. Última actualización:
        agosto de 2026.
      </p>
    </div>
  </div>
</section>

<style>
  .legal-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .legal-item h2 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .legal-item p {
    color: var(--muted);
    line-height: 1.6;
    max-width: 46rem;
  }

  .legal-note {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
