<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isPurchasingReturnsEnabled, isPurchasingThreeWayEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { workflowStatusLabel } from '$lib/ui/ops-copy';
import { apiFetch } from '$lib/auth/api-client';

  const threeWayOn = isPurchasingThreeWayEnabled();
  const returnsOn = isPurchasingReturnsEnabled();
  let loading = $state(false);
  let openPos = $state<
    { id: string; status: string; totalAmountCents: number; supplierId: string }[]
  >([]);
  let uninvoiced = $state<{ receiptId: string; purchaseOrderId: string }[]>([]);
  let overrides = $state<{ invoiceNumber: string; totalCents: number }[]>([]);
  let openReturns = $state<{ id: string; totalCents: number; reason: string }[]>([]);
  let message = $state('');
  let messageOk = $state(true);


  onMount(() => {
    if (threeWayOn || returnsOn) void refresh();
  });

  async function refresh() {
    message = '';
    loading = true;
    if (threeWayOn) {
      const res = await apiFetch('/api/owner/purchasing/three-way', {
        storage: localStorage,
      });
      const json = (await res.json()) as {
        openPurchaseOrders?: typeof openPos;
        uninvoicedReceipts?: typeof uninvoiced;
        priceDiffOverrides?: typeof overrides;
        error?: string;
      };
      if (!res.ok) {
        message = json.error ?? `Error ${res.status}`;
        messageOk = false;
        loading = false;
        return;
      }
      openPos = json.openPurchaseOrders ?? [];
      uninvoiced = json.uninvoicedReceipts ?? [];
      overrides = json.priceDiffOverrides ?? [];
    }
    if (returnsOn) {
      const ret = await apiFetch('/api/owner/purchasing/returns', {
        storage: localStorage,
      });
      const retJson = (await ret.json()) as { openReturns?: typeof openReturns; error?: string };
      if (!ret.ok) {
        message = retJson.error ?? `Error ${ret.status}`;
        messageOk = false;
        loading = false;
        return;
      }
      openReturns = retJson.openReturns ?? [];
    }
    messageOk = true;
    loading = false;
  }
</script>

<svelte:head><title>Compras · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="owner-three-way">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="clipboard-check" size={12} /> Compras</p>
      <h1 class="page-title">Compras</h1>
      <p class="page-lede">Órdenes abiertas, recepciones sin facturar, devoluciones y ajustes de precio.</p>
    </div>
    {#if threeWayOn || returnsOn}
      <Button variant="secondary" data-testid="owner-three-way-refresh" onclick={refresh} disabled={loading} icon="refresh">
        Actualizar
      </Button>
    {/if}
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !threeWayOn && !returnsOn}
    <div class="feature-off-banner" data-testid="owner-three-way-off">
      <Icon name="info" size={18} />
      <span>La conciliación de compras no está activa para este negocio.</span>
    </div>
  {:else}
    <div class="compras-grid">
      <!-- OC abiertas -->
      <div class="ledger-card section-pad">
        <div class="card-header">
          <h2>Órdenes abiertas</h2>
          <span class="badge {openPos.length > 0 ? 'badge-warning' : 'badge-success'}">{openPos.length}</span>
        </div>
        {#if openPos.length === 0}
          <div data-testid="owner-open-pos">
          <EmptyState title="Sin órdenes abiertas" description="Crea una orden de compra para recibir mercadería.">
            <Button variant="secondary" href="/admin/oc-recepcion">Ir a recepción</Button>
          </EmptyState>
          </div>
        {:else}
        <ul class="item-list" data-testid="owner-open-pos">
          {#each openPos as po}
            <li class="item-row">
              <span class="item-id">{po.id}</span>
              <span class="badge badge-muted">{workflowStatusLabel(po.status)}</span>
              <span class="item-amount tabular-nums">{formatCents(po.totalAmountCents)}</span>
            </li>
          {/each}
        </ul>
        {/if}
      </div>

      <!-- Recepciones sin facturar -->
      <div class="ledger-card section-pad">
        <div class="card-header">
          <h2>Sin facturar</h2>
          <span class="badge {uninvoiced.length > 0 ? 'badge-danger' : 'badge-success'}">{uninvoiced.length}</span>
        </div>
        <ul class="item-list" data-testid="owner-uninvoiced">
          {#each uninvoiced as r}
            <li class="item-row">
              <span class="item-id">{r.receiptId}</span>
              <span class="item-meta">OC {r.purchaseOrderId}</span>
            </li>
          {:else}
            <li class="empty-row">Ninguna</li>
          {/each}
        </ul>
      </div>

      {#if returnsOn}
        <!-- Devoluciones OPEN -->
        <div class="ledger-card section-pad">
          <div class="card-header">
            <h2>Devoluciones abiertas</h2>
            <span class="badge {openReturns.length > 0 ? 'badge-warning' : 'badge-success'}">{openReturns.length}</span>
          </div>
          <ul class="item-list" data-testid="owner-open-returns">
            {#each openReturns as r}
              <li class="item-row">
                <span class="item-id">{r.id}</span>
                <span class="item-amount tabular-nums">{formatCents(r.totalCents)}</span>
                <span class="item-meta">{r.reason}</span>
              </li>
            {:else}
              <li class="empty-row">Ninguna</li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Overrides -->
      <div class="ledger-card section-pad">
        <div class="card-header">
          <h2>Ajustes de precio</h2>
          <span class="badge {overrides.length > 0 ? 'badge-danger' : 'badge-success'}">{overrides.length}</span>
        </div>
        <ul class="item-list" data-testid="owner-price-diffs">
          {#each overrides as o}
            <li class="item-row">
              <span class="item-id">{o.invoiceNumber}</span>
              <span class="item-amount tabular-nums">{formatCents(o.totalCents)}</span>
            </li>
          {:else}
            <li class="empty-row">Ninguno</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .compras-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }


  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }

  .item-id {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-main);
    font-weight: 600;
    flex: 1;
  }

  .item-amount {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--accent-primary);
  }

  .item-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
    width: 100%;
  }

  .empty-row {
    padding: 1rem;
    text-align: center;
    color: var(--text-dim);
    font-size: 0.875rem;
  }

  @media (max-width: 600px) {
    .compras-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
