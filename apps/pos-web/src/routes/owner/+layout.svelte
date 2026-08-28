<script lang="ts">
  import { isAgenticInsightsEnabled, isOwnerModeEnabled } from '$lib/features';
  import { capabilitiesFetchedAt, getStaleBanner, STALE_THRESHOLD_MS } from '$lib/tenant/capabilitiesStore';
  import { page } from '$app/state';
  import { fade } from 'svelte/transition';
  import { prefersReducedMotion } from 'svelte/motion';
  import { onMount } from 'svelte';
  import { ownerSidebarGroups } from '$lib/ui/owner-nav';
  import { breadcrumbLabel } from '$lib/ui/breadcrumb';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  let { children } = $props();

  let enabled = $derived(isOwnerModeEnabled());
  let capabilitiesStaleBanner = $derived.by(() => {
    const fetchedAt = $capabilitiesFetchedAt;
    if (fetchedAt === null) return null;
    const age = Date.now() - fetchedAt;
    if (age <= STALE_THRESHOLD_MS) return null;
    return getStaleBanner();
  });

  // Sidebar premium — patrón POS (colapsable desktop + drawer móvil 719px)
  const COMPACT_MQ = '(max-width: 719px)';
  let sidebarOpen = $state(true);
  let isNarrow = $state(false);
  let expandedGroups = $state<Record<string, boolean>>({
    hoy: true,
    ventas: false,
    finanzas: true,
    locales: true,
    operaciones: false,
    alertas: true,
    cuenta: true,
  });

  function toggleGroup(group: string) {
    expandedGroups = { ...expandedGroups, [group]: !expandedGroups[group] };
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  const insightsOn = isAgenticInsightsEnabled();
  const navGroups = $derived(ownerSidebarGroups(insightsOn));

  function isActive(href: string) {
    const path = page.url.pathname;
    if (href === '/') return path === '/';
    return path === href || path.startsWith(href + '/');
  }

  function isGroupActive(group: { items: readonly { href: string }[] }) {
    return group.items.some((item) => isActive(item.href));
  }

  const pageCrumb = $derived(breadcrumbLabel(page.url.pathname));

  let online = $state(true);
  let scrolled = $state(false);
  function syncOnline() {
    online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  // Top-bar blur contextual: transparent → glass al scrollY>8px
  $effect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const el = document.querySelector('.owner-content') as HTMLElement | null;
    const handler = () => {
      const y = el ? el.scrollTop : window.scrollY;
      scrolled = y > 8;
    };
    el?.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => {
      el?.removeEventListener('scroll', handler);
      window.removeEventListener('scroll', handler);
    };
  });

  onMount(() => {
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);

    if (typeof document !== 'undefined') {
      const narrow = window.matchMedia(COMPACT_MQ);
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

      return () => {
        narrow.removeEventListener('change', syncNarrow);
        window.removeEventListener('online', syncOnline);
        window.removeEventListener('offline', syncOnline);
      };
    }
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  });
</script>

