<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { createForecastingClient } from '$lib/forecasting/forecasting-client';
  import { isAnalyticsForecastingEnabled, isOwnerModeEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { stockKindLabel } from '$lib/ui/ops-copy';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const ownerOn = isOwnerModeEnabled();
  const forecastOn = isAnalyticsForecastingEnabled();

  let branchId = $state('');
  let status = $state('');
  let loading = $state(false);
  let items = $state<
    {
      product_id: string;
      forecast_date: string;
      predicted_qty: number;
      predicted_gross_cents: number;
      confidence_low_qty: number | null;
      confidence_high_qty: number | null;
      model_version: string;
    }[]
  >([]);
  let alerts = $state<
    {
      product_id: string;
      status: string;
      daysCovered: number | null;
      suggestedReorderQty: number | null;
      targetDays: number;
    }[]
  >([]);
  let refreshMsg = $state('');
  let disclaimer = $state('');

  const client = createForecastingClient({
    apiBase: resolveApiBase(),
    authorization: resolveApiAuth().authorization ?? '',
  });

  async function load() {
    if (!ownerOn || !forecastOn) return;
    loading = true;
    status = 'Cargando…';
    try {
      const [list, alertRes] = await Promise.all([
        client.list(branchId),
        client.alerts(branchId, { leadTimeDays: 3, safetyStockDays: 6 }),
      ]);
      items = [...list.items];
      alerts = [...alertRes.items];
      disclaimer = list.disclaimer;
      status = `${items.length} pronóstico(s)`;
    } catch (e) {
      const code = (e as Error).message;
      if (code === 'PLAN_REQUIRES_CADENA') status = 'Requiere plan Cadena o Enterprise';
      else if (code === 'FEATURE_OFF') status = 'Las previsiones no están activas para este negocio';
      else status = 'Sin conexión — red offline';
      items = [];
      alerts = [];
    }
    loading = false;
  }

  async function refresh() {
    if (!ownerOn || !forecastOn) return;
    refreshMsg = 'Recalculando…';
    try {
      const res = await client.refresh(branchId);
      refreshMsg = `${res.written} reescrito(s), ${res.insufficient} con datos insuficientes`;
      await load();
    } catch (e) {
      refreshMsg = (e as Error).message;
    }
  }

  onMount(() => {
    if (ownerOn && forecastOn) void load();
  });

  function alertBadgeClass(status: string): string {
    if (status === 'STOCKOUT_RISK') return 'badge-danger';
    if (status === 'REORDER_SUGGESTED') return 'badge-warning';
    return 'badge-muted';
  }

  function daysUntil(iso: string): number {
    const target = new Date(`${iso}T00:00:00`).getTime();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((target - now.getTime()) / 86400000));
  }
</script>

