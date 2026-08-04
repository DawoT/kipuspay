<script lang="ts">
  import '../app.css';
  import { allVerticals } from '$lib/content/verticals';
  import { COMPETITOR_SLUGS } from '$lib/content/compare';

  let { data, children } = $props();
  const verticals = allVerticals();
</script>

<svelte:head>
  <meta name="theme-color" content="#0e141b" />
</svelte:head>

{#if !data.siteEnabled}
  <main class="soft-off" data-testid="marketing-soft-off">
    <p class="brand">KipusPay</p>
    <h1>Sitio en preparacion</h1>
    <p>Activa PUBLIC_FEATURE_MARKETING_SITE=1 para previsualizar el sitio de marketing.</p>
  </main>
{:else}
  <header class="site-header">
    <a class="brand" href="/" data-testid="brand">KipusPay</a>
    <nav class="nav" aria-label="Principal">
      <details>
        <summary>Para tu negocio</summary>
        <div class="dropdown">
          {#each verticals as v}
            <a href={`/para/${v.slug}`}>{v.slug}</a>
          {/each}
        </div>
      </details>
      <a class="hide-sm" href="/precios">Precios</a>
      <a class="hide-sm" href="/seguridad">Seguridad</a>
      <a class="hide-sm" href="/casos-de-exito">Casos de exito</a>
      <a class="hide-sm" href="/comparar/bsale">Comparar</a>
      <a href="/empezar">Ingresar</a>
      <a class="btn" href="/empezar">Empieza gratis</a>
    </nav>
  </header>

  {@render children()}

  <footer class="site-footer">
    <div class="footer-grid">
      <div>
        <h3>Producto</h3>
        {#each verticals as v}
          <a href={`/para/${v.slug}`}>{v.slug}</a>
        {/each}
        <a href="/precios">Precios</a>
        <a href="/seguridad">Seguridad</a>
      </div>
      <div>
        <h3>Comparativas</h3>
        {#each COMPETITOR_SLUGS as c}
          <a href={`/comparar/${c}`}>vs {c}</a>
        {/each}
      </div>
      <div>
        <h3>Recursos</h3>
        <a href="/blog">Blog</a>
        <a href="/ayuda">Ayuda</a>
        <a href="/casos-de-exito">Casos de exito</a>
      </div>
      <div>
        <h3>Legal</h3>
        <a href="/seguridad">Privacidad y confianza</a>
        <a href="/empezar">Empezar</a>
      </div>
    </div>
  </footer>
{/if}
