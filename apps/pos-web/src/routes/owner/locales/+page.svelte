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
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const enabled = isOwnerModeEnabled();
  const rankingLive = isReportingCatalogEnabled();
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let branches = $state<Array<{ branch_id: string; net_sales_cents: number; doc_count: number }>>([]);

  const idb = createMemoryOwnerRollupIdb();

  const emptyDay = {
    totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
    branches: [] as Array<{ branch_id: string; net_sales_cents: number; doc_count: number }>,
    claimFrozen: true,
  };

  async function loadRanking(reportDate: string) {
    if (!rankingLive) return emptyDay;
    const apiBase = resolveApiBase(localStorage);
    const authorization = resolveApiAuth(localStorage).authorization ?? '';
    try {
      const res = await fetch(
        `${(apiBase)}/api/owner/day-summary?date=${reportDate}`,
        { headers: { authorization } },
      );
      if (!res.ok) return emptyDay;
      const json = (await res.json()) as {
        totals?: { grossSalesCents: number; netSalesCents: number; docCount: number };
        branches?: Array<{ branch_id: string; net_sales_cents: number; doc_count: number }>;
        rankingClaimFrozen?: boolean;
      };
      return {
        totals: json.totals ?? emptyDay.totals,
        branches: json.branches ?? [],
        claimFrozen: json.rankingClaimFrozen ?? false,
      };
    } catch {
      return emptyDay;
    }
  }

  onMount(() => {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    void loadOwnerDayView(
      {
        idb,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        nowMs: Date.now(),
        fetchDaySummary: async (reportDate) => {
          const ranking = await loadRanking(reportDate);
          return { totals: ranking.totals, branches: ranking.branches };
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
    });
    void loadRanking(today).then((ranking) => {
      if (rankingLive && ranking.branches.length > 0) {
        branches = ranking.branches;
      }
    });
  });
</script>

<svelte:head><title>Locales · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-locales">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="store" size={12} /> Locales</p>
        <h1 class="page-title">Ranking de locales</h1>
        <p class="page-lede">
          {rankingLive
            ? 'Ranking por sucursal calculado por el servidor.'
            : 'El ranking por sucursal no está disponible para este negocio.'}
        </p>
      </div>
    </div>

    {#if banner}
      <StatusMessage tone="warning" data-testid="stale-banner">
        <Icon name="clock" size={16} />
        <span>{banner}</span>
      </StatusMessage>
    {/if}

    {#if rankingLive}
      <div class="ledger-card locales-card">
        <div class="card-header">
          <h2>Ventas netas por sucursal</h2>
          <span class="section-tag">Resumen del servidor</span>
        </div>
        {#if branches.length === 0}
          <EmptyState icon="store" title="Sin ranking aún" description="Cuando haya ventas, aparece el resumen por local.">
            <Button variant="secondary" href="/">Ir a cobrar</Button>
          </EmptyState>
        {:else}
          <ol class="branch-ranking" data-testid="branch-ranking">
            {#each branches as b, i}
              <li class="branch-item">
                <span class="rank-pos">#{i + 1}</span>
                <span class="rank-name">
                  <Icon name="store" size={14} />
                  Local {i + 1}
                </span>
                <span class="rank-amount tabular-nums">{formatCents(b.net_sales_cents)}</span>
              </li>
            {/each}
          </ol>
        {/if}
        <p class="gtm-note" data-testid="gtm11-note">Sin red se muestra el último resumen guardado y hace cuánto se actualizó.</p>
      </div>
    {:else}
      {#if snap}
        <StatusMessage tone="info">
          <Icon name="clock" size={16} />
          <span>Último cache local disponible — ranking no activo.</span>
        </StatusMessage>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .locales-card {
    padding: 1.25rem;
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
