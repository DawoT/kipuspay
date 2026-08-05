<script lang="ts">
  import { onMount } from 'svelte';
  import { isOwnerModeEnabled } from '$lib/features';
  import { computeGrowthMetrics, type GrowthEvent } from '$lib/growth/metrics';
  import { readTenantSession, writeTenantSession } from '$lib/tenant/session';

  const enabled = isOwnerModeEnabled();
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

    const demoEvents: GrowthEvent[] = [];
    if (s.onboardingStartedAtIso) {
      demoEvents.push({
        tenantId: s.tenantId,
        eventType: 'onboarding_started',
        occurredAtIso: s.onboardingStartedAtIso,
      });
    }
    if (s.firstSaleAtIso) {
      demoEvents.push({
        tenantId: s.tenantId,
        eventType: 'first_sale',
        occurredAtIso: s.firstSaleAtIso,
      });
    }
    const snap = computeGrowthMetrics(demoEvents);
    metricsLabel = {
      ttfs: snap.ttfsMsP80 == null ? 'n/d' : `${Math.round(snap.ttfsMsP80 / 1000)}s`,
      upgrade:
        snap.formalizationUpgradeRate == null
          ? 'n/d'
          : `${Math.round(snap.formalizationUpgradeRate * 100)}%`,
      activation:
        snap.trialToPaidRate == null ? 'n/d' : `${Math.round(snap.trialToPaidRate * 100)}%`,
      nrr: snap.nrrProxy === 'n/d' || snap.nrrProxy == null ? 'n/d' : `${Math.round(snap.nrrProxy * 100)}%`,
      kFactor: snap.kFactor == null ? 'n/d' : String(snap.kFactor),
    };

    void (async () => {
      try {
        const res = await fetch('/v1/referrals/code', {
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
      } catch {
        /* soft-launch offline */
      }
    })();
  });
</script>

{#if enabled}
  <section class="yo" data-testid="owner-yo">
    <h1>Yo</h1>
    <p class="lede">Plan, referidos, métricas de negocio y atajos.</p>
    <p class="plan" data-testid="plan-label">{planLabel}</p>

    <section class="invite" data-testid="owner-invite">
      <h2>Invita un negocio</h2>
      <p>Un mes gratis para quien refiere y un mes para quien llega por tu enlace.</p>
      <p data-testid="referral-code">{referralCode || 'Generando…'}</p>
      <p data-testid="invite-url">{inviteUrl || '—'}</p>
    </section>

    <section class="metrics" data-testid="growth-metrics">
      <h2>Metricas GTM §9</h2>
      <p data-testid="metric-ttfs">TTFS (p80): {metricsLabel.ttfs}</p>
      <p data-testid="metric-upgrade">Upgrade formalizacion: {metricsLabel.upgrade}</p>
      <p data-testid="metric-activation">Prueba → pago: {metricsLabel.activation}</p>
      <p data-testid="metric-nrr">NRR (proxy): {metricsLabel.nrr}</p>
      <p data-testid="metric-kfactor">K-factor: {metricsLabel.kFactor}</p>
    </section>

    <a
      class="cta"
      data-testid="activar-facturacion"
      href="/admin/configuracion?focus=facturacion"
    >
      Activar facturación electrónica
    </a>
  </section>
{/if}

<style>
  .yo {
    padding: 1rem 1.25rem 5rem;
  }
  h1 {
    margin: 0 0 0.35rem;
  }
  h2 {
    margin: 1.25rem 0 0.35rem;
    font-size: 1rem;
  }
  .lede {
    color: var(--owner-muted, #8b9aab);
  }
  .plan,
  .invite,
  .metrics {
    margin: 1rem 0;
    padding: 1rem;
    background: var(--owner-surface, #1a222c);
  }
  .cta {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.85rem 1rem;
    background: var(--owner-accent, #3d9a6a);
    color: #06140c;
    text-decoration: none;
    font-weight: 600;
  }
</style>
