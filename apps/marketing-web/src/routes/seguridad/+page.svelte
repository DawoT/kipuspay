<script lang="ts">
  import { SECURITY_PAGE } from '$lib/content/security';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
</script>

<svelte:head>
  <title>{SECURITY_PAGE.title} · KipusPay</title>
  <meta name="description" content={SECURITY_PAGE.lede} />
  <meta property="og:title" content="{SECURITY_PAGE.title} · KipusPay" />
  <meta property="og:description" content={SECURITY_PAGE.lede} />
  <meta property="og:image" content={ogImageFor('home')} />
  <link rel="canonical" href="https://kipuspay.pe/seguridad" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Confianza y Seguridad
      </p>
      <h1>{SECURITY_PAGE.headline}</h1>
      <p class="hero-sub">{SECURITY_PAGE.lede}</p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#pilares">Ver pilares</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="pilares" data-testid="seguridad-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Pilares fundamentales
        </p>
        <h2>Tus datos, tu caja y tu tranquilidad.</h2>
        <p class="section-lead">Diseñado desde la arquitectura para responder cuando más importa.</p>
      </div>

      <div class="pillar-grid">
        {#each SECURITY_PAGE.pillars as p, i (p.id)}
          <article class="pillar-card" data-testid="security-pillar" use:reveal data-reveal-delay={i % 3}>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </article>
        {/each}
      </div>

      <aside class="disclaimers-box" data-testid="security-disclaimers" use:reveal>
        <h3>Transparencia: Lo que no afirmamos</h3>
        <ul>
          {#each SECURITY_PAGE.disclaimers as d (d)}
            <li>
              <span class="knot-dot" aria-hidden="true"></span>
              {d}
            </li>
          {/each}
        </ul>
      </aside>

      <div class="cta-row" style="margin-top: 3rem;" use:reveal>
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/precios">Ver planes</a>
      </div>
    </div>
  </div>
</section>
