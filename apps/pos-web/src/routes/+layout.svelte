<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { onMount, type ComponentProps } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    provideAdminAuthenticatedSessionState,
    type AdminAuthenticatedSession,
  } from '$lib/admin/authenticated-session';
  import { loadAuthenticatedAppShellSession } from '$lib/admin/app-shell-session';
  import {
    showCashOperatingNavigation,
    showCustomerOrderNavigation,
  } from '$lib/customer-orders/customer-order-access';
  import {
    isCustomerOrdersEnabled,
    isMobilePosEnabled,
    isMobilePushEnabled,
    isRecurringSalesEnabled,
  } from '$lib/features';
  import { registerUnifiedPosServiceWorker } from '$lib/mobile/mobile-push-pwa';

  let { children } = $props();
  let authenticatedSession = $state<AdminAuthenticatedSession | null>(null);
  const authenticatedSessionState = {
    get current() {
      return authenticatedSession;
    },
  };
  provideAdminAuthenticatedSessionState(authenticatedSessionState);

  type IconName = ComponentProps<typeof Icon>['name'];

  // Sidebar state
  let sidebarOpen = $state(true);
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
      id: 'terminal',
      label: 'Terminal',
      icon: 'cart',
      alwaysVisible: true,
      items: [
        ...(showCashOperatingNavigation(authenticatedSession?.role ?? '')
          ? [
              { href: '/', label: 'POS Terminal', icon: 'cart' as IconName },
              { href: '/caja', label: 'Cierre Z', icon: 'receipt' as IconName },
              { href: '/caja/cobro', label: 'Cobro local', icon: 'credit-card' as IconName },
              { href: '/caja/devolucion', label: 'Devolución', icon: 'rotate-ccw' as IconName },
              { href: '/caja/cotizacion', label: 'Cotizaciones', icon: 'file-text' as IconName },
              { href: '/caja/apartado', label: 'Apartados', icon: 'clock' as IconName },
              { href: '/caja/cuotas', label: 'Cuotas', icon: 'calendar' as IconName },
            ]
          : [{ href: '/', label: 'POS Terminal', icon: 'cart' as IconName }]),
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
        { href: '/admin/integraciones', label: 'Integraciones', icon: 'link' as IconName },
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
        { href: '/admin/factura-proveedor', label: 'Factura 3-way', icon: 'file-text' as IconName },
        { href: '/admin/devolucion-proveedor', label: 'Dev. proveedor', icon: 'arrow-left' as IconName },
      ],
    },
    {
      id: 'owner',
      label: 'Modo Dueño',
      icon: 'shield',
      alwaysVisible: true,
      items: [
        { href: '/owner', label: 'Dashboard Hoy', icon: 'home' as IconName },
        { href: '/owner/finanzas', label: 'Finanzas', icon: 'trending-up' as IconName },
        { href: '/owner/stock', label: 'Alertas Stock', icon: 'alert' as IconName },
        { href: '/owner/compras', label: 'Compras', icon: 'clipboard' as IconName },
        { href: '/owner/pagos', label: 'Pagos', icon: 'credit-card' as IconName },
        { href: '/owner/locales', label: 'Locales', icon: 'store' as IconName },
        { href: '/owner/transferencias', label: 'Transferencias', icon: 'truck' as IconName },
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
        { href: '/admin/configuracion', label: 'Configuración', icon: 'settings' as IconName },
      ],
    },
    {
      id: 'especiales',
      label: 'Modos especiales',
      icon: 'grid',
      alwaysVisible: true,
      items: [
        { href: '/salon', label: 'Salón', icon: 'utensils' as IconName },
        { href: '/kds', label: 'KDS Cocina', icon: 'chef-hat' as IconName },
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

  function applyTheme(theme: 'dark' | 'light') {
    currentTheme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('kipus_theme', theme);
      } catch {
        // Storage access may be blocked in restricted contexts.
      }
    }
  }

  function toggleTheme(e?: Event) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  onMount(async () => {
    if (typeof document !== 'undefined') {
      const activeTheme = document.documentElement.getAttribute('data-theme') as 'dark' | 'light' | null;
      if (activeTheme === 'light' || activeTheme === 'dark') {
        currentTheme = activeTheme;
      } else {
        try {
          const savedTheme = localStorage.getItem('kipus_theme') as 'dark' | 'light' | null;
          applyTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark');
        } catch {
          applyTheme('dark');
        }
      }

      window.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement)?.closest('.theme-toggle-btn');
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          toggleTheme();
        }
      });

      // Auto-expand the active group
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

    authenticatedSession = await loadAuthenticatedAppShellSession({
      fetcher: fetch,
      storage: localStorage,
      apiBase: (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '',
      ...((import.meta.env.PUBLIC_DEV_AUTH as string | undefined)
        ? { authorization: import.meta.env.PUBLIC_DEV_AUTH as string }
        : {}),
    });
  });
