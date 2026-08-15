<script lang="ts">
  import { isOwnerModeEnabled } from '$lib/features';
  import { page } from '$app/state';
  import { ownerBottomTabs, ownerTabIsActive } from '$lib/ui/owner-nav';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';

  let { children } = $props();

  const enabled = isOwnerModeEnabled();
  const tabs = $derived(ownerBottomTabs());
</script>

{#if !enabled}
  <p data-testid="owner-off">El Modo Dueño no está activo para este negocio.</p>
{:else}
  <div class="owner-app" data-testid="owner-shell" data-theme="owner-dark">
    <header class="owner-chrome">
      <p class="brand"><BrandKnot size={12} /> KipusPay</p>
      <nav class="owner-tabs" aria-label="Modo Dueño" style:--tab-count={tabs.length}>
        {#each tabs as tab (tab.href)}
          <a
            href={tab.href}
            data-testid={tab.testid}
            class:active={ownerTabIsActive(page.url.pathname, tab.href)}
          >
            {tab.label}
          </a>
        {/each}
      </nav>
    </header>
    <div class="owner-body">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .owner-app {
    min-height: 100dvh;
    background: var(--ink);
    color: var(--owner-fg);
    display: flex;
    flex-direction: column;
    font-family: var(--font-sans);
    padding-top: env(safe-area-inset-top, 0px);
  }
  .owner-chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 1rem 1.5rem 0.5rem;
  }
  .brand {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-family: var(--font-heading);
    flex-shrink: 0;
  }
  .owner-body {
    flex: 1;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }
  .owner-tabs {
    display: grid;
    grid-template-columns: repeat(var(--tab-count, 5), 1fr);
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
    max-width: 36rem;
  }
  .owner-tabs a {
    text-align: center;
    text-decoration: none;
    color: var(--owner-muted);
    padding: 0.85rem 0.25rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .owner-tabs a.active {
    color: var(--amber-gold);
    font-weight: 600;
  }

  @media (max-width: 719px) {
    .owner-chrome,
    .owner-body {
      max-width: 28rem;
      padding-left: 1.25rem;
      padding-right: 1.25rem;
    }
    .owner-body {
      padding-bottom: 5.5rem;
    }
    .owner-tabs {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: 28rem;
      margin: 0 auto;
      padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
      background: color-mix(in srgb, var(--owner-surface) 92%, black);
      border-top: 1px solid var(--owner-border);
    }
  }
</style>
