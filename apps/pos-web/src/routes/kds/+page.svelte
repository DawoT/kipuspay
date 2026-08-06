<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isOrdersKdsEnabled } from '$lib/features';
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
      error = 'KDS WebSocket error';
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

{#if !enabled}
  <p data-testid="kds-off">KDS desactivado (FEATURE_ORDERS_KDS off).</p>
{:else}
  <main data-testid="kds">
    <h1>KDS — cocina</h1>
    <label>
      Sucursal
      <input data-testid="kds-branch" bind:value={branchId} />
    </label>
    <button type="button" data-testid="kds-reconnect" onclick={connect}>Reconectar</button>
    {#if error}
      <p data-testid="kds-error">{error}</p>
    {/if}
    <ul data-testid="kds-events">
      {#each events as ev (ev.at + ev.orderId + (ev.orderItemId ?? ''))}
        <li>
          <span>{ev.type}</span>
          <span>{ev.orderId}</span>
          {#if ev.type === 'ITEM_FIRED'}
            <button
              type="button"
              data-testid="kds-ready"
              onclick={() => markReady(ev.orderId, ev.orderItemId)}
            >
              Listo
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </main>
{/if}

<style>
  main {
    max-width: 36rem;
    margin: 2rem auto;
    display: grid;
    gap: 0.75rem;
  }
  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
</style>
