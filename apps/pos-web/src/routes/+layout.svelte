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

  const navLinks = $derived([
    ...(showCashOperatingNavigation(authenticatedSession?.role ?? '')
      ? [
          { href: '/', label: 'POS Terminal', icon: 'cart' as IconName },
          { href: '/caja', label: 'Cierre Z', icon: 'lock' as IconName },
        ]
      : []),
    ...(showCustomerOrderNavigation({
      enabled: isCustomerOrdersEnabled(),
      role: authenticatedSession?.role ?? '',
    })
      ? [{ href: '/orders/customer', label: 'Pedidos retiro', icon: 'package' as IconName }]
      : []),
    ...(isRecurringSalesEnabled() &&
    ['owner', 'admin'].includes(authenticatedSession?.role?.toLowerCase() ?? '')
      ? [{ href: '/admin/membresias', label: 'Membresías', icon: 'refresh' as IconName }]
      : []),
    ...(isMobilePosEnabled() || isMobilePushEnabled()
      ? [{ href: '/mobile', label: 'Dispositivo', icon: 'wifi' as IconName }]
      : []),
    { href: '/admin/ubicaciones', label: 'Ubicaciones', icon: 'building' as IconName },
    { href: '/admin/etiquetas', label: 'Etiquetas', icon: 'tag' as IconName },
    { href: '/admin/diario', label: 'Diario', icon: 'file-text' as IconName },
    { href: '/admin/configuracion', label: 'Configuración', icon: 'settings' as IconName },
    { href: '/owner', label: 'Modo Dueño', icon: 'shield' as IconName },
  ]);

  onMount(async () => {
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

<header class="app-header">
  <div class="header-container">
    <div class="brand">
      <div class="logo-icon">
        <Icon name="cart" size={22} />
      </div>
      <div class="brand-text">
        <span class="brand-title">KipusPay</span>
        <span class="brand-subtitle">POS & Facturación Edge</span>
      </div>
    </div>

    <nav class="nav-menu">
      {#each navLinks as link}
        <a
          href={link.href}
          class="nav-link"
          class:active={page.url.pathname === link.href || (link.href !== '/' && page.url.pathname.startsWith(link.href))}
        >
          <Icon name={link.icon} size={16} />
          <span class="nav-label">{link.label}</span>
        </a>
      {/each}
    </nav>

    <div class="header-status">
      <div class="badge badge-success">
        <span class="pulse-dot"></span>
        <span>EDGE D1 CONECTADO</span>
      </div>
    </div>
  </div>
</header>

<main class="main-content">
  {@render children()}
</main>

<style>
  .app-header {
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 38px;
    height: 38px;
    background: var(--accent-gradient);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    font-family: var(--font-heading);
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .brand-subtitle {
    font-size: 0.6875rem;
    color: #a5b4fc;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .nav-menu {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: rgba(255, 255, 255, 0.03);
    padding: 0.25rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-subtle);
    overflow-x: auto;
  }

  .nav-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    box-sizing: border-box;
    gap: 0.5rem;
    padding: 0.4375rem 0.875rem;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-link.active {
    color: #ffffff;
    background: var(--accent-gradient);
    font-weight: 600;
    box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
  }

  .header-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .badge-success {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    letter-spacing: 0.04em;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #34d399;
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
    animation: pulse-green 2s infinite;
  }

  @keyframes pulse-green {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 6px rgba(52, 211, 153, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
    }
  }

  .main-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  @media (max-width: 900px) {
    .header-container {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
    }

    .nav-menu {
      width: 100%;
    }
  }
</style>
