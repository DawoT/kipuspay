<script lang="ts">
  import type { VerticalLanding } from '$lib/content/types';
  import ClaimFeature from './ClaimFeature.svelte';

  let { landing }: { landing: VerticalLanding } = $props();
</script>

<article data-testid="vertical-landing" data-slug={landing.slug}>
  <section class="hero">
    <div class="hero-media">
      <img src={landing.heroPoster} alt="" width="1920" height="1080" fetchpriority="high" />
    </div>
    <div class="hero-copy">
      <p class="brand-mark">KipusPay</p>
      <h1>{landing.hook}</h1>
      <p>{landing.pain}</p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#destacado">Ver detalle</a>
      </div>
    </div>
  </section>

  <section class="section" id="destacado">
    <h2>{landing.title}</h2>
    <p>El dolor que lidera esta pagina es el de tu rubro — no una lista generica de funciones.</p>
    <ClaimFeature claimId={landing.featuredClaimId} />
    {#if landing.secondaryClaimId}
      <ClaimFeature claimId={landing.secondaryClaimId} />
    {/if}
  </section>

  <a class="btn btn-sticky" href="/empezar">Empieza gratis</a>
</article>
