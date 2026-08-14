<script lang="ts">
  import '../app.css';
  import { allVerticals } from '$lib/content/verticals';
  import { allCompares } from '$lib/content/compare';
  import { page } from '$app/stores';
  import { OFFICIAL_CHANNELS } from '$lib/content/legal';

  let { data, children } = $props();
  const verticals = allVerticals();
  const compares = allCompares();
  const pathname = $derived($page.url.pathname);
  const posOrigin = (import.meta.env.PUBLIC_POS_ORIGIN as string | undefined) ?? 'https://app.kipuspay.com';

  /** El header cambia de peso al despegarse del hero; sin librerias ni layout thrash. */
  let scrolled = $state(false);
  /** Marca que el hero (y su CTA) ya quedaron atras: habilita el CTA de pulgar. */
  let pastHero = $state(false);

  $effect(() => {
    const onScroll = () => {
      scrolled = window.scrollY > 8;
      pastHero = window.scrollY > window.innerHeight * 0.7;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  const orgLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KipusPay',
    url: 'https://kipuspay.com',
    logo: 'https://kipuspay.com/favicon.svg',
  });

  const siteLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'KipusPay',
    url: 'https://kipuspay.com',
  });
</script>

<svelte:head>
  <meta name="theme-color" content="#14161c" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link
    rel="preload"
    href="/fonts/fraunces-latin.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
  <link
    rel="preload"
    href="/fonts/schibsted-grotesk-latin.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
  <script type="application/ld+json">{@html orgLd}</script>
  <script type="application/ld+json">{@html siteLd}</script>
</svelte:head>

{#if !data.siteEnabled}
  <main class="soft-off" data-testid="marketing-soft-off">
    <p class="brand">KipusPay</p>
    <h1>Sitio en preparacion</h1>
    <p>Activa PUBLIC_FEATURE_MARKETING_SITE=1 para previsualizar el sitio de marketing.</p>
  </main>
{:else}
  <a class="skip-link" href="#contenido">Ir al contenido</a>

  <header
    class="site-header"
    class:scrolled
    class:past-hero={pastHero}
    data-testid="site-header"
  >
    <a class="brand" href="/" data-testid="brand">
      <span class="brand-knot" aria-hidden="true"></span>
      KipusPay
    </a>

    <nav class="nav nav-lg" aria-label="Principal">
      <details class="nav-drop">
        <summary>Para tu negocio</summary>
        <div class="dropdown">
          {#each verticals as v (v.slug)}
            <a
              href={`/para/${v.slug}`}
              data-cord={v.slug}
              aria-current={pathname === `/para/${v.slug}` ? 'page' : undefined}
            >
              <span class="knot-dot" aria-hidden="true"></span>
              {v.navLabel}
            </a>
          {/each}
        </div>
      </details>
      <a href="/precios" aria-current={pathname === '/precios' ? 'page' : undefined}>Precios</a>
      <a href="/seguridad" aria-current={pathname === '/seguridad' ? 'page' : undefined}>Seguridad</a>
      <a href="/casos-de-exito" aria-current={pathname === '/casos-de-exito' ? 'page' : undefined}>Casos de éxito</a>
      <a href="/comparar" aria-current={pathname.startsWith('/comparar') ? 'page' : undefined}>Comparar</a>
      <a class="nav-login" href="{posOrigin}/login">Ingresar</a>
      <a class="btn" href="/empezar">Empieza gratis</a>
    </nav>

    <details class="nav-sm">
      <summary aria-label="Abrir menu">
        <span class="burger" aria-hidden="true"></span>
        <span class="burger-label">Menu</span>
      </summary>
      <nav class="nav-sm-panel" aria-label="Principal movil">
        <p class="nav-sm-title">Para tu negocio</p>
        {#each verticals as v (v.slug)}
          <a
            href={`/para/${v.slug}`}
            data-cord={v.slug}
            aria-current={pathname === `/para/${v.slug}` ? 'page' : undefined}
          >
            <span class="knot-dot" aria-hidden="true"></span>
            {v.navLabel}
          </a>
        {/each}
        <p class="nav-sm-title">Sitio</p>
        <a href="/precios" aria-current={pathname === '/precios' ? 'page' : undefined}>Precios</a>
        <a href="/seguridad" aria-current={pathname === '/seguridad' ? 'page' : undefined}>Seguridad</a>
        <a href="/casos-de-exito" aria-current={pathname === '/casos-de-exito' ? 'page' : undefined}>Casos de éxito</a>
        <a href="/comparar" aria-current={pathname.startsWith('/comparar') ? 'page' : undefined}>Comparar</a>
        <a href="/ayuda" aria-current={pathname === '/ayuda' ? 'page' : undefined}>Ayuda</a>
        <a href="{posOrigin}/login">Ingresar</a>
        <a class="btn" href="/empezar">Empieza gratis</a>
      </nav>
    </details>
  </header>

  <main id="contenido">
    {@render children()}
  </main>

  <footer class="site-footer">
    <div class="footer-grid">
      <div>
        <h3>Para tu negocio</h3>
        {#each verticals as v (v.slug)}
          <a href={`/para/${v.slug}`}>{v.navLabel}</a>
        {/each}
      </div>
      <div>
        <h3>Comparativas</h3>
        {#each compares as c (c.slug)}
          <a href={`/comparar/${c.slug}`}>KipusPay vs {c.name}</a>
        {/each}
      </div>
      <div>
        <h3>Recursos</h3>
        <a href="/precios">Precios</a>
        <a href="/blog">Blog</a>
        <a href="/ayuda">Ayuda</a>
        <a href="/casos-de-exito">Casos de éxito</a>
      </div>
      <div>
        <h3>Legal</h3>
        <a href="/terminos">Términos del servicio</a>
        <a href="/privacidad">Privacidad y datos</a>
        <a href="/reclamaciones">Libro de Reclamaciones</a>
        <a href="/seguridad">Cumplimiento SUNAT</a>
      </div>
    </div>

    <p class="footer-channels">
      {OFFICIAL_CHANNELS.contacto} · {OFFICIAL_CHANNELS.soporte} · {OFFICIAL_CHANNELS.privacidad}
    </p>

    <ul class="footer-seals">
      <li>Tu informacion va cifrada</li>
      <li>Tus datos son tuyos</li>
      <li>Soporte en espanol</li>
      <li>Sin contratos largos</li>
    </ul>

    <p class="footer-legal">
      KipusPay — POS y facturacion electronica para comercios del Peru. La aceptacion de cada
      comprobante siempre depende de SUNAT.
    </p>
  </footer>
{/if}
