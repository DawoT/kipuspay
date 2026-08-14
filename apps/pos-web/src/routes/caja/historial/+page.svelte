<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { fetchDaySales } from '$lib/cash/day-sales';
  import { isFiscalRcEnabled } from '$lib/features';
  import { apiFetch, resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import Icon from '$lib/ui/Icon.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  let items = $state<{ id: string; series: string; number: number; documentType: string; totalCents: number; issuedAtLima: string; clientName: string; voidStatus: string }[]>([]);
  let countToday = $state(0);
  let totalTodayCents = $state(0);
  let loading = $state(true);
  let errorMsg = $state('');
  const voidOn = isFiscalRcEnabled();
  let voidMsg = $state('');

  async function voidBoleta(saleId: string) {
    voidMsg = '';
    const res = await apiFetch('/api/fiscal/void-boleta', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ saleId }),
    });
    const json = (await res.json()) as { error?: string; code?: string };
    voidMsg = res.ok ? `Boleta ${saleId.slice(0, 8)} anulada.` : (json.error ?? json.code ?? `Error ${res.status}`);
  }

  onMount(async () => {
    const res = await fetchDaySales({
      apiBase: resolveApiBase(),
      authorization: resolveApiAuth().authorization ?? '',
      tenantId: resolveApiAuth()['x-tenant-id'],
    });
    loading = false;
    if (!res.ok) {
      errorMsg = res.message;
      return;
    }
    items = res.items;
    countToday = res.countToday;
    totalTodayCents = res.totalTodayCents;
  });
</script>

<svelte:head><title>Historial del día · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="day-sales-page">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="receipt" size={12} /> Caja · Historial</p>
      <h1 class="page-title">Historial del día</h1>
      <p class="page-lede">Las ventas de hoy de esta caja, en hora de Perú.</p>
    </div>
  </div>

  <div class="summary-row">
    <div class="summary-card glass-card" data-testid="day-sales-count">
      <span class="summary-label">Ventas hoy</span>
      <span class="summary-value tabular-nums">{loading ? '…' : countToday}</span>
    </div>
    <div class="summary-card glass-card" data-testid="day-sales-total">
      <span class="summary-label">Total del día</span>
      <span class="summary-value tabular-nums">{loading ? '…' : `S/ ${formatCents(totalTodayCents)}`}</span>
    </div>
  </div>

  {#if voidMsg}
    <StatusMessage tone="info" data-testid="void-boleta-msg">{voidMsg}</StatusMessage>
  {/if}
  {#if !voidOn}
    <p class="page-lede" data-testid="void-boleta-preparing">Anular boleta está en preparación.</p>
  {/if}

  {#if errorMsg}
    <StatusMessage tone="danger" data-testid="day-sales-error">{errorMsg}</StatusMessage>
  {:else if loading}
    <Skeleton lines={4} />
  {:else if items.length === 0}
    <div class="empty-state">
      <Icon name="receipt" size={22} />
      <span data-testid="day-sales-empty">Aún no hay ventas registradas hoy.</span>
    </div>
  {:else}
    <ul class="sales-list">
      {#each items as item (item.id)}
        <li class="sale-row" data-testid="day-sale-item">
          <div class="sale-left">
            <span class="sale-doc tabular-nums">{item.series}-{String(item.number).padStart(3, '0')}</span>
            <span class="sale-time tabular-nums">{item.issuedAtLima.slice(11, 16)}</span>
            {#if item.voidStatus !== 'NONE'}
              <Badge variant="warning">ANULADA</Badge>
            {/if}
          </div>
          <span class="sale-total tabular-nums">S/ {formatCents(item.totalCents)}</span>
          {#if voidOn && item.documentType === '03' && item.voidStatus === 'NONE'}
            <Button variant="ghost" size="sm" data-testid="void-boleta" onclick={() => void voidBoleta(item.id)}>
              Anular boleta
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .summary-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .summary-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .summary-label {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-value {
    font-size: 1.75rem;
    font-weight: 800;
  }

  .sales-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sale-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .sale-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sale-doc {
    font-weight: 700;
  }

  .sale-time {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .sale-total {
    font-weight: 800;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--text-muted);
  }
</style>
