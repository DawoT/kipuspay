<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';
  import { kdsEventLabel } from '$lib/ui/ops-copy';
  import { apiFetch, resolveApiBase } from '$lib/auth/api-client';

  const enabled = isOrdersKdsEnabled();
  let branchId = $state('default');
  let events = $state<{ type: string; orderId: string; orderItemId?: string; at: number }[]>([]);
  let error = $state('');
  let ws: WebSocket | null = null;

  function kdsWebSocketUrl(id: string, ticket: string): string {
    const httpBase = resolveApiBase();
    const wsBase = httpBase.replace(/^http/i, 'ws');
    const qs = new URLSearchParams({ branchId: id, ticket });
    return `${wsBase}/api/kds/ws?${qs.toString()}`;
  }

  async function connect() {
    error = '';
    ws?.close();
    try {
      const minted = await apiFetch('/api/kds/ws-ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId }),
      });
      const body = (await minted.json()) as { ticket?: string; error?: string };
      if (!minted.ok || !body.ticket) {
        error = body.error ?? 'No se pudo conectar la pantalla de cocina.';
        return;
      }
      const url = kdsWebSocketUrl(branchId, body.ticket);
      ws = new WebSocket(url);
    } catch (e) {
      error = String(e);
      return;
    }
    if (!ws) return;
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type: string;
          orderId: string;
          orderItemId?: string;
          firedAtMs?: number;
        };
        events = [
          {
            type: data.type,
            orderId: data.orderId,
            orderItemId: data.orderItemId,
            at: Date.now(),
          },
          ...events,
        ].slice(0, 40);
        if (data.type === 'ITEM_FIRED' || data.type === 'ORDER_READY') {
          publishVitrina({
            totalCents: 0,
            itemCount: 0,
            documentType: 'ORDER',
            phase: data.type === 'ORDER_READY' ? 'order_ready' : 'order_fired',
            message: vitrinaMessageForPhase(
              data.type === 'ORDER_READY' ? 'order_ready' : 'order_fired',
            ),
          });
        }
      } catch (e) {
        error = String(e);
      }
    };
    ws.onerror = () => {
      error = 'Se perdió la conexión con cocina. Reintentando…';
    };
  }

  async function markReady(orderId: string, orderItemId?: string) {
    const res = await apiFetch('/api/orders/items/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        orderItemIds: orderItemId ? [orderItemId] : undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      error = body.error ?? 'No se pudo marcar como listo.';
    }
  }

  onMount(() => {
    if (enabled) void connect();
  });
  onDestroy(() => ws?.close());
</script>

<svelte:head><title>Cocina · KipusPay</title></svelte:head>

<div class="floor-board" data-testid="kds-root">
  <div class="floor-toolbar">
    <h1>Cocina</h1>
    <div class="floor-toolbar-actions">
      {#if enabled}
        <label class="branch-inline" for="kds-branch-input">
          Sucursal
          <input id="kds-branch-input" data-testid="kds-branch" bind:value={branchId} />
        </label>
        <Button variant="secondary" data-testid="kds-reconnect" onclick={connect} icon="refresh">
          Reconectar
        </Button>
      {/if}
    </div>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" data-testid="kds-off">
      <Icon name="info" size={18} />
      <span>El display de cocina está desactivado para esta tienda.</span>
    </div>
  {:else}
    {#if error}
      <StatusMessage tone="danger" aria-live="polite" data-testid="kds-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </StatusMessage>
    {/if}

    <div class="kds-board" data-testid="kds">
      {#if events.length === 0}
        <EmptyState icon="check" title="Cocina al día" description="Cuando llegue una comanda, aparece aquí." />
      {:else}
        <ul class="kds-event-list" data-testid="kds-events">
          {#each events as ev (ev.at + ev.orderId + (ev.orderItemId ?? ''))}
            <li class="kds-event-item">
              <span class="badge {ev.type === 'ITEM_FIRED' ? 'badge-warning' : 'badge-success'}">
                {kdsEventLabel(ev.type)}
              </span>
              <span class="order-ref">
                <Icon name="file-text" size={14} />
                {ev.orderId}
              </span>
              {#if ev.type === 'ITEM_FIRED'}
                <button
                  type="button"
                  class="success mark-btn"
                  data-testid="kds-ready"
                  onclick={() => markReady(ev.orderId, ev.orderItemId)}
                >
                  <Icon name="check" size={14} />
                  Listo
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .branch-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    min-height: 44px;
  }

  .branch-inline input {
    min-width: 8rem;
  }

  .kds-board {
    flex: 1;
    min-height: 0;
  }

  .kds-event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: 0.75rem;
    align-content: start;
  }

  .kds-event-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    min-height: 44px;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }

  .order-ref {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-main);
    flex: 1;
  }

  .mark-btn {
    padding: 0.625rem 0.875rem;
    min-height: 44px;
    font-size: 0.8125rem;
  }
</style>
