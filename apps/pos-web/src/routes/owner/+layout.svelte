<script lang="ts">
  import { isAgenticInsightsEnabled, isOwnerModeEnabled } from '$lib/features';
  import { page } from '$app/stores';

  const enabled = isOwnerModeEnabled();
  const insightsEnabled = isAgenticInsightsEnabled();
  const tabs = [
    { href: '/owner', label: 'Hoy', testid: 'tab-hoy' },
    { href: '/owner/locales', label: 'Locales', testid: 'tab-locales' },
    { href: '/owner/alertas', label: 'Alertas', testid: 'tab-alertas' },
    { href: '/owner/finanzas', label: 'Finanzas', testid: 'tab-finanzas' },
    { href: '/owner/yo', label: 'Yo', testid: 'tab-yo' },
    { href: '/owner/previsiones', label: 'Previsiones', testid: 'tab-previsiones' },
    ...(insightsEnabled
      ? [{ href: '/owner/asistente', label: 'Asistente', testid: 'tab-asistente' }]
      : []),
  ] as const;
</script>

{#if !enabled}
  <p data-testid="owner-off">El Modo Dueño no está activo para este negocio.</p>
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
    </nav>
  </div>
{/if}

<style>
  .owner-shell {
    min-height: 100dvh;
    background:
      radial-gradient(120% 80% at 10% -10%, #1c3a2e 0%, transparent 55%),
      linear-gradient(180deg, #121820 0%, var(--owner-bg) 40%);
    color: var(--owner-fg);
    display: flex;
    flex-direction: column;
    max-width: 28rem;
    margin: 0 auto;
    font-family: var(--font-sans);
  }
  .owner-brand {
    padding: 1.25rem 1.25rem 0.5rem;
  }
  .brand {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-family: var(--font-heading);
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
    grid-template-columns: repeat(5, 1fr);
    gap: 0.25rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--owner-surface) 92%, black);
    border-top: 1px solid var(--owner-border);
  }
  .owner-tabs a {
    text-align: center;
    text-decoration: none;
    color: var(--owner-muted);
    /* S15-H1: target táctil ≥44px (WCAG 2.1 AA) — antes ~36px. */
    padding: 0.85rem 0.25rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .owner-tabs a.active {
    color: var(--owner-accent);
    font-weight: 600;
  }
</style>
