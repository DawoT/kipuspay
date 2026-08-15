<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isCatalogUomEnabled,
    isCatalogVariantsEnabled,
    isInventoryOpsEnabled,
    isOwnerModeEnabled,
  } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { stockKindLabel, uomLabel } from '$lib/ui/ops-copy';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const ownerOn = isOwnerModeEnabled();
  const invOn = isInventoryOpsEnabled();
  const variantsOn = isCatalogVariantsEnabled() || isCatalogUomEnabled();

  let branchId = $state('');
  let status = $state('');
  let loading = $state(false);
  let alerts = $state<
    { kind: string; productId: string; detail: string; suggestReorderQty?: number }[]
  >([]);
  let variants = $state<
    { id: string; name: string; uom_code?: string; stock_microunits: number }[]
  >([]);

  async function loadAlerts() {
    loading = true;
    status = 'Cargando…';
    const apiBase = resolveApiBase(localStorage);
    const auth = resolveApiAuth(localStorage).authorization ?? '';
    const url = new URL(`${apiBase.replace(/\/$/, '')}/api/owner/stock-alerts`);
    url.searchParams.set('branchId', branchId);
    url.searchParams.set('expiryWarnDays', '30');
    try {
      const res = await fetch(url, { headers: { authorization: auth } });
      const json = (await res.json()) as {
        alerts?: typeof alerts;
        error?: string;
      };
      if (!res.ok) {
        status = json.error ?? 'error';
        alerts = [];
        loading = false;
        return;
      }
      alerts = json.alerts ?? [];
      if (variantsOn) {
        const catalogRes = await fetch(
          `${apiBase.replace(/\/$/, '')}/api/catalog/variants-uom`,
          { headers: { authorization: auth } },
        );
        const catalogJson = (await catalogRes.json()) as { items?: typeof variants };
        variants = catalogRes.ok ? (catalogJson.items ?? []) : [];
      }
      status = `${alerts.length} alerta(s)`;
    } catch {
      status = 'Sin conexión — red offline';
      alerts = [];
    }
    loading = false;
  }

  onMount(() => {
    if (ownerOn && invOn) void loadAlerts();
  });

  function alertBadgeClass(kind: string): string {
    if (kind === 'STOCKOUT' || kind === 'CRITICAL') return 'badge-danger';
    if (kind === 'REORDER_POINT' || kind === 'EXPIRING') return 'badge-warning';
    return 'badge-muted';
  }
</script>

<svelte:head><title>Alertas de stock · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="owner-stock-alerts">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="alert" size={12} /> Inventario</p>
      <h1 class="page-title">Alertas de stock</h1>
      <p class="page-lede">Quiebre, punto de reposición y lotes por vencer.</p>
    </div>
    {#if ownerOn && invOn}
      <Button variant="secondary" data-testid="owner-stock-refresh" onclick={loadAlerts} disabled={loading} icon="refresh">
        Actualizar
      </Button>
    {/if}
  </div>

  {#if !ownerOn || !invOn}
    <div class="feature-off-banner" data-testid="owner-stock-off">
      <Icon name="info" size={18} />
      <span>Las alertas de stock no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="stock-controls">
      <div class="ledger-card branch-card">
        <div class="field-group">
          <label for="stock-branch">Sucursal</label>
          <input id="stock-branch" data-testid="owner-stock-branch" bind:value={branchId} />
        </div>
      </div>
      {#if status}
        <p class="status-line" data-testid="owner-stock-status">{status}</p>
      {/if}
    </div>

    <!-- Alertas -->
    <div class="ledger-card alerts-card">
      <div class="card-header">
        <h2>Alertas activas</h2>
        <span class="badge {alerts.length > 0 ? 'badge-danger' : 'badge-success'}">
          {alerts.length}
        </span>
      </div>
      {#if alerts.length === 0}
        <EmptyState icon="check" title="Sin alertas" description="Tu stock está saludable.">
          <Button variant="secondary" href="/owner/compras">Ver compras</Button>
        </EmptyState>
      {:else}
        <ul class="alert-list" data-testid="owner-stock-list">
          {#each alerts as a}
            <li class="alert-item">
              <span class="badge {alertBadgeClass(a.kind)}">{stockKindLabel(a.kind)}</span>
              <span class="alert-product">{a.productId}</span>
              <span class="alert-detail">{a.detail}</span>
              {#if a.suggestReorderQty}
                <span class="alert-reorder">
                  <Icon name="truck" size={12} />
                  Sugerencia OC: {a.suggestReorderQty}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if variantsOn}
      <div class="ledger-card variants-card">
        <div class="card-header">
          <h2>Stock por variante</h2>
          <span class="section-tag">Unidades base</span>
        </div>
        <p class="hint-text">Vista agregada; los detalles se calculan sobre la unidad base de cada variante.</p>
        {#if variants.length === 0}
          <EmptyState icon="layers" title="Sin variantes" description="Configura variantes para ver su stock.">
            <Button variant="secondary" href="/admin/catalogo">Ir al catálogo</Button>
          </EmptyState>
        {:else}
          <ul class="variant-list" data-testid="owner-variant-stock">
            {#each variants as variant}
              <li class="variant-item">
                <span class="variant-name">{variant.name}</span>
                <span class="badge badge-muted">{uomLabel(variant.uom_code)}</span>
                <span class="variant-stock tabular-nums">{variant.stock_microunits / 1_000_000}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .stock-controls {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .branch-card {
    padding: 1rem;
  }

  .alerts-card,
  .variants-card {
    padding: 1.25rem;
  }

  

  .status-line {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .hint-text {
    font-size: 0.8125rem;
    color: var(--text-dim);
    margin-bottom: 0.875rem;
  }

  

  .alert-list,
  .variant-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .alert-item,
  .variant-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }

  .alert-product {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-main);
    font-weight: 600;
  }

  .alert-detail {
    font-size: 0.8125rem;
    color: var(--text-muted);
    flex: 1;
  }

  .alert-reorder {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--accent-primary);
    font-weight: 600;
  }

  .variant-name {
    font-weight: 600;
    color: var(--text-main);
    flex: 1;
  }

  .variant-stock {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--emerald-green);
  }
</style>
