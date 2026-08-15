<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isVitrinaEnabled } from '$lib/features';

  import Icon from '$lib/ui/Icon.svelte';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';
  import { subscribeVitrina, type VitrinaSnapshot } from '$lib/vitrina/channel';
  import { vitrinaHeading, vitrinaPhaseLabel } from '$lib/vitrina/vitrina-copy';

  const enabled = isVitrinaEnabled();
  let snap = $state<VitrinaSnapshot>({
    totalCents: 0,
    itemCount: 0,
    documentType: '—',
    phase: 'idle',
    message: 'Esperando cobro…',
  });

  onMount(() => {
    if (!enabled) return;
    return subscribeVitrina((s) => {
      snap = s;
    });
  });
</script>

<svelte:head><title>Vitrina Cliente · KipusPay</title></svelte:head>

<div class="vitrina-container" data-testid="vitrina-root">
  {#if !enabled}
    <div class="feature-off-banner" data-testid="vitrina-off">
      <Icon name="info" size={18} />
      <span>La vitrina está desactivada para esta tienda.</span>
    </div>
  {:else}
    <div class="ledger-card vitrina-card" data-testid="vitrina">
      <div class="vitrina-masthead">
        <div class="brand-logo">
          <BrandKnot size={18} />
        </div>
        <p class="page-eyebrow">Pantalla de Cliente</p>
        <h1 class="page-title">{vitrinaHeading(snap.brandLabel)}</h1>
      </div>

      <div class="phase-badge">
        <span class="badge {snap.phase === 'charged' ? 'badge-success' : 'badge-warning'}" data-testid="vitrina-phase">
          {vitrinaPhaseLabel(snap.phase)}
        </span>
      </div>

      <div class="display-box">
        <span class="display-label">Total</span>
        <span class="display-amount tabular-nums" data-testid="vitrina-total">
          S/ {formatCents(snap.totalCents)}
        </span>
      </div>

      <p class="vitrina-msg" data-testid="vitrina-message">{snap.message}</p>

      {#if snap.phase === 'charged'}
        <div class="brand-footer">
          {#if snap.brandLabel}
            <p class="brand" data-testid="vitrina-brand">{snap.brandLabel}</p>
          {/if}
          {#if snap.brandUrl}
            <p class="brand-url" data-testid="vitrina-brand-url">{snap.brandUrl}</p>
          {/if}
          <p class="kipus-foot">Emitido con KipusPay</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .vitrina-container {
    min-height: 85vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .vitrina-card {
    max-width: 32rem;
    width: 100%;
    padding: 2.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }

  .vitrina-masthead {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
  }

  .brand-logo {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: var(--radius-full);
    background: rgba(217, 154, 61, 0.15);
    border: 1px solid var(--border-glow);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-primary);
    margin-bottom: 0.5rem;
  }

  .display-box {
    width: 100%;
    background: var(--bg-glass);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .display-label {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }

  .display-amount {
    font-family: var(--font-mono);
    font-size: 3rem;
    font-weight: 800;
    color: var(--accent-primary);
  }

  .vitrina-msg {
    font-size: 1.125rem;
    color: var(--text-main);
    line-height: 1.4;
  }

  .brand-footer {
    border-top: 1px solid var(--border-subtle);
    padding-top: 1rem;
    width: 100%;
  }

  .brand {
    font-weight: 700;
    color: var(--emerald-green);
  }

  .brand-url {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .kipus-foot {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: var(--text-dim);
  }
</style>
