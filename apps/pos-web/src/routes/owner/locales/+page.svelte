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

{#if enabled}
  <section class="locales" data-testid="owner-locales">
    <h1>Locales</h1>
    {#if rankingLive}
      <p class="lede" data-testid="locales-live">
        Ranking por sucursal desde rollups D1 (GTM-03). Nunca se presenta como tiempo real.
      </p>
      {#if banner}
        <p class="stale" data-testid="stale-banner">{banner}</p>
      {/if}
      <ol data-testid="branch-ranking">
        {#each branches as b, i}
          <li>
            #{i + 1} {b.branch_id} — S/ {formatCents(b.net_sales_cents)}
          </li>
        {:else}
          <li>Sin datos de rollup aún</li>
        {/each}
      </ol>
      <p class="meta" data-testid="gtm11-note">GTM-11: offline = cache + banner antigüedad</p>
    {:else}
      <p class="lede" data-testid="locales-frozen">
        Ranking por sucursal no está en vivo. Activa FEATURE_REPORTING_CATALOG tras QG Sprint 9.
      </p>
      {#if snap}
        <p class="meta">Último cache local disponible (no ranking live).</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .locales {
    padding: 1rem 1.25rem 5rem;
  }
  .lede {
    color: var(--owner-muted, #8b9aab);
  }
  .stale {
    margin: 0 0 1rem;
    padding: 0.65rem 0.75rem;
    background: #2a2418;
    color: #e6c07b;
    font-size: 0.85rem;
  }
  .meta {
    margin-top: 1rem;
    color: var(--owner-muted, #8b9aab);
    font-size: 0.8rem;
  }
</style>
