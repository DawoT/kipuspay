<script lang="ts">
  import { page } from '$app/state';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    isCustomerOrdersEnabled,
    isPosCheckoutEnabled,
    isShiftHandoffEnabled,
  } from '$lib/features';
  import { showCustomerOrderNavigation } from '$lib/customer-orders/customer-order-access';

  let {
    role = '',
  }: {
    role?: string;
  } = $props();

  const checkoutOn = isPosCheckoutEnabled();
  const handoffOn = isShiftHandoffEnabled();
  const showPedidos = $derived(
    showCustomerOrderNavigation({ enabled: isCustomerOrdersEnabled(), role }),
  );
  const path = $derived(page.url.pathname);

  function isActive(href: string): boolean {
    if (href === '/') return path === '/';
    return path === href || path.startsWith(`${href}/`);
  }
</script>

{#if checkoutOn}
  <nav class="pos-bottom-nav" aria-label="Navegación de caja" data-testid="pos-bottom-nav">
    <a href="/" class="pos-nav-item" class:active={isActive('/')} data-testid="pos-nav-cobrar">
      <Icon name="check" size={18} />
      <span>Cobrar</span>
    </a>
    <a
      href="/caja/historial"
      class="pos-nav-item"
      class:active={isActive('/caja/historial')}
      data-testid="pos-nav-historial"
    >
      <Icon name="receipt" size={18} />
      <span>Historial del día</span>
    </a>
    <a
      href="/caja"
      class="pos-nav-item"
      class:active={path === '/caja' || path === '/caja/'}
      data-testid="pos-nav-caja"
    >
      <Icon name="lock" size={18} />
      <span>Caja</span>
    </a>
    {#if handoffOn}
      <a
        href="/caja/handoff"
        class="pos-nav-item"
        class:active={isActive('/caja/handoff')}
        data-testid="pos-nav-handoff"
      >
        <Icon name="users" size={18} />
        <span>Cambio de turno</span>
      </a>
    {/if}
    {#if showPedidos}
      <a
        href="/orders/customer"
        class="pos-nav-item"
        class:active={isActive('/orders/customer')}
        data-testid="pos-nav-pedidos"
      >
        <Icon name="package" size={18} />
        <span>Pedidos retiro</span>
      </a>
    {/if}
    <a
      href="/ayuda"
      class="pos-nav-item"
      class:active={isActive('/ayuda')}
      data-testid="pos-nav-ayuda"
    >
      <Icon name="info" size={18} />
      <span>Ayuda</span>
    </a>
  </nav>
{/if}

<style>
  .pos-bottom-nav {
    display: flex;
    justify-content: space-around;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-subtle);
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
  }

  .pos-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
    flex: 1;
    max-width: 6.5rem;
    min-height: 48px;
    padding: 0.4rem 0.35rem;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    text-decoration: none;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }

  .pos-nav-item span {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  .pos-nav-item:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.04);
  }

  .pos-nav-item.active {
    color: var(--accent-primary);
  }
</style>
