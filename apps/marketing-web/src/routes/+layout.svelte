<script lang="ts">
  import '../app.css';
  import { allVerticals } from '$lib/content/verticals';
  import { allCompares } from '$lib/content/compare';
  import { page } from '$app/stores';
  import { OFFICIAL_CHANNELS } from '$lib/content/legal';
  import { env as publicEnv } from '$env/dynamic/public';

  let { data, children } = $props();
  const verticals = allVerticals();
  const compares = allCompares();
  const pathname = $derived($page.url.pathname);
  const posOrigin = publicEnv.PUBLIC_POS_ORIGIN ?? 'https://app.kipuspay.com';

  /** El header cambia de peso al despegarse del hero; sin librerias ni layout thrash. */
  let scrolled = $state(false);
  /** Marca que el hero (y su CTA) ya quedaron atras: habilita el CTA de pulgar. */
  let pastHero = $state(false);
  /** Estado del drawer de navegación móvil accesible. */
  let mobileMenuOpen = $state(false);

  function openMobileMenu() {
    mobileMenuOpen = true;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  // Cierre automático al navegar
  $effect(() => {
    if (pathname) {
      mobileMenuOpen = false;
    }
  });

  // Cierre con tecla Escape y bloqueo de scroll cuando el drawer está activo
  $effect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  });

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
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="KipusPay" />
  <meta
    name="twitter:description"
    content="POS y facturación electrónica para comercios del Perú"
  />
  <meta name="twitter:image" content="https://kipuspay.com/media/og-kipuspay.png" />
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
  <!-- Svelte 5 no evalúa expresiones dentro de <script>: el JSON-LD se inyecta
       envolviendo el elemento completo ({@html}); orgLd/siteLd ya son JSON string. -->
  {@html `<script type="application/ld+json">${orgLd}</script>`}
  {@html `<script type="application/ld+json">${siteLd}</script>`}
</svelte:head>

{#if !data.siteEnabled}
  <main class="soft-off" data-testid="marketing-soft-off">
    <p class="brand">KipusPay</p>
    <h1>Sitio en preparación</h1>
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

    <div class="nav-sm">
      <button
        type="button"
        class="nav-sm-toggle"
        aria-expanded={mobileMenuOpen}
        aria-controls="mobile-drawer"
        aria-label="Abrir menú de navegación"
        onclick={() => {
          if (mobileMenuOpen) {
            closeMobileMenu();
          } else {
            openMobileMenu();
          }
        }}
        data-testid="mobile-menu-toggle"
      >
        <span class="burger" aria-hidden="true"></span>
        <span class="burger-label">Menú</span>
      </button>
    </div>
  </header>

  {#if mobileMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mobile-backdrop"
      onclick={closeMobileMenu}
      aria-hidden="true"
      data-testid="mobile-backdrop"
    ></div>

    <div
      id="mobile-drawer"
      class="mobile-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Menú de navegación"
      data-testid="mobile-drawer"
    >
      <div class="drawer-header">
        <a class="brand" href="/" onclick={closeMobileMenu}>
          <span class="brand-knot" aria-hidden="true"></span>
          KipusPay
        </a>
        <button
          type="button"
          class="drawer-close"
          aria-label="Cerrar menú"
          onclick={closeMobileMenu}
          data-testid="drawer-close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <nav class="drawer-nav" aria-label="Principal móvil">
        <p class="drawer-section-title">Para tu negocio</p>
        {#each verticals as v (v.slug)}
          <a
            href={`/para/${v.slug}`}
            data-cord={v.slug}
            aria-current={pathname === `/para/${v.slug}` ? 'page' : undefined}
            onclick={closeMobileMenu}
          >
            <span class="knot-dot" aria-hidden="true"></span>
            {v.navLabel}
          </a>
        {/each}
        <p class="drawer-section-title">Sitio</p>
        <a href="/precios" aria-current={pathname === '/precios' ? 'page' : undefined} onclick={closeMobileMenu}>
          Precios
        </a>
        <a href="/seguridad" aria-current={pathname === '/seguridad' ? 'page' : undefined} onclick={closeMobileMenu}>
          Seguridad
        </a>
        <a href="/casos-de-exito" aria-current={pathname === '/casos-de-exito' ? 'page' : undefined} onclick={closeMobileMenu}>
          Casos de éxito
        </a>
        <a href="/comparar" aria-current={pathname.startsWith('/comparar') ? 'page' : undefined} onclick={closeMobileMenu}>
          Comparar
        </a>
        <a href="/ayuda" aria-current={pathname === '/ayuda' ? 'page' : undefined} onclick={closeMobileMenu}>
          Ayuda
        </a>
        <a href="{posOrigin}/login" onclick={closeMobileMenu}>
          Ingresar
        </a>
        <a class="btn" href="/empezar" onclick={closeMobileMenu}>
          Empieza gratis
        </a>
      </nav>
    </div>
  {/if}

  <main id="contenido">
    {@render children()}
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
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
            <a href={`/comparar?vs=${c.slug}`}>KipusPay vs {c.name}</a>
          {/each}
        </div>
        <div>
          <h3>Recursos</h3>
          <a href="/precios">Precios</a>
          <a href="/blog">Blog</a>
          <a href="/ayuda">Ayuda</a>
          <a href="/casos-de-exito">Casos de éxito</a>
          <a href="/empezar">Empezar gratis</a>
        </div>
        <div>
          <h3>Legal y Acceso</h3>
          <a href="/terminos">Términos del servicio</a>
          <a href="/privacidad">Privacidad y datos</a>
          <a href="/reclamaciones">Libro de Reclamaciones</a>
          <a href="/seguridad">Cumplimiento SUNAT</a>
          <a href="{posOrigin}/login">Ingresar al sistema</a>
        </div>
      </div>

      <p class="footer-channels">
        <a href="mailto:{OFFICIAL_CHANNELS.contacto}">{OFFICIAL_CHANNELS.contacto}</a> ·{' '}
        <a href="mailto:{OFFICIAL_CHANNELS.soporte}">{OFFICIAL_CHANNELS.soporte}</a> ·{' '}
        <a href="mailto:{OFFICIAL_CHANNELS.facturacion}">{OFFICIAL_CHANNELS.facturacion}</a> ·{' '}
        <a href="mailto:{OFFICIAL_CHANNELS.privacidad}">{OFFICIAL_CHANNELS.privacidad}</a>
      </p>

      <ul class="footer-seals">
        <li>Tu información va cifrada</li>
        <li>Tus datos son tuyos</li>
        <li>Soporte en español</li>
        <li>Sin contratos largos</li>
      </ul>

      <p class="footer-legal">
        KipusPay — POS y facturación electrónica para comercios del Perú. La aceptación de cada
        comprobante siempre depende de SUNAT.
      </p>
    </div>
  </footer>
{/if}