{#if !enabled}
  <p data-testid="owner-off">El Modo Dueño no está activo para este negocio.</p>
{:else}
  <div
    class="owner-shell"
    class:sidebar-collapsed={!sidebarOpen}
    data-testid="owner-shell"
    data-theme="owner-dark"
  >
    <!-- Sidebar premium Modo Dueño -->
    <aside class="owner-sidebar" aria-label="Navegación Modo Dueño" data-testid="owner-sidebar">
      <!-- Brand -->
      <div class="owner-sidebar-brand">
        <div class="owner-brand-logo">
          <BrandKnot size={14} />
        </div>
        {#if sidebarOpen}
          <div class="owner-brand-text">
            <span class="owner-brand-title">KipusPay</span>
            <span class="owner-brand-sub">Modo Dueño</span>
          </div>
        {/if}
        <button
          type="button"
          class="owner-sidebar-toggle"
          onclick={toggleSidebar}
          aria-label={sidebarOpen ? 'Colapsar navegación' : 'Expandir navegación'}
          title={sidebarOpen ? 'Colapsar' : 'Expandir'}
          data-testid="owner-sidebar-toggle"
        >
          <Icon name={sidebarOpen ? 'chevron-left' : 'chevron-right'} size={14} />
        </button>
      </div>

      <!-- Nav groups — reutiliza tokens y micro-interacciones del POS -->
      <nav class="owner-sidebar-nav" aria-label="Secciones Modo Dueño">
        {#each navGroups as group (group.id)}
          {#if group.items.length > 0}
            <div class="owner-nav-group" class:active={isGroupActive(group)}>
              <button
                type="button"
                class="owner-nav-group-header"
                onclick={() => toggleGroup(group.id)}
                aria-expanded={expandedGroups[group.id]}
                aria-controls={`owner-group-${group.id}`}
                title={!sidebarOpen ? group.label : undefined}
                data-testid={`owner-group-${group.id}`}
              >
                <span class="owner-nav-group-icon" class:group-active={isGroupActive(group)}>
                  <Icon name={group.icon} size={16} />
                </span>
                {#if sidebarOpen}
                  <span class="owner-nav-group-label">{group.label}</span>
                  <span class="owner-nav-group-chevron" class:rotated={expandedGroups[group.id]}>
                    <Icon name="chevron-right" size={12} />
                  </span>
                {/if}
              </button>

              {#if expandedGroups[group.id] && sidebarOpen}
                <ul class="owner-nav-items" role="list" id={`owner-group-${group.id}`}>
                  {#each group.items as item (item.href)}
                    <li>
                      <a
                        href={item.href}
                        class="owner-nav-item"
                        class:owner-nav-item-active={isActive(item.href)}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        data-testid={item.testid}
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

      <!-- Estado en línea — siempre visible, no invasivo -->
      <div class="owner-sidebar-footer">
        <div class="owner-status-dot" role="status" aria-label={online ? 'En línea' : 'Sin conexión'}>
          <span class="owner-pulse-dot" class:offline={!online}></span>
          {#if sidebarOpen}
            <span class="owner-status-label" class:offline={!online}>{online ? 'En línea' : 'Sin conexión'}</span>
          {/if}
        </div>
      </div>
    </aside>

    {#if isNarrow && sidebarOpen}
      <button
        type="button"
        class="owner-nav-overlay"
        aria-label="Cerrar navegación"
        data-testid="owner-nav-overlay"
        onclick={() => (sidebarOpen = false)}
      ></button>
    {/if}

    <!-- Main -->
    <div class="owner-main">
      <header class="owner-top-bar" class:scrolled>
        <div class="owner-top-left">
          <button
            type="button"
            class="owner-hamburger"
            data-testid="owner-hamburger"
            aria-label={sidebarOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-expanded={sidebarOpen}
            onclick={toggleSidebar}
          >
            <Icon name="menu" size={18} />
          </button>
          <div class="owner-breadcrumb">
            <BrandKnot size={10} />
            <span class="owner-breadcrumb-app">KipusPay</span>
            <Icon name="chevron-right" size={12} />
            <span class="owner-breadcrumb-knot" aria-hidden="true"></span>
            {#key page.url.pathname}
              <span
                class="owner-breadcrumb-page"
                in:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
                out:fade={{ duration: 0 }}
                style="transition: opacity 120ms ease"
                >{pageCrumb}</span
              >
            {/key}
          </div>
        </div>
        <div class="owner-top-right">
          <span class="owner-status-pill" class:offline={!online} data-testid="owner-connection-status" role="status">
            <span class="owner-pulse-dot small" class:offline={!online}></span>
            <span class="owner-status-pill-label">{online ? 'En línea' : 'Sin conexión'}</span>
          </span>
        </div>
      </header>

      {#if capabilitiesStaleBanner}
        <div class="owner-body" style="padding-bottom:0">
          <StatusMessage tone="warning" data-testid="capabilities-stale-banner">
            <Icon name="clock" size={16} />
            <span>{capabilitiesStaleBanner}</span>
          </StatusMessage>
        </div>
      {/if}

      <main class="owner-content" id="contenido">
        <div class="owner-body">
          {@render children()}
        </div>
      </main>
    </div>
  </div>
{/if}

<style>
  /* Shell — espejo del POS (tokens, blur, transiciones) */
  .owner-shell {
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg-primary);
    color: var(--text-main);
  }

  .owner-nav-overlay {
    position: fixed;
    inset: 0;
    z-index: 90;
    border: 0;
    padding: 0;
    margin: 0;
    background: rgba(20, 22, 28, 0.55);
    cursor: pointer;
  }

  /* Sidebar premium — ledger minimalism with premium ease-out */
  .owner-sidebar {
    width: 240px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    background: var(--bg-glass);
    border-right: 1px solid var(--border-subtle);
    backdrop-filter: blur(16px) saturate(1.15);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding-top: env(safe-area-inset-top, 0px);
    transition:
      width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      min-width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: width;
    z-index: 50;
    flex-shrink: 0;
  }

  .owner-shell.sidebar-collapsed .owner-sidebar {
    width: 56px;
    min-width: 56px;
  }

  .owner-sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 1rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    min-height: 64px;
    flex-shrink: 0;
  }

  .owner-brand-logo {
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

  .owner-brand-text {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .owner-brand-title {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.02em;
  }

  .owner-brand-sub {
    font-size: 0.6rem;
    color: var(--accent-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .owner-sidebar-toggle {
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

  .owner-sidebar-toggle:hover {
    color: var(--text-main);
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  .owner-sidebar-toggle:focus-visible {
    outline: 3px solid rgba(217, 154, 61, 0.55);
    outline-offset: 2px;
  }

  /* Nav — grupos colapsables con 44px targets */
  .owner-sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .owner-sidebar-nav::-webkit-scrollbar {
    width: 4px;
  }

  .owner-sidebar-nav::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 2px;
  }

  .owner-nav-group {
    margin-bottom: 0.125rem;
  }

  .owner-nav-group-header {
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

  .owner-nav-group-header:hover {
    color: var(--text-main);
    background: color-mix(in srgb, var(--accent-primary) 7%, var(--bg-glass-hover));
    box-shadow: var(--shadow-sm);
  }

  .owner-nav-group.active > .owner-nav-group-header {
    color: var(--accent-primary);
  }

  .owner-nav-group-icon {
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

  .owner-nav-group-icon.group-active {
    background: rgba(217, 154, 61, 0.12);
    border-color: rgba(217, 154, 61, 0.3);
    color: var(--accent-primary);
  }

  .owner-nav-group-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .owner-nav-group-chevron {
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    flex-shrink: 0;
    opacity: 0.5;
  }

  .owner-nav-group-chevron.rotated {
    transform: rotate(90deg);
    opacity: 1;
  }

  .owner-nav-items {
    list-style: none;
    padding: 0.125rem 0.5rem 0.375rem 0.5rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .owner-nav-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.6875rem 0.625rem;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    transition:
      color var(--transition-fast),
      background var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    min-height: 44px;
  }

  .owner-nav-item:hover {
    color: var(--text-main);
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-glass-hover));
    border-color: var(--border-glow);
    box-shadow: var(--shadow-sm);
    transform: translateX(1px);
  }

  .owner-nav-item:focus-visible {
    outline: 3px solid rgba(217, 154, 61, 0.55);
    outline-offset: 2px;
  }

  .owner-nav-item-active {
    color: #14161c;
    background: var(--accent-gradient);
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(217, 154, 61, 0.3);
  }

  .owner-nav-item-active:hover {
    color: #14161c;
    background: var(--accent-gradient);
  }

  .owner-sidebar-footer {
    padding: 0.75rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .owner-status-dot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
  }

  .owner-status-label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--emerald-green);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .owner-status-label.offline {
    color: var(--rose-red);
  }

  .owner-pulse-dot {
    width: 7px;
    height: 7px;
    min-width: 7px;
    border-radius: 50%;
    background-color: var(--emerald-green);
    box-shadow: 0 0 0 0 rgba(46, 158, 116, 0.7);
    animation: pulse-green 2s infinite;
    flex-shrink: 0;
  }

  .owner-pulse-dot.offline {
    background-color: var(--rose-red);
    box-shadow: 0 0 0 0 rgba(217, 106, 60, 0.7);
    animation: pulse-offline 2s infinite;
  }

  .owner-pulse-dot.small {
    width: 7px;
    height: 7px;
  }

  @keyframes pulse-green {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(46, 158, 116, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 5px rgba(46, 158, 116, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(46, 158, 116, 0);
    }
  }

  @keyframes pulse-offline {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(217, 106, 60, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 5px rgba(217, 106, 60, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(217, 106, 60, 0);
    }
  }

  /* Main */
  .owner-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .owner-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    padding-right: calc(1.5rem + env(safe-area-inset-right, 0px));
    height: 64px;
    min-height: 64px;
    background: transparent;
    border-bottom: 1px solid transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: none;
    position: sticky;
    top: 0;
    z-index: 40;
    flex-shrink: 0;
    transition:
      background var(--transition-fast),
      backdrop-filter var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .owner-top-bar.scrolled {
    background: var(--bg-glass);
    border-bottom-color: var(--border-subtle);
    backdrop-filter: blur(16px) saturate(1.15);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    box-shadow: var(--shadow-sm);
  }

  .owner-top-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    flex: 1;
  }

  .owner-top-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .owner-hamburger {
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

  .owner-hamburger:focus-visible {
    outline: 3px solid rgba(217, 154, 61, 0.55);
    outline-offset: 2px;
  }

  .owner-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    min-width: 0;
  }

  .owner-breadcrumb-app {
    font-weight: 700;
    color: var(--text-muted);
    font-family: var(--font-heading);
  }

  .owner-breadcrumb-page {
    color: var(--text-main);
    font-weight: 600;
    text-transform: capitalize;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: opacity 120ms ease;
  }

  .owner-breadcrumb-knot {
    width: 6px;
    height: 6px;
    background: var(--amber-gold);
    transform: rotate(45deg);
    border: 1px solid var(--bg-glass);
    flex-shrink: 0;
    display: inline-block;
    margin: 0 1px;
  }

  .owner-status-pill {
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

  .owner-status-pill.offline {
    background: rgba(217, 106, 60, 0.12);
    border-color: rgba(217, 106, 60, 0.3);
    color: var(--rose-red);
  }

  .owner-status-pill-label {
    white-space: nowrap;
  }

  .owner-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .owner-body {
    flex: 1;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem;
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Compacto unificado ≤719px — drawer móvil con hamburguesa */
  @media (max-width: 719px) {
    .owner-hamburger {
      display: flex;
    }

    .owner-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      height: 100vh;
      height: 100dvh;
      z-index: 100;
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.4);
    }

    .owner-shell.sidebar-collapsed .owner-sidebar {
      transform: translateX(-100%);
      width: 240px;
      min-width: 240px;
    }

    .owner-top-bar {
      padding: 0 1rem;
    }

    .owner-breadcrumb-app {
      display: none;
    }

    .owner-status-pill {
      gap: 0;
      padding: 0.3rem;
    }

    .owner-status-pill-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .owner-body {
      max-width: 28rem;
      padding-left: 1.25rem;
      padding-right: 1.25rem;
      padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .owner-sidebar,
    .owner-nav-group-chevron,
    .owner-nav-item,
    .owner-sidebar-toggle,
    .owner-hamburger {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
