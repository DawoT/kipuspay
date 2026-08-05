<script lang="ts">
  import { SECURITY_PAGE } from '$lib/content/security';
  import { ogImageFor } from '$lib/seo';
</script>

<svelte:head>
  <title>{SECURITY_PAGE.title} · KipusPay</title>
  <meta name="description" content={SECURITY_PAGE.lede} />
  <meta property="og:image" content={ogImageFor('home')} />
</svelte:head>

<section class="section section-paper" data-testid="seguridad-page">
  <div class="section-frame">
    <div class="section-body">
      <p class="eyebrow">Confianza</p>
      <p class="brand-mark">KipusPay</p>
      <h1>{SECURITY_PAGE.headline}</h1>
      <p class="section-lead">{SECURITY_PAGE.lede}</p>

      <ul class="pillar-list">
        {#each SECURITY_PAGE.pillars as p (p.id)}
          <li data-testid="security-pillar">
            <h2>{p.title}</h2>
            <p>{p.body}</p>
          </li>
        {/each}
      </ul>

      <aside class="disclaimers" data-testid="security-disclaimers">
        <h2>Lo que no afirmamos</h2>
        <ul>
          {#each SECURITY_PAGE.disclaimers as d (d)}
            <li>{d}</li>
          {/each}
        </ul>
      </aside>

      <div class="cta-row">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/precios">Ver planes</a>
      </div>
    </div>
  </div>
</section>
