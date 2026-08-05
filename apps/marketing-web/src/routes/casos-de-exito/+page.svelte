<script lang="ts">
  import { publishedCases } from '$lib/content/cases';
  import { ogImageFor } from '$lib/seo';

  const cases = publishedCases();
</script>

<svelte:head>
  <title>Casos de exito · KipusPay</title>
  <meta
    name="description"
    content="Historias reales de comercios que cobran con KipusPay, con permiso del dueno."
  />
  <meta property="og:image" content={ogImageFor('home')} />
  {#if cases.length === 0}
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

<section class="section section-paper" data-testid="casos-page">
  <div class="section-frame">
    <div class="section-body">
      <p class="eyebrow">Casos de exito</p>
      <h1>Historias con permiso, no marketing inventado.</h1>
      <p class="section-lead">
        Solo publicamos testimonios cuando el negocio nos autoriza (GTM-12). Si aun no hay casos
        publicados, te mostramos el camino para empezar.
      </p>

      {#if cases.length === 0}
        <p data-testid="casos-empty">
          Todavia no hay casos publicados con permiso. Preferimos esperar a numeros reales antes de
          poner un nombre en la vitrina.
        </p>
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="/para/retail">Ver tu rubro</a>
      {:else}
        <ul class="case-list">
          {#each cases as c (c.id)}
            <li data-testid="caso-item">
              <p class="quote">“{c.quote}”</p>
              <p class="who">{c.businessName} · {c.rubro}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</section>