</script>

<div class="app-shell" class:sidebar-collapsed={!sidebarOpen}>
  <!-- Sidebar -->
  <aside class="sidebar" aria-label="Navegación principal">
    <!-- Brand header -->
    <div class="sidebar-brand">
      <div class="brand-logo">
        <Icon name="cart" size={20} />
      </div>
      {#if sidebarOpen}
        <div class="brand-text">
          <span class="brand-title">KipusPay</span>
          <span class="brand-sub">POS & Facturación Edge</span>
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

    <!-- Sidebar footer: theme + status -->
    <div class="sidebar-footer">
      <button
        type="button"
        class="theme-toggle-btn"
        onclick={toggleTheme}
        aria-label="Cambiar modo claro y oscuro"
        title={`Cambiar a modo ${currentTheme === 'dark' ? 'claro' : 'oscuro'}`}
      >
        <Icon name={currentTheme === 'dark' ? 'sun' : 'moon'} size={16} />
        {#if sidebarOpen}
          <span>{currentTheme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
        {/if}
      </button>
      <div class="status-dot" title="Edge D1 Conectado">
        <span class="pulse-dot"></span>
        {#if sidebarOpen}
          <span class="status-label">Edge D1</span>
        {/if}
      </div>
    </div>
  </aside>

  <!-- Main content area -->
  <div class="main-area">
    <!-- Top bar -->
    <header class="top-bar">
      <div class="top-bar-left">
        <div class="breadcrumb">
          <span class="breadcrumb-app">KipusPay</span>
          <Icon name="chevron-right" size={12} />
          <span class="breadcrumb-page">{page.url.pathname.replace(/^\//, '') || 'Terminal POS'}</span>
        </div>
      </div>
      <div class="top-bar-right">
        <div class="status-pill">
          <span class="pulse-dot"></span>
          <span>EDGE D1 CONECTADO</span>
        </div>
        <button
          type="button"
          class="theme-toggle-btn icon-only"
          onclick={toggleTheme}
          aria-label="Cambiar modo"
          title={`Modo ${currentTheme === 'dark' ? 'claro' : 'oscuro'}`}
        >
          <Icon name={currentTheme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>

    <main class="page-content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  /* ── App Shell Layout ─────────────────────────── */
  .app-shell {
    display: flex;
    min-height: 100vh;
    background: var(--bg-primary);
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
    overflow: hidden;
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
    width: 24px;
    height: 24px;
    min-width: 24px;
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
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0;
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
    padding: 0.4375rem 0.625rem;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--transition-fast);
    white-space: nowrap;
    overflow: hidden;
    min-height: 34px;
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
    min-height: 36px;
  }

  .theme-toggle-btn:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  .theme-toggle-btn.icon-only {
    width: auto;
    padding: 0.45rem 0.6rem;
    min-height: 38px;
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
    color: #34d399;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    min-width: 7px;
    border-radius: 50%;
    background-color: #34d399;
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
    animation: pulse-green 2s infinite;
    flex-shrink: 0;
  }

  @keyframes pulse-green {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(52, 211, 153, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
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
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: var(--radius-full);
    padding: 0.3rem 0.75rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #34d399;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  /* ── Page Content ─────────────────────────────── */
  .page-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  /* ── Responsive ───────────────────────────────── */
  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      height: 100vh;
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
