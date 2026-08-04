<script lang="ts">
  import { isOwnerModeEnabled } from '$lib/features';
  import { page } from '$app/stores';

  const enabled = isOwnerModeEnabled();
  const tabs = [
    { href: '/owner', label: 'Hoy', testid: 'tab-hoy' },
    { href: '/owner/finanzas', label: 'Finanzas', testid: 'tab-finanzas' },
    { href: '/owner/yo', label: 'Yo', testid: 'tab-yo' },
  ] as const;
</script>

{#if !enabled}
  <p data-testid="owner-off">Modo Dueño desactivado (FEATURE_OWNER_MODE off).</p>
{:else}
  <div class="owner-shell" data-testid="owner-shell" data-theme="owner-dark">
    <header class="owner-brand">
      <p class="brand">KipusPay</p>
      <p class="mode">Modo Dueño</p>
    </header>
    <slot />
    <nav class="owner-tabs" aria-label="Modo Dueño">
      {#each tabs as tab}
        <a
          href={tab.href}
          data-testid={tab.testid}
          class:active={$page.url.pathname === tab.href}
        >
          {tab.label}
        </a>
      {/each}
      <a href="/owner/locales" data-testid="tab-locales" class="gated" aria-disabled="true">
        Locales
      </a>
    </nav>
  </div>
{/if}

<style>
  .owner-shell {
    --owner-bg: #0f1419;
    --owner-fg: #e8eef4;
    --owner-muted: #8b9aab;
    --owner-accent: #3d9a6a;
    --owner-surface: #1a222c;
    min-height: 100dvh;
    background:
      radial-gradient(120% 80% at 10% -10%, #1c3a2e 0%, transparent 55%),
      linear-gradient(180deg, #121820 0%, var(--owner-bg) 40%);
    color: var(--owner-fg);
    display: flex;
    flex-direction: column;
    max-width: 28rem;
    margin: 0 auto;
    font-family: 'Segoe UI', 'Avenir Next', sans-serif;
  }
  .owner-brand {
    padding: 1.25rem 1.25rem 0.5rem;
  }
  .brand {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .mode {
    margin: 0.15rem 0 0;
    color: var(--owner-muted);
    font-size: 0.85rem;
  }
  .owner-tabs {
    position: sticky;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--owner-surface) 92%, black);
    border-top: 1px solid #2a3542;
  }
  .owner-tabs a {
    text-align: center;
    text-decoration: none;
    color: var(--owner-muted);
    padding: 0.65rem 0.25rem;
    font-size: 0.8rem;
  }
  .owner-tabs a.active {
    color: var(--owner-accent);
    font-weight: 600;
  }
  .owner-tabs a.gated {
    opacity: 0.45;
  }
</style>