<svelte:head><title>Previsiones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="owner-forecast">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="trending-up" size={12} /> Analítica predictiva</p>
      <h1 class="page-title">Previsiones de venta</h1>
      <p class="page-lede">Estimación estacional por producto y sucursal. No es garantía de venta.</p>
    </div>
    {#if ownerOn && forecastOn}
      <Button variant="secondary" data-testid="owner-forecast-refresh" onclick={refresh} disabled={loading} icon="refresh">
        Recalcular hoy
      </Button>
    {/if}
  </div>

  {#if !ownerOn || !forecastOn}
    <div class="feature-off-banner" data-testid="owner-forecast-off">
      <Icon name="info" size={18} />
      <span>Las previsiones no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="forecast-controls">
      <div class="ledger-card branch-card">
        <div class="field-group">
          <label for="forecast-branch">Sucursal</label>
          <input id="forecast-branch" data-testid="owner-forecast-branch" bind:value={branchId} />
        </div>
      </div>
      {#if status}
        <p class="status-line" data-testid="owner-forecast-status">{status}</p>
      {/if}
    </div>

    {#if refreshMsg}
      <p class="status-line" data-testid="owner-forecast-refresh-status">{refreshMsg}</p>
    {/if}

    <!-- Alertas de quiebre -->
    <div class="ledger-card alerts-card">
      <div class="card-header">
        <h2>Riesgo de quiebre</h2>
        <span class="badge {alerts.some((a) => a.status === 'STOCKOUT_RISK') ? 'badge-danger' : 'badge-success'}">
          {alerts.length}
        </span>
      </div>
      {#if alerts.length === 0}
        <EmptyState icon="check" title="Sin riesgo" description="El stock cubre el horizonte." />
      {:else}
        <ul class="alert-list" data-testid="owner-forecast-alerts">
          {#each alerts as a}
            <li class="alert-item">
              <span class="badge {alertBadgeClass(a.status)}">{stockKindLabel(a.status)}</span>
              <span class="alert-product">{a.product_id}</span>
              <span class="alert-detail">
                {a.daysCovered ?? 0} días cubiertos · objetivo {a.targetDays}
              </span>
              {#if a.suggestedReorderQty}
                <span class="alert-reorder">
                  <Icon name="truck" size={12} />
                  Sugerencia OC: {a.suggestedReorderQty}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Pronósticos -->
    <div class="ledger-card forecast-card" data-testid="owner-forecast-card">
      <div class="card-header">
        <h2>Pronósticos activos</h2>
        <span class="section-tag">Hoy en adelante</span>
      </div>
      {#if items.length === 0}
        <EmptyState icon="trending-up" title="Sin pronósticos" description="Ejecuta Recalcular hoy o espera el cálculo diario.">
          <Button variant="secondary" onclick={refresh} disabled={loading}>Recalcular hoy</Button>
        </EmptyState>
      {:else}
        <ul class="forecast-list" data-testid="owner-forecast-list">
          {#each items as f}
            <li class="forecast-item">
              <div class="forecast-main">
                <span class="forecast-product">{f.product_id}</span>
                <span class="forecast-date">en {daysUntil(f.forecast_date)} día(s)</span>
              </div>
              <div class="forecast-nums">
                <span class="forecast-qty tabular-nums">{f.predicted_qty} u</span>
                <span class="forecast-amount tabular-nums">{formatCents(f.predicted_gross_cents)}</span>
              </div>
              {#if f.confidence_low_qty != null && f.confidence_high_qty != null}
                <span class="forecast-range tabular-nums">
                  Rango {f.confidence_low_qty}–{f.confidence_high_qty} u
                </span>
              {/if}
              <span class="badge badge-muted model-badge">Estacional</span>
            </li>
          {/each}
        </ul>
        {#if disclaimer}
          <p class="disclaimer" data-testid="owner-forecast-disclaimer">⚠ {disclaimer} · estimación estacional</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .forecast-controls {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .branch-card {
    padding: 1rem;
  }

  .alerts-card,
  .forecast-card {
    padding: var(--inset-card);
  }

  

  .forecast-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .forecast-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    background: color-mix(in srgb, var(--owner-surface) 55%, transparent);
    border: 1px solid var(--owner-border);
    border-radius: 0.625rem;
    padding: 0.625rem 0.875rem;
  }

  .forecast-main {
    display: flex;
    flex-direction: column;
    min-width: 8rem;
  }

  .forecast-product {
    font-weight: 600;
  }

  .forecast-date {
    color: var(--owner-muted);
    font-size: 0.75rem;
  }

  .forecast-nums {
    display: flex;
    flex-direction: column;
    margin-left: auto;
    text-align: right;
  }

  .forecast-qty {
    font-weight: 700;
  }

  .forecast-amount {
    color: var(--owner-accent);
    font-size: 0.85rem;
  }

  .forecast-range {
    color: var(--owner-muted);
    font-size: 0.75rem;
  }

  .model-badge {
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .disclaimer {
    margin: 1rem 0 0;
    color: var(--owner-muted);
    font-size: 0.75rem;
  }
</style>
