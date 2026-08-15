<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { fade } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { onMount, type ComponentProps } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    provideAdminAuthenticatedSessionState,
    type AdminAuthenticatedSession,
  } from '$lib/admin/authenticated-session';
  import { loadAuthenticatedAppShellSession } from '$lib/admin/app-shell-session';
  import { billingNoticeText } from '$lib/admin/billing-notice';
  import { installUnauthorizedGuard } from '$lib/auth/unauthorized-guard';
  import { claimOnboardingFromUrlIfPresent } from '$lib/auth/onboarding-claim';
  import {
    showCashOperatingNavigation,
    showCustomerOrderNavigation,
  } from '$lib/customer-orders/customer-order-access';
  import {
    isCustomerOrdersEnabled,
    isLpdpEnabled,
    isMobilePosEnabled,
    isMobilePushEnabled,
    isRecurringSalesEnabled,
    isTeamInviteEnabled,
  } from '$lib/features';
  import { registerUnifiedPosServiceWorker } from '$lib/mobile/mobile-push-pwa';
  import { applyThemeToDocument, readDocumentTheme } from '$lib/ui/theme';
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';
  import { breadcrumbLabel } from '$lib/ui/breadcrumb';
  import {
    chromeShowsSidebar,
    chromeShowsSkipLink,
    chromeShowsTopBar,
    resolveChromeMode,
  } from '$lib/ui/chrome';
  import { stitchClass, stitchStateFromFlags } from '$lib/ui/sync-stitch';

  let { children } = $props();
  let authenticatedSession = $state<AdminAuthenticatedSession | null>(null);
  let sessionLoaded = $state(false);
  const authenticatedSessionState = {
    get current() {
      return authenticatedSession;
    },
  };
  provideAdminAuthenticatedSessionState(authenticatedSessionState);

  type IconName = ComponentProps<typeof Icon>['name'];

  // Sidebar state — en móvil nace cerrado (hamburger en top-bar).
  let sidebarOpen = $state(true);
  let isNarrow = $state(false);
  let expandedGroups = $state<Record<string, boolean>>({
    terminal: true,
    admin: true,
    inventario: false,
    proveedores: false,
    owner: false,
    especiales: false,
  });

  function toggleGroup(group: string) {
    expandedGroups = { ...expandedGroups, [group]: !expandedGroups[group] };
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  type NavItem = { href: string; label: string; icon: IconName; featureGated?: boolean };
  type NavGroup = {
    id: string;
    label: string;
    icon: IconName;
    items: NavItem[];
    alwaysVisible?: boolean;
  };

  const navGroups = $derived<NavGroup[]>([
    {
      id: 'inicio',
      label: 'Inicio',
      icon: 'home',
      alwaysVisible: true,
      items: [
        { href: '/owner', label: 'Resumen del día', icon: 'home' as IconName },
      ],
    },
    {
      id: 'terminal',
      label: 'Ventas',
      icon: 'cart',
      alwaysVisible: true,
      items: [
        ...(showCashOperatingNavigation(authenticatedSession?.role ?? '')
          ? [
              { href: '/', label: 'POS Terminal', icon: 'cart' as IconName },
              { href: '/caja/historial', label: 'Historial del día', icon: 'receipt' as IconName },
              { href: '/caja', label: 'Cierre Z', icon: 'receipt' as IconName },
              { href: '/caja/cobro', label: 'Cobro local', icon: 'credit-card' as IconName },
              { href: '/caja/devolucion', label: 'Devolución', icon: 'rotate-ccw' as IconName },
              { href: '/caja/cotizacion', label: 'Cotizaciones', icon: 'file-text' as IconName },
              { href: '/caja/apartado', label: 'Apartados', icon: 'clock' as IconName },
              { href: '/caja/cuotas', label: 'Cuotas', icon: 'calendar' as IconName },
              { href: '/caja/gastos', label: 'Gastos de caja', icon: 'dollar' as IconName },
            ]
          : []),
        ...(showCustomerOrderNavigation({ enabled: isCustomerOrdersEnabled(), role: authenticatedSession?.role ?? '' })
          ? [{ href: '/orders/customer', label: 'Pedidos retiro', icon: 'package' as IconName }]
          : []),
      ],
    },
    {
      id: 'admin',
      label: 'Catálogo',
      icon: 'layers',
      alwaysVisible: true,
      items: [
        { href: '/admin/catalogo', label: 'Catálogo', icon: 'layers' as IconName },
        { href: '/admin/etiquetas', label: 'Etiquetas', icon: 'tag' as IconName },
        { href: '/admin/series', label: 'Series', icon: 'barcode' as IconName },
        { href: '/admin/comisiones', label: 'Comisiones', icon: 'percent' as IconName },
        { href: '/admin/promociones', label: 'Promociones', icon: 'gift' as IconName },
        { href: '/admin/credito-tienda', label: 'Crédito tienda', icon: 'dollar' as IconName },
        ...(isRecurringSalesEnabled() && ['owner', 'admin'].includes(authenticatedSession?.role?.toLowerCase() ?? '')
          ? [{ href: '/admin/membresias', label: 'Membresías', icon: 'star' as IconName }]
          : []),
        ...(isLpdpEnabled() && ['owner', 'admin', 'supervisor'].includes(authenticatedSession?.role?.toLowerCase() ?? '')
          ? [{ href: '/admin/clientes', label: 'Clientes', icon: 'user' as IconName }]
          : []),
      ],
    },
    {
      id: 'inventario',
      label: 'Inventario',
      icon: 'box',
      alwaysVisible: true,
      items: [
        { href: '/admin/inventario', label: 'Inventario', icon: 'box' as IconName },
        { href: '/admin/ubicaciones', label: 'Ubicaciones', icon: 'map-pin' as IconName },
        { href: '/admin/transferencias', label: 'Transferencias', icon: 'truck' as IconName },
      ],
    },
    {
      id: 'proveedores',
      label: 'Proveedores',
      icon: 'clipboard',
      alwaysVisible: true,
      items: [
        { href: '/admin/oc-recepcion', label: 'Recepción OC', icon: 'clipboard-check' as IconName },
        { href: '/admin/factura-proveedor', label: 'Conciliar factura', icon: 'file-text' as IconName },
        { href: '/admin/devolucion-proveedor', label: 'Dev. proveedor', icon: 'arrow-left' as IconName },
      ],
    },
    {
      id: 'owner',
      label: 'Modo Dueño',
      icon: 'shield',
      alwaysVisible: true,
      items: [
        { href: '/owner', label: 'Modo Dueño', icon: 'home' as IconName },
      ],
    },
    {
      id: 'reportes',
      label: 'Reportes',
      icon: 'bar-chart',
      alwaysVisible: true,
      items: [
        { href: '/admin/diario', label: 'Diario', icon: 'file-text' as IconName },
        { href: '/admin/backups', label: 'Backups', icon: 'database' as IconName },
      ],
    },
    {
      id: 'configuracion',
      label: 'Configuración',
      icon: 'settings',
      alwaysVisible: true,
      items: [
        { href: '/admin/configuracion', label: 'Configuración', icon: 'settings' as IconName },
        { href: '/admin/integraciones', label: 'Integraciones', icon: 'link' as IconName },
        ...(isTeamInviteEnabled() && ['owner', 'admin', 'supervisor'].includes(authenticatedSession?.role?.toLowerCase() ?? '')
          ? [{ href: '/admin/equipo', label: 'Equipo', icon: 'user' as IconName }]
          : []),
      ],
    },
    {
      id: 'especiales',
      label: 'Modos especiales',
      icon: 'grid',
      alwaysVisible: true,
      items: [
        { href: '/salon', label: 'Salón', icon: 'utensils' as IconName },
        { href: '/kds', label: 'Cocina', icon: 'chef-hat' as IconName },
        { href: '/kiosk', label: 'Kiosko', icon: 'monitor' as IconName },
        { href: '/vitrina', label: 'Vitrina', icon: 'eye' as IconName },
        ...(isMobilePosEnabled() || isMobilePushEnabled()
          ? [{ href: '/mobile', label: 'Dispositivo Móvil', icon: 'smartphone' as IconName }]
          : []),
      ],
    },
  ]);

  function isActive(href: string) {
    const path = page.url.pathname;
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
  }

  function isGroupActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href));
  }

  let currentTheme = $state<'dark' | 'light'>('dark');
  let online = $state(true);

  const chromeMode = $derived(
    resolveChromeMode({
      pathname: page.url.pathname,
      role: authenticatedSession?.role ?? '',
    }),
  );
  const showSidebar = $derived(chromeShowsSidebar(chromeMode));
  const showTopBar = $derived(chromeShowsTopBar(chromeMode));
  const showSkipLink = $derived(chromeShowsSkipLink(chromeMode));
  const pageCrumb = $derived(breadcrumbLabel(page.url.pathname));
  const connectionStitch = $derived(
    stitchClass(stitchStateFromFlags({ online, pendingCount: 0, charging: false })),
  );

  function syncOnlineStatus() {
    online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  function applyTheme(theme: 'dark' | 'light') {
    currentTheme = theme;
    applyThemeToDocument(theme, localStorage);
  }

  function toggleTheme(e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  onMount(async () => {
    syncOnlineStatus();
    window.addEventListener('online', syncOnlineStatus);
    window.addEventListener('offline', syncOnlineStatus);

    if (typeof document !== 'undefined') {
      currentTheme = readDocumentTheme();
      applyThemeToDocument(currentTheme);

      const narrow = window.matchMedia('(max-width: 768px)');
      const syncNarrow = () => {
        isNarrow = narrow.matches;
        if (narrow.matches) sidebarOpen = false;
      };
      syncNarrow();
      narrow.addEventListener('change', syncNarrow);

      for (const group of navGroups) {
        if (isGroupActive(group)) {
          expandedGroups = { ...expandedGroups, [group.id]: true };
        }
      }
    }

    if (isMobilePosEnabled() || isMobilePushEnabled()) {
      try {
        await registerUnifiedPosServiceWorker();
      } catch {
        // SW/install/push is optional; authenticated checkout must continue.
      }
    }

    // F5: 401 del worker → /login (JWT de cajero expirado, sesión IdP caída).
    if (typeof window !== 'undefined' && !(window as unknown as { __kipusUnauthGuard?: boolean }).__kipusUnauthGuard) {
      (window as unknown as { __kipusUnauthGuard?: boolean }).__kipusUnauthGuard = true;
      const guarded = installUnauthorizedGuard({ fetcher: fetch });
      (window as unknown as { __kipusGuardedFetch?: typeof fetch }).__kipusGuardedFetch = guarded;
      (globalThis as unknown as { fetch?: typeof fetch }).fetch = guarded;
    }

    // M6C: el claim del onboarding debe completarse antes del bootstrap de
    // sesión para que authorization + x-tenant-id ya existan en storage.
    await claimOnboardingFromUrlIfPresent();
    sessionLoaded = true;
    authenticatedSession = await loadAuthenticatedAppShellSession({
      fetcher: fetch,
      storage: localStorage,
      apiBase: resolveApiBase(localStorage),
      ...resolveApiAuth(localStorage),
    });
  });

  // S9-A2: banner ámbar de pago (anti-apagado, GTM §4.3): la caja NUNCA se
  // bloquea; solo se informa al dueño para regularizar el método de pago.
  let billingNotice = $derived(billingNoticeText(authenticatedSession?.billing));
</script>

{#if showSkipLink}
  <a href="#contenido" class="skip-link">Saltar a contenido</a>
{/if}

<div
  class="app-shell"
  class:sidebar-collapsed={!sidebarOpen}
  class:chrome-bare={!showSidebar && !showTopBar}
  class:chrome-cashier={chromeMode === 'cashier'}
>
  {#if billingNotice}
    <div class="billing-banner" role="status" data-testid="billing-banner">
      <span>{billingNotice}</span>
    </div>
  {/if}
  {#if showSidebar}
  <aside class="sidebar" aria-label="Navegación principal" data-testid="app-sidebar">
    <!-- Brand header -->
    <div class="sidebar-brand">
      <div class="brand-logo">
        <BrandKnot size={14} />
      </div>
      {#if sidebarOpen}
        <div class="brand-text">
          <span class="brand-title">KipusPay</span>
          <span class="brand-sub">POS & Facturación</span>
        </div>
      {/if}
      <button
        type="button"
        class="sidebar-toggle"
        onclick={toggleSidebar}
        aria-label={sidebarOpen ? 'Colapsar navegación' : 'Expandir navegación'}
        title={sidebarOpen ? 'Colapsar' : 'Expandir'}
      >
        <Icon name={sidebarOpen ? 'chevron-left' : 'chevron-right'} size={14} />
      </button>
    </div>

    <!-- Nav groups -->
    <nav class="sidebar-nav">
      {#each navGroups as group (group.id)}
        {#if group.items.length > 0}
          <div class="nav-group" class:active={isGroupActive(group)}>
            <button
              type="button"
              class="nav-group-header"
              onclick={() => toggleGroup(group.id)}
              aria-expanded={expandedGroups[group.id]}
              title={!sidebarOpen ? group.label : undefined}
            >
              <span class="nav-group-icon" class:group-active={isGroupActive(group)}>
                <Icon name={group.icon} size={16} />
              </span>
              {#if sidebarOpen}
                <span class="nav-group-label">{group.label}</span>
                <span class="nav-group-chevron" class:rotated={expandedGroups[group.id]}>
                  <Icon name="chevron-right" size={12} />
                </span>
              {/if}
            </button>

            {#if expandedGroups[group.id] && sidebarOpen}
              <ul class="nav-items" role="list">
                {#each group.items as item (item.href)}
                  <li>
                    <a
                      href={item.href}
                      class="nav-item"
                      class:nav-item-active={isActive(item.href)}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      <Icon name={item.icon} size={14} />
                      <span>{item.label}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      {/each}
    </nav>
  </aside>
  {/if}
  {#if showSidebar && isNarrow && sidebarOpen}
    <button
      type="button"
      class="nav-overlay"
      aria-label="Cerrar navegación"
      data-testid="nav-overlay"
      onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}

  <!-- Main content area -->
  <div class="main-area">
    {#if showTopBar}
    <header class="top-bar">
      <div class="top-bar-left">
        {#if showSidebar}
          <button
            type="button"
            class="nav-hamburger"
            data-testid="nav-hamburger"
            aria-label={sidebarOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-expanded={sidebarOpen}
            onclick={toggleSidebar}
          >
            <Icon name="menu" size={18} />
          </button>
        {/if}
        <div class="breadcrumb">
          <BrandKnot size={10} />
          <span class="breadcrumb-app">KipusPay</span>
          <Icon name="chevron-right" size={12} />
          <span class="breadcrumb-page">{pageCrumb}</span>
        </div>
      </div>
      <div class="top-bar-right">
        <div
          class="status-pill"
          class:offline={!online}
          data-testid="connection-status"
        >
          <span class="pulse-dot" class:offline={!online}></span>
          <span class={connectionStitch}>{online ? 'En línea' : 'Sin conexión'}</span>
        </div>
        {#if sessionLoaded && authenticatedSession === null && !import.meta.env.PUBLIC_DEV_AUTH}
          <a href="/login" class="login-link" data-testid="topbar-login">
            <Icon name="key" size={14} />
            Iniciar sesión
          </a>
        {/if}
        <button
          type="button"
          class="theme-toggle-btn icon-only"
          onclick={toggleTheme}
          aria-label="Cambiar modo claro y oscuro"
          title={`Cambiar a modo ${currentTheme === 'dark' ? 'claro' : 'oscuro'}`}
        >
          <Icon name={currentTheme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
    {/if}

    <main class="page-content" id="contenido">
      {#key page.url.pathname}
        <div
          class="page-transition"
          in:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
          out:fade={{ duration: 0 }}
        >
          {@render children()}
        </div>
      {/key}
    </main>
  </div>
</div>

<style>
  /* ── App Shell Layout ─────────────────────────── */
  .billing-banner {
    position: sticky;
    top: 0;
    z-index: 60;
    background: color-mix(in srgb, var(--amber-gold) 28%, var(--paper, #f3efe6));
    color: var(--ink);
    padding: 0.55rem 1rem;
    padding-top: calc(0.55rem + env(safe-area-inset-top, 0px));
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    border-bottom: 1px solid var(--amber-gold);
  }
  .app-shell {
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg-primary);
  }

  .app-shell.chrome-bare {
    display: block;
  }

  .nav-hamburger {
    width: 48px;
    height: 48px;
    min-width: 48px;
    display: none;
    align-items: center;
    justify-content: center;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-main);
    cursor: pointer;
    padding: 0;
  }

  .nav-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    border: 0;
    padding: 0;
    margin: 0;
    background: rgba(20, 22, 28, 0.55);
    cursor: pointer;
  }

  /* ── Sidebar ──────────────────────────────────── */
  .sidebar {
    width: 240px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    background: var(--bg-glass);
    border-right: 1px solid var(--border-subtle);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding-top: env(safe-area-inset-top, 0px);
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 50;
    flex-shrink: 0;
  }

  .app-shell.sidebar-collapsed .sidebar {
    width: 56px;
    min-width: 56px;
  }

  /* ── Sidebar Brand ────────────────────────────── */
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 1rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    min-height: 64px;
    flex-shrink: 0;
  }

  .brand-logo {
    width: 34px;
    height: 34px;
    min-width: 34px;
    background: var(--accent-gradient);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #14161c;
    box-shadow: 0 4px 12px rgba(217, 154, 61, 0.35);
    flex-shrink: 0;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .brand-title {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.02em;
  }

  .brand-sub {
    font-size: 0.6rem;
    color: var(--accent-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .sidebar-toggle {
    width: 48px;
    height: 48px;
    min-width: 48px;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .sidebar-toggle:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  /* ── Sidebar Nav ──────────────────────────────── */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .sidebar-nav::-webkit-scrollbar {
    width: 4px;
  }

  .sidebar-nav::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 2px;
  }

  .nav-group {
    margin-bottom: 0.125rem;
  }

  .nav-group-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0;
    min-height: 48px;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .nav-group-header:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
  }

  .nav-group.active > .nav-group-header {
    color: var(--accent-primary);
  }

  .nav-group-icon {
    width: 28px;
    height: 28px;
    min-width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .nav-group-icon.group-active {
    background: rgba(217, 154, 61, 0.12);
    border-color: rgba(217, 154, 61, 0.3);
    color: var(--accent-primary);
  }

  .nav-group-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-group-chevron {
    transition: transform 0.2s ease;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .nav-group-chevron.rotated {
    transform: rotate(90deg);
    opacity: 1;
  }

  .nav-items {
    list-style: none;
    padding: 0.125rem 0.5rem 0.375rem 0.5rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.6875rem 0.625rem;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 48px;
  }

  .nav-item:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
  }

  .nav-item-active {
    color: #14161c;
    background: var(--accent-gradient);
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(217, 154, 61, 0.3);
  }

  .nav-item-active:hover {
    color: #14161c;
    background: var(--accent-gradient);
  }

  /* ── Sidebar Footer ───────────────────────────── */
  .sidebar-footer {
    padding: 0.75rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .theme-toggle-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
    text-align: left;
    min-height: 48px;
  }

  .theme-toggle-btn:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  .theme-toggle-btn.icon-only {
    width: auto;
    padding: 0.45rem 0.6rem;
    min-height: 48px;
    min-width: 48px;
    justify-content: center;
  }

  .status-dot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
  }

  .status-label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--emerald-green);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .status-label.offline {
    color: var(--rose-red);
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    min-width: 7px;
    border-radius: 50%;
    background-color: var(--emerald-green);
    box-shadow: 0 0 0 0 rgba(46, 158, 116, 0.7);
    animation: pulse-green 2s infinite;
    flex-shrink: 0;
  }

  .pulse-dot.offline {
    background-color: var(--rose-red);
    box-shadow: 0 0 0 0 rgba(217, 106, 60, 0.7);
    animation: pulse-offline 2s infinite;
  }

  @keyframes pulse-green {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 158, 116, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(46, 158, 116, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 158, 116, 0); }
  }

  @keyframes pulse-offline {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 106, 60, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(217, 106, 60, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 106, 60, 0); }
  }

  /* ── Main Area ────────────────────────────────── */
  .main-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Top Bar ──────────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    padding-right: calc(1.5rem + env(safe-area-inset-right, 0px));
    height: 64px;
    min-height: 64px;
    background: var(--bg-glass);
    border-bottom: 1px solid var(--border-subtle);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    position: sticky;
    top: 0;
    z-index: 40;
    flex-shrink: 0;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .top-bar-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
  }

  .breadcrumb-app {
    font-weight: 700;
    color: var(--text-muted);
    font-family: var(--font-heading);
  }

  .breadcrumb-page {
    color: var(--text-main);
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(46, 158, 116, 0.12);
    border: 1px solid rgba(46, 158, 116, 0.3);
    border-radius: var(--radius-full);
    padding: 0.3rem 0.75rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--emerald-green);
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .status-pill.offline {
    background: rgba(217, 106, 60, 0.12);
    border: 1px solid rgba(217, 106, 60, 0.3);
    color: var(--rose-red);
  }

  .login-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.45rem 0.875rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
    background: var(--bg-button-sec);
    color: var(--accent-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 48px;
  }

  .login-link:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  /* ── Page Content ─────────────────────────────── */
  .page-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
  }

  .chrome-bare .page-content {
    padding: 0;
    overflow: visible;
  }

  .chrome-cashier .page-content {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }

  /* ── Responsive ───────────────────────────────── */
  @media (max-width: 768px) {
    .nav-hamburger {
      display: flex;
    }

    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      height: 100vh;
      height: 100dvh;
      z-index: 100;
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
    }

    .app-shell.sidebar-collapsed .sidebar {
      transform: translateX(-100%);
      width: 240px;
      min-width: 240px;
    }

    .top-bar {
      padding: 0 1rem;
    }

    .breadcrumb-app {
      display: none;
    }

    .page-content {
      padding: 1rem;
    }
  }

  @media (max-width: 480px) {
    .status-pill {
      display: none;
    }
  }
</style>
