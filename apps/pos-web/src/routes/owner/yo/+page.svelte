<script lang="ts">
  import { onMount } from 'svelte';
  import { isAgenticInsightsEnabled, isOwnerModeEnabled } from '$lib/features';
  import { computeGrowthMetrics, type GrowthEvent } from '$lib/growth/metrics';
  import { readTenantSession, writeTenantSession } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';
  import { apiFetch } from '$lib/auth/api-client';
  import { ownerOverflowLinks } from '$lib/ui/owner-nav';

  const enabled = isOwnerModeEnabled();
  const moreLinks = ownerOverflowLinks(isAgenticInsightsEnabled());
  let planLabel = $state('Plan: Arranque (lectura)');
  let inviteUrl = $state('');
  let referralCode = $state('');
  let metricsLabel = $state({
    ttfs: 'n/d',
    upgrade: 'n/d',
    activation: 'n/d',
    nrr: 'n/d',
    kFactor: 'n/d',
  });

  onMount(() => {
    let s = readTenantSession(sessionStorage);
    planLabel = `Plan: Arranque · ${s.formalizationMode}`;

    void (async () => {
      try {
        const metricsRes = await apiFetch('/api/growth/events', { storage: localStorage });
        if (metricsRes.ok) {
          const payload = (await metricsRes.json()) as { events?: GrowthEvent[] };
          const snap = computeGrowthMetrics(payload.events ?? []);
          metricsLabel = {
            ttfs: snap.ttfsMsP80 == null ? 'n/d' : `${Math.round(snap.ttfsMsP80 / 1000)}s`,
            upgrade: snap.formalizationUpgradeRate == null ? 'n/d' : `${Math.round(snap.formalizationUpgradeRate * 100)}%`,
            activation: snap.trialToPaidRate == null ? 'n/d' : `${Math.round(snap.trialToPaidRate * 100)}%`,
            nrr: snap.nrrProxy === 'n/d' || snap.nrrProxy == null ? 'n/d' : `${Math.round(snap.nrrProxy * 100)}%`,
            kFactor: snap.kFactor == null ? 'n/d' : String(snap.kFactor),
          };
        }
      } catch {
        /* métricas n/d si la API no está */
      }
      try {
        const res = await apiFetch('/v1/referrals/code', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId: s.tenantId }),
        });
        if (res.ok) {
          const body = (await res.json()) as { code?: string; inviteUrl?: string };
          if (body.code) {
            referralCode = body.code;
            inviteUrl = body.inviteUrl ?? '';
            s = { ...s, referralCode: body.code };
            writeTenantSession(sessionStorage, s);
          }
        }
      } catch { /* soft-launch offline */ }
    })();
  });
</script>

<svelte:head><title>Mi Perfil · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-yo">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="user" size={12} /> Perfil</p>
        <h1 class="page-title">Mi perfil</h1>
        <p class="page-lede">Plan, referidos, métricas de negocio y atajos.</p>
      </div>
      <a class="link-action" href="/admin/configuracion?focus=facturacion" data-testid="activar-facturacion">
        <Icon name="receipt" size={14} />
        Activar facturación electrónica
      </a>
    </div>

    {#if moreLinks.length > 0}
      <nav class="more-links" aria-label="Más en Modo Dueño">
        {#each moreLinks as item (item.href)}
          <a href={item.href} data-testid={item.testid}>{item.label}</a>
        {/each}
      </nav>
    {/if}

    <!-- Plan -->
    <div class="ledger-card plan-card" data-testid="plan-label">
      <div class="card-header">
        <h2>Plan actual</h2>
        <span class="badge badge-success">Activo</span>
      </div>
      <p class="plan-text">{planLabel}</p>
    </div>

    <div class="yo-grid">
      <!-- Referidos -->
      <div class="ledger-card section-pad" data-testid="owner-invite">
        <div class="card-header">
          <h2>Invita un negocio</h2>
          <Icon name="gift" size={16} />
        </div>
        <p class="invite-text">Un mes gratis para quien refiere y un mes para quien llega por tu enlace.</p>
        <div class="referral-box">
          <span class="referral-label">Código</span>
          <span class="referral-code" data-testid="referral-code">{referralCode || 'Generando…'}</span>
        </div>
        {#if inviteUrl}
          <div class="referral-box">
            <span class="referral-label">Enlace</span>
            <span class="referral-url" data-testid="invite-url">{inviteUrl}</span>
          </div>
        {/if}
      </div>

      <!-- Métricas -->
      <div class="ledger-card section-pad" data-testid="growth-metrics">
        <div class="card-header">
          <h2>Rendimiento del terminal</h2>
          <Icon name="trending-up" size={16} />
        </div>
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">Respuesta de cobro</span>
            <span class="metric-value" data-testid="metric-ttfs">{metricsLabel.ttfs}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Upgrade form.</span>
            <span class="metric-value" data-testid="metric-upgrade">{metricsLabel.upgrade}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Prueba → pago</span>
            <span class="metric-value" data-testid="metric-activation">{metricsLabel.activation}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">NRR (proxy)</span>
            <span class="metric-value" data-testid="metric-nrr">{metricsLabel.nrr}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">K-factor</span>
            <span class="metric-value" data-testid="metric-kfactor">{metricsLabel.kFactor}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .more-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .more-links a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .plan-card {
    padding: 1.25rem;
    margin-bottom: 0;
  }

  .plan-text {
    font-family: var(--font-mono);
    font-size: 0.9375rem;
    color: var(--accent-primary);
    font-weight: 600;
  }

  .yo-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }


  .invite-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.875rem;
  }

  .referral-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    margin-bottom: 0.5rem;
  }

  .referral-label {
    font-size: 0.75rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 3.5rem;
  }

  .referral-code {
    font-family: var(--font-mono);
    font-size: 0.9375rem;
    color: var(--emerald-green);
    font-weight: 700;
  }

  .referral-url {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-main);
    word-break: break-all;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .metric-item {
    padding: 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .metric-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
  }

  .metric-value {
    font-family: var(--font-mono);
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--accent-primary);
  }

  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 38px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  @media (max-width: 600px) {
    .yo-grid { grid-template-columns: 1fr; }
    .metrics-grid { grid-template-columns: 1fr; }
  }
</style>
