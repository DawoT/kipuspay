<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';

  const enabled = isOrdersKdsEnabled();
  let branchId = $state('default');
  let events = $state<{ type: string; orderId: string; orderItemId?: string; at: number }[]>([]);
  let error = $state('');
  let ws: WebSocket | null = null;

  function connect() {
    error = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/kds/ws?branchId=${encodeURIComponent(branchId)}`;
    ws?.close();
    ws = new WebSocket(url);
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
      error = 'KDS WebSocket error — reconectando';
    };
  }

  async function markReady(orderId: string, orderItemId?: string) {
    const res = await fetch('/api/orders/items/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        orderItemIds: orderItemId ? [orderItemId] : undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      error = body.error ?? 'ready failed';
    }
  }

  onMount(() => {
    if (enabled) connect();
  });
  onDestroy(() => ws?.close());
</script>

<svelte:head><title>KDS Cocina · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="kds-root">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="box" size={12} /> KDS · Kitchen Display System</p>
      <h1 class="page-title">Display de Cocina (KDS)</h1>
      <p class="page-lede">Monitoreo en tiempo real de comandas recibidas y marcación de despacho a garzón.</p>
    </div>
    {#if enabled}
      <button type="button" class="secondary" data-testid="kds-reconnect" onclick={connect}>
        <Icon name="refresh" size={14} />
        Reconectar WS
      </button>
    {/if}
  </div>

  {#if !enabled}
    <div class="feature-off-banner" data-testid="kds-off">
      <Icon name="info" size={18} />
      <span>KDS desactivado (<code>FEATURE_ORDERS_KDS</code> off).</span>
    </div>
  {:else}
    {#if error}
      <div class="status-alert danger" aria-live="polite" data-testid="kds-error">
        <Icon name="alert" size={16} />
        <span>{error}</span>
      </div>
    {/if}

    <div class="kds-layout" data-testid="kds">
      <div class="glass-card section-pad branch-card">
        <div class="field-group">
          <label for="kds-branch-input">Sucursal activa</label>
          <input id="kds-branch-input" data-testid="kds-branch" bind:value={branchId} />
        </div>
      </div>

      <div class="glass-card section-pad events-card">
        <div class="card-header">
          <h2>Comandas en cola</h2>
          <span class="badge {events.length > 0 ? 'badge-warning' : 'badge-success'}">
            {events.length} evento(s)
          </span>
        </div>

        {#if events.length === 0}
          <div class="empty-state">
            <Icon name="check" size={28} />
            <span>Cocina al día — sin comandas pendientes</span>
          </div>
        {:else}
          <ul class="kds-event-list" data-testid="kds-events">
            {#each events as ev (ev.at + ev.orderId + (ev.orderItemId ?? ''))}
              <li class="kds-event-item">
                <span class="badge {ev.type === 'ITEM_FIRED' ? 'badge-warning' : 'badge-success'}">
                  {ev.type}
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
    </div>
  {/if}
</div>

<style>
  .kds-layout {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .section-pad { padding: 1.25rem; }
  .field-group { display: flex; flex-direction: column; gap: 0.375rem; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 3rem;
    color: var(--emerald-green);
    font-size: 0.9375rem;
  }

  .kds-event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .kds-event-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem;
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
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }
</style>
