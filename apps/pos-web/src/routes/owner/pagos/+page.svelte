<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isOwnerModeEnabled,
    isPaymentsCardAcquirerEnabled,
    isPaymentsQrWalletsEnabled,
  } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const ownerOn = isOwnerModeEnabled();
  const payOn = isPaymentsQrWalletsEnabled() || isPaymentsCardAcquirerEnabled();

  let status = $state('');
  let loading = $state(false);
  let rows = $state<{
    id: string;
    sale_id: string;
    acquirer: string;
    status: string;
    amount_cents: number;
    acquirer_ref: string | null;
  }[]>([]);

  async function load() {
    loading = true;
    status = 'Cargando…';
    const apiBase = resolveApiBase(localStorage);
    const auth = resolveApiAuth(localStorage).authorization ?? '';
    try {
      const res = await fetch(`${apiBase}/api/owner/payments/uncaptured`, {
        headers: { authorization: auth },
      });
      const json = (await res.json()) as { uncaptured?: typeof rows; error?: string };
      if (!res.ok) {
        status = json.error ?? 'error';
        rows = [];
      } else {
        rows = json.uncaptured ?? [];
        status = `${rows.length} pago(s) no conciliado(s)`;
      }
    } catch {
      status = 'Sin conexión — red offline';
      rows = [];
    }
    loading = false;
  }

  onMount(() => {
    if (ownerOn && payOn) void load();
  });
</script>

<svelte:head><title>Pagos no conciliados · KipusPay</title></svelte:head>

{#if ownerOn}
  <div class="page-shell" data-testid="owner-payments-uncaptured">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="credit-card" size={12} /> Modo Dueño · Pagos</p>
        <h1 class="page-title">Pagos no conciliados</h1>
        <p class="page-lede">Pagos con captura manual y pendientes de conciliar.</p>
      </div>
      {#if payOn}
        <Button variant="secondary" data-testid="owner-pay-refresh" onclick={load} disabled={loading} icon="refresh">
          Actualizar
        </Button>
      {/if}
    </div>

    {#if !payOn}
      <div class="feature-off-banner" data-testid="owner-pay-off">
        <Icon name="info" size={18} />
        <span>Los pagos no están activos para este negocio.</span>
      </div>
    {:else}
      {#if status}
        <p class="status-line" data-testid="owner-pay-status">{status}</p>
      {/if}
      <div class="glass-card pay-table">
        <div class="card-header">
          <h2>Pagos pendientes</h2>
          <span class="badge {rows.length > 0 ? 'badge-warning' : 'badge-success'}">
            {rows.length} pendiente(s)
          </span>
        </div>
        {#if rows.length === 0}
          <EmptyState icon="check" title="Sin pagos pendientes" />
        {:else}
          <ul class="pay-list" data-testid="owner-pay-list">
            {#each rows as r}
              <li class="pay-item">
                <span class="pay-id">
                  <Icon name="credit-card" size={14} />
                  {r.id}
                </span>
                <span class="pay-amount tabular-nums">{formatCents(r.amount_cents)}</span>
                <span class="badge {r.status === 'PENDING' ? 'badge-warning' : 'badge-muted'}">{r.status}</span>
                <span class="pay-meta">{r.acquirer} · venta {r.sale_id}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .status-line {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: -0.5rem;
  }

  .pay-table {
    padding: 1.25rem;
  }

  

  .pay-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .pay-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }

  .pay-id {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-main);
    flex: 1;
  }

  .pay-amount {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  .pay-meta {
    font-size: 0.8125rem;
    color: var(--text-dim);
    width: 100%;
  }
</style>
