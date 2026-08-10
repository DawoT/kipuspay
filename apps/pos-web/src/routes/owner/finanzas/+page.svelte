<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isLedgerArApEnabled, isOwnerModeEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const enabled = isOwnerModeEnabled();
  const ledger = isLedgerArApEnabled();
</script>

<svelte:head><title>Finanzas · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-finanzas">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="trending-up" size={12} /> Modo Dueño · Finanzas</p>
        <h1 class="page-title">Finanzas</h1>
        <p class="page-lede">CxC, CxP y egresos consolidados — vista de solo lectura.</p>
      </div>
    </div>

    {#if !ledger}
      <div class="feature-off-banner" data-testid="ledger-gated">
        <Icon name="info" size={18} />
        <span>Ledger desactivado (<code>FEATURE_LEDGER_AR_AP</code> off).</span>
      </div>
    {:else}
      <div class="finanzas-grid">
        <div class="glass-card fin-card">
          <div class="card-header">
            <h2>Cuentas por cobrar</h2>
            <Icon name="trending-up" size={16} class="icon-emerald" />
          </div>
          <p class="fin-placeholder">Módulo disponible próximamente.</p>
        </div>
        <div class="glass-card fin-card">
          <div class="card-header">
            <h2>Cuentas por pagar</h2>
            <Icon name="trending-down" size={16} class="icon-rose" />
          </div>
          <p class="fin-placeholder">Módulo disponible próximamente.</p>
        </div>
        <div class="glass-card fin-card">
          <div class="card-header">
            <h2>Egresos de caja</h2>
            <Icon name="dollar" size={16} class="icon-accent" />
          </div>
          <p class="fin-placeholder">Módulo disponible próximamente.</p>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .finanzas-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }

  .fin-card {
    padding: 1.25rem;
  }

  .fin-placeholder {
    color: var(--text-dim);
    font-size: 0.9375rem;
    margin-top: 0.5rem;
  }

  :global(.icon-emerald) {
    color: var(--emerald-green);
  }
  :global(.icon-rose) {
    color: var(--rose-red);
  }
  :global(.icon-accent) {
    color: var(--accent-primary);
  }

  @media (max-width: 700px) {
    .finanzas-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
