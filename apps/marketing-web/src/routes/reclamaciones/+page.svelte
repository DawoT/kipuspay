<script lang="ts">
  import { OFFICIAL_CHANNELS, RECLAMATIONS_PAGE } from '$lib/content/legal';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
</script>

<svelte:head>
  <title>{RECLAMATIONS_PAGE.title} · KipusPay</title>
  <meta name="description" content={RECLAMATIONS_PAGE.lede} />
  <meta property="og:title" content="{RECLAMATIONS_PAGE.title} · KipusPay" />
  <meta property="og:description" content={RECLAMATIONS_PAGE.lede} />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/reclamaciones" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Consumidor
      </p>
      <h1>{RECLAMATIONS_PAGE.headline}</h1>
      <p class="hero-sub">{RECLAMATIONS_PAGE.lede}</p>
      <div class="hero-actions">
        <a class="btn" href="mailto:{OFFICIAL_CHANNELS.contacto}">Registrar reclamo</a>
        <a class="btn btn-ghost" href="#proceso">Ver proceso</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="proceso" data-testid="reclamaciones-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <ol class="flow-steps">
        {#each RECLAMATIONS_PAGE.steps as step, i (step.title)}
          <li use:reveal data-reveal-delay={i % 3}>
            <span class="step-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </li>
        {/each}
      </ol>
      <p class="channel-note">
        Canal oficial de reclamos: {OFFICIAL_CHANNELS.contacto}. Para soporte usa{' '}
        {OFFICIAL_CHANNELS.soporte}.
      </p>
    </div>
  </div>
</section>

<style>
  .flow-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .flow-steps li {
    display: flex;
    gap: 1.25rem;
    padding: 1.1rem 0;
    border-bottom: 1px solid var(--line);
  }

  .flow-steps li:first-child {
    padding-top: 0;
  }

  .flow-steps li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .step-num {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--amber-bright);
    padding-top: 0.25rem;
  }

  .flow-steps h2 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }

  .flow-steps p {
    color: var(--muted);
    line-height: 1.6;
    max-width: 40rem;
  }

  .channel-note {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.875rem;
  }
</style>
