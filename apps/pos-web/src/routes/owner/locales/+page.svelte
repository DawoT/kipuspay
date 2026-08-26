<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isOwnerModeEnabled,
    isReportingCatalogEnabled,
    isStockTransfersEnabled,
    isInventoryLocationsEnabled,
  } from '$lib/features';
  import { buildChainRanking, type ChainBranchView } from '$lib/owner/chain-ranking';
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
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const enabled = isOwnerModeEnabled();
  // rankingLive sigue siendo reporting_catalog (plan), pero la vista premium cadena
  // decora con operativo si stock.transfers / inventory.locations están activos
  const rankingLive = isReportingCatalogEnabled();
  const transfersOn = isStockTransfersEnabled();
  const locationsOn = isInventoryLocationsEnabled();
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let branches = $state<Array<{ branch_id: string; net_sales_cents: number; doc_count: number }>>([]);
  let ranked = $state<ChainBranchView[]>([]);
  let loading = $state(false);
  let refreshLabel = $state<string | null>(null);
  let transfersMap = $state<Map<string, number>>(new Map());
  let alertsMap = $state<Map<string, number>>(new Map());

  const idb = createMemoryOwnerRollupIdb();

  const emptyDay = {
    totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
    branches: [] as Array<{ branch_id: string; net_sales_cents: number; doc_count: number }>,
    claimFrozen: true,
  };

  async function loadOperationalMaps(): Promise<{ tMap: Map<string, number>; aMap: Map<string, number> }> {
    const tMap = new Map<string, number>();
    const aMap = new Map<string, number>();
    const apiBase = resolveApiBase(localStorage);
    const authorization = resolveApiAuth(localStorage).authorization ?? '';
    if (transfersOn) {
      try {
        const res = await fetch(`${apiBase}/api/owner/transfers/pending`, {
          headers: { authorization },
        });
        if (res.ok) {
          const json = (await res.json()) as {
            pending?: Array<{ from_branch_id: string; to_branch_id: string }>;
          };
          for (const p of json.pending ?? []) {
            tMap.set(p.from_branch_id, (tMap.get(p.from_branch_id) ?? 0) + 1);
            tMap.set(p.to_branch_id, (tMap.get(p.to_branch_id) ?? 0) + 1);
          }
        }
      } catch {
        // offline: sin mapa
      }
    }
    if (locationsOn) {
      try {
        const res = await fetch(`${apiBase}/api/owner/stock-alerts`, {
          headers: { authorization },
        });
        if (res.ok) {
          const json = (await res.json()) as { alerts?: Array<{ branchId?: string; branch_id?: string }> };
          for (const a of json.alerts ?? []) {
            const bid = (a.branchId ?? a.branch_id ?? '') as string;
            if (bid) aMap.set(bid, (aMap.get(bid) ?? 0) + 1);
          }
        }
      } catch {
        // offline
      }
    }
    return { tMap, aMap };
  }

  async function loadRanking(reportDate: string) {
    if (!rankingLive) return emptyDay;
    const apiBase = resolveApiBase(localStorage);
    const authorization = resolveApiAuth(localStorage).authorization ?? '';
    try {
      const res = await fetch(`${apiBase}/api/owner/day-summary?date=${reportDate}`, {
        headers: { authorization },
      });
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

  function recomputeRanked() {
    const maps = { tMap: transfersMap, aMap: alertsMap };
    ranked = buildChainRanking(
      branches.map((b) => ({
        branchId: b.branch_id,
        netSalesCents: b.net_sales_cents,
        docCount: b.doc_count,
        pendingTransfers: transfersOn ? (maps.tMap.get(b.branch_id) ?? 0) : 0,
        lowStockAlerts: locationsOn ? (maps.aMap.get(b.branch_id) ?? 0) : 0,
      })),
    );
  }

  async function refreshAll() {
    if (!enabled) return;
    loading = true;
    const t0 = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    // feedback <100ms: banner optimista instantáneo
    const viewPromise = loadOwnerDayView(
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
    );
    const rankingPromise = loadRanking(today);
    const opsPromise = loadOperationalMaps();
    const [view, ranking, ops] = await Promise.all([viewPromise, rankingPromise, opsPromise]);
    snap = view.snapshot;
    banner = view.banner;
    if (view.fromCache && view.snapshot) {
      banner = formatStaleBanner(view.snapshot.cachedAtMs, Date.now());
    }
    if (rankingLive && ranking.branches.length > 0) {
      branches = ranking.branches;
    }
    transfersMap = ops.tMap;
    alertsMap = ops.aMap;
    recomputeRanked();
    const elapsed = Date.now() - t0;
    // garantizar feedback visible inmediato aunque fetch rápida
    if (elapsed < 80) await new Promise((r) => setTimeout(r, 80 - elapsed));
    const now = new Date();
    refreshLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    loading = false;
  }

  onMount(() => {
    if (!enabled) return;
    void refreshAll();
  });

  $effect(() => {
    // recompute si branches cambian y mapas listos (reactivo)
    void branches;
    void transfersMap;
    void alertsMap;
    if (branches.length > 0) recomputeRanked();
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
        {#if refreshLabel}
          <p class="refresh-meta" data-testid="locales-refresh-ts">
            Actualizado a las {refreshLabel} · <span class="tabular-nums">{ranked.length} sede(s)</span>
          </p>
        {/if}
      </div>
      {#if rankingLive}
        <Button
          variant="secondary"
          icon="refresh"
          data-testid="locales-refresh"
          onclick={refreshAll}
          disabled={loading}
          busy={loading}
        >
          Actualizar
        </Button>
      {/if}
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

        {#if loading && ranked.length === 0}
          <div data-testid="locales-skeleton">
            <Skeleton lines={4} />
            <p class="loading-hint">Cargando ranking…</p>
          </div>
        {:else if ranked.length === 0}
          <EmptyState
            icon="store"
            title="Sin ranking aún"
            description="Cuando haya ventas, aparece el resumen por local."
          >
            <Button variant="secondary" href="/">Ir a cobrar</Button>
          </EmptyState>
        {:else}
          <ol class="branch-ranking" data-testid="branch-ranking">
            {#each ranked as b}
              <li
                class="branch-item"
                class:podium-gold={b.rank === 1}
                class:podium-silver={b.rank === 2}
                class:podium-bronze={b.rank === 3}
                data-testid="branch-row-{b.branchId}"
              >
                <span class="rank-pos">#{b.rank}</span>
                <span class="rank-badge tone-{b.badgeTone}">{b.badgeLabel}</span>
                <span class="rank-name">
                  <Icon name="store" size={14} />
                  {b.branchId}
                </span>
                <span class="rank-docs tabular-nums">{b.docCount} ventas</span>
                <span class="rank-amount tabular-nums">{formatCents(b.netSalesCents)}</span>
              </li>
              {#if transfersOn || locationsOn}
                <div class="branch-ops" data-testid="branch-ops-{b.branchId}">
                  {#if transfersOn && b.pendingTransfers > 0}
                    <span class="ops-chip ops-transfers" data-testid="chip-transfers-{b.branchId}">
                      <Icon name="truck" size={12} />
                      {b.pendingTransfers} en camino
                    </span>
                  {/if}
                  {#if locationsOn && b.lowStockAlerts > 0}
                    <span class="ops-chip ops-alert" data-testid="chip-alert-{b.branchId}">
                      <Icon name="alert" size={12} />
                      {b.lowStockAlerts} alerta(s)
                    </span>
                  {/if}
                  {#if transfersOn && b.pendingTransfers === 0 && locationsOn && b.lowStockAlerts === 0}
                    <span class="ops-chip ops-ok">Al día</span>
                  {/if}
                </div>
              {/if}
            {/each}
          </ol>
        {/if}
        <p class="gtm-note" data-testid="gtm11-note">
          Sin red se muestra el último resumen guardado y hace cuánto se actualizó.
        </p>
      </div>

      {#if transfersOn}
        <div class="ledger-card ops-card" data-testid="ops-transfers-card">
          <div class="card-header">
            <h3>Operativo cadena</h3>
            <span class="section-tag">Transferencias</span>
          </div>
          <p class="ops-lede">
            Mercadería en tránsito por sede · Trazabilidad completa en <a href="/owner/transferencias"
              >Transferencias</a
            >
          </p>
        </div>
      {/if}
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
    padding: var(--inset-card);
  }

  .refresh-meta {
    margin-top: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
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
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    min-height: 44px;
  }

  .branch-item:hover {
    border-color: var(--border-glow);
    box-shadow: var(--shadow-sm);
  }

  .podium-gold {
    border-color: rgba(212, 175, 55, 0.45);
    background: linear-gradient(135deg, rgba(212, 175, 55, 0.12), var(--bg-glass));
  }

  .podium-silver {
    border-color: rgba(160, 160, 160, 0.35);
    background: linear-gradient(135deg, rgba(160, 160, 160, 0.1), var(--bg-glass));
  }

  .podium-bronze {
    border-color: rgba(205, 127, 50, 0.35);
    background: linear-gradient(135deg, rgba(205, 127, 50, 0.1), var(--bg-glass));
  }

  .rank-pos {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--accent-primary);
    min-width: 2rem;
  }

  .rank-badge {
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.125rem 0.375rem;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tone-lider {
    color: var(--accent-primary);
    border-color: rgba(212, 175, 55, 0.35);
    background: rgba(212, 175, 55, 0.12);
  }

  .tone-alza {
    color: var(--emerald-green);
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.25);
  }

  .tone-estable {
    color: var(--text-dim);
    background: var(--bg-button-sec);
  }

  .rank-name {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9375rem;
    color: var(--text-main);
    flex: 1;
    font-weight: 600;
  }

  .rank-docs {
    font-size: 0.75rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .rank-amount {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: var(--emerald-green);
  }

  .branch-ops {
    display: flex;
    gap: 0.5rem;
    padding-left: 3.25rem;
    margin-top: -0.25rem;
    margin-bottom: 0.25rem;
    flex-wrap: wrap;
  }

  .ops-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    min-height: 28px;
  }

  .ops-transfers {
    color: var(--accent-primary);
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.2);
  }

  .ops-alert {
    color: var(--rose-red);
    background: rgba(244, 63, 94, 0.1);
    border-color: rgba(244, 63, 94, 0.2);
  }

  .ops-ok {
    color: var(--emerald-green);
    background: rgba(16, 185, 129, 0.1);
  }

  .ops-card {
    margin-top: 1rem;
    padding: var(--inset-card);
  }

  .ops-lede {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .ops-lede a {
    color: var(--accent-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .gtm-note {
    margin-top: 1rem;
    font-size: 0.75rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .loading-hint {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-dim);
  }
</style>
