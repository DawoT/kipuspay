<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isOwnerModeEnabled } from '$lib/features';
  import {
    createMemoryOwnerRollupIdb,
    loadOwnerDayView,
    type OwnerRollupSnapshot,
  } from '$lib/owner-offline-rollup/cache';

  const enabled = isOwnerModeEnabled();
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let fromCache = $state(false);

  const idb = createMemoryOwnerRollupIdb();

  async function refresh(online: boolean) {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const view = await loadOwnerDayView(
      {
        idb,
        online,
        nowMs: Date.now(),
        fetchDaySummary: async () => {
          // Stub local: sin red real en unit; PWA usa cache hasta API.
          return {
            totals: {
              grossSalesCents: snap?.grossSalesCents ?? 0,
              netSalesCents: snap?.netSalesCents ?? 0,
              docCount: snap?.docCount ?? 0,
            },
            branches: [{ branch_id: 'local' }],
          };
        },
      },
      'tenant',
      'local',
      today,
    );
    snap = view.snapshot;
    banner = view.banner;
    fromCache = view.fromCache;
  }

  onMount(() => {
    if (!enabled) return;
    void refresh(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const onOnline = () => void refresh(true);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });
</script>

{#if enabled}
  <section class="hoy" data-testid="owner-hoy">
    <h1>Hoy</h1>
    <p class="lede">Resumen accionable del día — sin scroll infinito.</p>
    {#if banner}
      <p class="stale" data-testid="stale-banner">{banner}</p>
    {/if}
    <p class="metric" data-testid="hoy-net">
      Ventas netas
      <strong>S/ {formatCents(snap?.netSalesCents ?? 0)}</strong>
    </p>
    <p class="metric" data-testid="hoy-docs">
      Comprobantes <strong>{snap?.docCount ?? 0}</strong>
    </p>
    <p class="meta" data-testid="hoy-source">
      {fromCache ? 'Desde cache local' : 'Actualizado al conectar'} · no en vivo
    </p>
  </section>
{/if}

<style>
  .hoy {
    flex: 1;
    padding: 1rem 1.25rem 5rem;
  }
  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.35rem;
  }
  .lede {
    margin: 0 0 1.25rem;
    color: var(--owner-muted, #8b9aab);
    font-size: 0.95rem;
  }
  .stale {
    margin: 0 0 1rem;
    padding: 0.65rem 0.75rem;
    background: #2a2418;
    color: #e6c07b;
    font-size: 0.85rem;
  }
  .metric {
    margin: 0 0 0.85rem;
    padding: 1rem;
    background: var(--owner-surface, #1a222c);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .metric strong {
    font-size: 1.35rem;
    color: var(--owner-accent, #3d9a6a);
  }
  .meta {
    margin-top: 1.25rem;
    color: var(--owner-muted, #8b9aab);
    font-size: 0.8rem;
  }
</style>
