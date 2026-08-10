<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isOwnerModeEnabled, isReportingCatalogEnabled } from '$lib/features';
  import {
    createMemoryOwnerRollupIdb,
    formatStaleBanner,
    loadOwnerDayView,
    type OwnerRollupSnapshot,
  } from '$lib/owner-offline-rollup/cache';
  import Icon from '$lib/ui/Icon.svelte';

  const enabled = isOwnerModeEnabled();
  const rankingLive = isReportingCatalogEnabled();
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let branches = $state<Array<{ branch_id: string; net_sales_cents: number }>>([]);

  const idb = createMemoryOwnerRollupIdb();

  onMount(() => {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    void loadOwnerDayView(
      {
        idb,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        nowMs: Date.now(),
        fetchDaySummary: async () => {
          if (!rankingLive) {
            return {
              totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
              branches: [{ branch_id: 'local' }],
              rankingClaimFrozen: true,
            };
          }
          return {
            totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
            branches: [{ branch_id: 'local', net_sales_cents: 0 }],
            rankingClaimFrozen: false,
          };
        },
      },
      'tenant',
      'local',
      today,
    ).then((view) => {
      snap = view.snapshot;
      banner = view.banner;
      if (view.fromCache && view.snapshot) {
        banner = formatStaleBanner(view.snapshot.cachedAtMs, Date.now());
      }
      if (rankingLive) {
        branches = [
          {
            branch_id: view.snapshot?.branchId ?? 'local',
            net_sales_cents: view.snapshot?.netSalesCents ?? 0,
          },
        ];
      }
    });
  });
</script>

<svelte:head><title>Locales · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-locales">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="store" size={12} /> Modo Dueño · Locales</p>
        <h1 class="page-title">Ranking de locales</h1>
        <p class="page-lede">
          {rankingLive
            ? 'Ranking por sucursal desde rollups D1 (GTM-03). Nunca se presenta como tiempo real.'
            : 'Ranking por sucursal no está en vivo. Activa FEATURE_REPORTING_CATALOG tras QG Sprint 9.'}
        </p>
      </div>
    </div>

    {#if banner}
      <div class="status-alert warning" data-testid="stale-banner">
        <Icon name="clock" size={16} />
        <span>{banner}</span>
      </div>
    {/if}

    {#if rankingLive}
      <div class="glass-card locales-card">
        <div class="card-header">
          <h2>Ventas netas por sucursal</h2>
          <span class="section-tag">Rollup D1</span>
        </div>
        {#if branches.length === 0}
          <div class="empty-ranking">
            <Icon name="store" size={28} />
            <span>Sin datos de rollup aún</span>
          </div>
        {:else}
          <ol class="branch-ranking" data-testid="branch-ranking">
            {#each branches as b, i}
              <li class="branch-item">
                <span class="rank-pos">#{i + 1}</span>
                <span class="rank-name">
                  <Icon name="store" size={14} />
                  {b.branch_id}
                </span>
                <span class="rank-amount tabular-nums">{formatCents(b.net_sales_cents)}</span>
              </li>
            {/each}
          </ol>
        {/if}
        <p class="gtm-note" data-testid="gtm11-note">GTM-11: offline = cache + banner antigüedad</p>
      </div>
    {:else}
      {#if snap}
        <div class="status-alert info">
          <Icon name="clock" size={16} />
          <span>Último cache local disponible — ranking no activo.</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .locales-card {
    padding: 1.25rem;
  }

  .empty-ranking {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
    color: var(--text-dim);
    font-size: 0.9375rem;
  }

  .branch-ranking {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .branch-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    transition: border-color var(--transition-fast);
  }

  .branch-item:hover {
    border-color: var(--border-glow);
  }

  .rank-pos {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--accent-primary);
    min-width: 2rem;
  }

  .rank-name {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9375rem;
    color: var(--text-main);
    flex: 1;
  }

  .rank-amount {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: var(--emerald-green);
  }

  .gtm-note {
    margin-top: 1rem;
    font-size: 0.75rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
</style>
