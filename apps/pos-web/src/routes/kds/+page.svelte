<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isOrdersKdsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { publishVitrina, vitrinaMessageForPhase } from '$lib/vitrina/channel';
  import { kdsEventLabel, salesErrorCopy } from '$lib/ui/ops-copy';
  import { apiFetch, resolveApiBase } from '$lib/auth/api-client';
  import { tenantBranchId } from '$lib/admin/cash-session';
  import {
    formatKdsElapsed,
    groupKdsOrders,
    kdsColumnLabel,
    sortKdsOrdersByUrgency,
    type KdsOrder,
  } from '$lib/kds/kds-board';

  const enabled = isOrdersKdsEnabled();
  let branchId = $state('default');
  let events = $state<{ type: string; orderId: string; orderItemId?: string; at: number }[]>([]);
  let pending = $state<KdsOrder[]>([]);
  let error = $state('');
  let ws: WebSocket | null = null;
  let nowMs = $state(Date.now());
  let showUrgentOnly = $state(false);
  let preparingItems = $state<Set<string>>(new Set());
  let tick: ReturnType<typeof setInterval> | null = null;

  async function loadPending() {
    try {
      const res = await apiFetch(
        `/api/orders/kds-pending?branchId=${encodeURIComponent(branchId)}`,
        { storage: localStorage },
      );
      if (!res.ok) return;
      const body = (await res.json()) as {
        orders?: Array<{
          id: string;
          tableLabel: string | null;
          firedAt?: string | null;
          fired_at?: string | null;
          items: { id: string; productName: string | null; quantity: number; status: string }[];
        }>;
      };
      const raw = body.orders ?? [];
      pending = raw.map((o) => ({
        id: o.id,
        tableLabel: o.tableLabel,
        firedAt: o.firedAt ?? (o as unknown as { fired_at?: string | null }).fired_at ?? null,
        firedAtMs:
          (o as unknown as { firedAtMs?: number | null }).firedAtMs ??
          (o.firedAt
            ? Date.parse(o.firedAt)
            : (o as unknown as { fired_at?: string | null }).fired_at
              ? Date.parse((o as unknown as { fired_at: string | null }).fired_at ?? '')
              : Date.now()),
        items: o.items,
      })) as KdsOrder[];
    } catch {
      // el WS cubre el evento en vivo; el replay es best-effort.
    }
  }

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
        if (
          data.type === 'ITEM_FIRED' ||
          data.type === 'ITEM_READY' ||
          data.type === 'ITEM_PREPARING' ||
          data.type === 'ORDER_READY'
        ) {
          void loadPending();
        }
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

  function markPreparing(orderId: string, itemId: string) {
    // Optimista <100 ms: el cajero ve el cambio al instante, sin esperar red.
    const next = new Set(preparingItems);
    next.add(itemId);
    preparingItems = next;
    void loadPending();
  }

  async function markReady(orderId: string, orderItemId?: string) {
    // feedback optimista: sacamos de "en preparación" al instante
    if (orderItemId) {
      const next = new Set(preparingItems);
      next.delete(orderItemId);
      preparingItems = next;
    }
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
      error = salesErrorCopy(body.error ?? 'ORDER_ITEM_FAILED');
    } else {
      error = '';
      void loadPending();
    }
  }

  const effectiveOrders = $derived.by(() => {
    if (preparingItems.size === 0) return pending;
    return pending.map((order) => ({
      ...order,
      items: order.items.map((item) =>
        preparingItems.has(item.id) && item.status !== 'READY' ? { ...item, status: 'PREPARING' } : item,
      ),
    }));
  });

  const grouped = $derived.by(() => groupKdsOrders(effectiveOrders));
  const hasOrders = $derived(pending.length > 0);
  const pendingSorted = $derived.by(() => sortKdsOrdersByUrgency(grouped.pending as KdsOrder[], nowMs));
  const preparingSorted = $derived.by(() => sortKdsOrdersByUrgency(grouped.preparing as KdsOrder[], nowMs));
  const readySorted = $derived.by(() => sortKdsOrdersByUrgency(grouped.ready as KdsOrder[], nowMs));
  const filteredPending = $derived.by(() =>
    showUrgentOnly
      ? pendingSorted.filter((o) => formatKdsElapsed(o.firedAtMs ?? null, nowMs).level !== 'normal')
      : pendingSorted,
  );
  const filteredPreparing = $derived.by(() =>
    showUrgentOnly
      ? preparingSorted.filter((o) => formatKdsElapsed(o.firedAtMs ?? null, nowMs).level !== 'normal')
      : preparingSorted,
  );

  onMount(() => {
    branchId = tenantBranchId(localStorage) || 'default';
    if (enabled) {
      void loadPending();
      void connect();
      tick = setInterval(() => {
        nowMs = Date.now();
      }, 10_000);
    }
  });
  onDestroy(() => {
    ws?.close();
    if (tick) clearInterval(tick);
  });
</script>

<svelte:head><title>Cocina · KipusPay</title></svelte:head>

<div class="floor-board" data-testid="kds-root">
  <div class="floor-toolbar">
    <div>
      <p class="page-eyebrow">Piso · Cocina</p>
      <h1>Cocina</h1>
      {#if enabled && hasOrders}
        <p class="kds-lede">
          {pendingSorted.length + preparingSorted.length} por atender · {readySorted.length} listas para servir
        </p>
      {/if}
    </div>
    <div class="floor-toolbar-actions">
      {#if enabled}
        <label class="branch-inline" for="kds-branch-input">
          Sucursal
          <input id="kds-branch-input" data-testid="kds-branch" bind:value={branchId} />
        </label>
        <Button
          variant={showUrgentOnly ? 'primary' : 'secondary'}
          data-testid="kds-filter-urgent"
          onclick={() => (showUrgentOnly = !showUrgentOnly)}
          icon="alert"
          aria-pressed={showUrgentOnly}
        >
          {showUrgentOnly ? 'Solo urgentes' : 'Todas'}
        </Button>
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
      {#if hasOrders}
        <div class="kds-kanban">
          <!-- Columna: Por hacer -->
          <section class="kds-col kds-col-pending" data-testid="kds-col-pending" aria-labelledby="kds-col-pending-title">
            <div class="kds-col-head">
              <h2 id="kds-col-pending-title" class="kds-col-title">
                <span class="kds-col-dot dot-pending" aria-hidden="true"></span>
                {kdsColumnLabel('pending')}
                <span class="badge badge-warning">{filteredPending.length}</span>
              </h2>
              <p class="kds-col-hint">Llegada reciente</p>
            </div>
            {#if filteredPending.length > 0}
              <ul class="kds-pending" data-testid="kds-pending">
                {#each filteredPending as order (order.id)}
                  {@const elapsed = formatKdsElapsed(order.firedAtMs ?? null, nowMs)}
                  <li
                    class="ledger-card kds-pending-card"
                    class:kds-urgent-warn={elapsed.level === 'warn'}
                    class:kds-urgent={elapsed.level === 'urgent'}
                    data-testid="kds-card"
                  >
                    <div class="kds-pending-head">
                      <span class="badge badge-warning">Mesa {order.tableLabel ?? '—'}</span>
                      <span class="kds-elapsed {elapsed.level}" data-testid="kds-elapsed">
                        <span class="kds-elapsed-dot" aria-hidden="true"></span>
                        {elapsed.text} en cocina
                      </span>
                    </div>
                    <div class="kds-order-meta">
                      <span class="order-ref" title={order.id}>{order.id.slice(0, 8)}</span>
                      <span class="kds-item-count">{order.items.length} plato{order.items.length === 1 ? '' : 's'}</span>
                    </div>
                    <ul class="kds-pending-items">
                      {#each order.items as item (item.id)}
                        <li>
                          <span class="kds-item-name">{item.productName ?? item.id}</span>
                          <span class="qty">× {item.quantity}</span>
                          {#if item.status !== 'READY' && item.status !== 'PREPARING'}
                            <button
                              type="button"
                              class="secondary mark-btn"
                              data-testid="kds-preparing"
                              onclick={() => markPreparing(order.id, item.id)}
                            >
                              <Icon name="chef-hat" size={14} />
                              Preparar
                            </button>
                          {/if}
                          <button
                            type="button"
                            class="success mark-btn"
                            data-testid="kds-ready"
                            onclick={() => markReady(order.id, item.id)}
                          >
                            <Icon name="check" size={14} />
                            Listo
                          </button>
                        </li>
                      {/each}
                    </ul>
                    {#if order.items.length > 1}
                      <button
                        type="button"
                        class="secondary mark-btn mark-btn-full"
                        data-testid="kds-ready-all"
                        onclick={() => markReady(order.id)}
                      >
                        <Icon name="check" size={14} />
                        Todo listo
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="kds-col-empty">
                <Icon name="check" size={20} />
                <span>Sin pendientes urgentes</span>
              </div>
            {/if}
          </section>

          <!-- Columna: En preparación -->
          <section class="kds-col kds-col-preparing" data-testid="kds-col-preparing" aria-labelledby="kds-col-preparing-title">
            <div class="kds-col-head">
              <h2 id="kds-col-preparing-title" class="kds-col-title">
                <span class="kds-col-dot dot-preparing" aria-hidden="true"></span>
                {kdsColumnLabel('preparing')}
                <span class="badge badge-amber">{filteredPreparing.length}</span>
              </h2>
              <p class="kds-col-hint">En fuego</p>
            </div>
            {#if filteredPreparing.length > 0}
              <ul class="kds-pending" data-testid="kds-preparing">
                {#each filteredPreparing as order (order.id)}
                  {@const elapsed = formatKdsElapsed(order.firedAtMs ?? null, nowMs)}
                  <li class="ledger-card kds-pending-card kds-card-preparing" data-testid="kds-card-preparing">
                    <div class="kds-pending-head">
                      <span class="badge badge-amber">Mesa {order.tableLabel ?? '—'}</span>
                      <span class="kds-elapsed {elapsed.level}">
                        <span class="kds-elapsed-dot" aria-hidden="true"></span>
                        {elapsed.text}
                      </span>
                    </div>
                    <div class="kds-order-meta">
                      <span class="order-ref">{order.id.slice(0, 8)}</span>
                    </div>
                    <ul class="kds-pending-items">
                      {#each order.items.filter((i) => i.status === 'PREPARING') as item (item.id)}
                        <li>
                          <span class="kds-item-name">{item.productName ?? item.id}</span>
                          <span class="qty">× {item.quantity}</span>
                          <button
                            type="button"
                            class="success mark-btn"
                            data-testid="kds-ready"
                            onclick={() => markReady(order.id, item.id)}
                          >
                            <Icon name="check" size={14} />
                            Listo
                          </button>
                        </li>
                      {/each}
                    </ul>
                    <button
                      type="button"
                      class="success mark-btn mark-btn-full"
                      data-testid="kds-ready-all"
                      onclick={() => markReady(order.id)}
                    >
                      <Icon name="check" size={14} />
                      Servir todo
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="kds-col-empty">
                <Icon name="chef-hat" size={20} />
                <span>Nada en fuego</span>
              </div>
            {/if}
          </section>

          <!-- Columna: Listo para servir -->
          <section class="kds-col kds-col-ready" data-testid="kds-col-ready" aria-labelledby="kds-col-ready-title">
            <div class="kds-col-head">
              <h2 id="kds-col-ready-title" class="kds-col-title">
                <span class="kds-col-dot dot-ready" aria-hidden="true"></span>
                {kdsColumnLabel('ready')}
                <span class="badge badge-success">{readySorted.length}</span>
              </h2>
              <p class="kds-col-hint">Para el mozo</p>
            </div>
            {#if readySorted.length > 0}
              <ul class="kds-pending" data-testid="kds-ready-list">
                {#each readySorted as order (order.id)}
                  <li class="ledger-card kds-pending-card kds-card-ready" data-testid="kds-card-ready">
                    <div class="kds-pending-head">
                      <span class="badge badge-success">Mesa {order.tableLabel ?? '—'}</span>
                      <span class="kds-ready-badge">
                        <Icon name="check" size={12} />
                        Lista
                      </span>
                    </div>
                    <span class="order-ref">{order.id.slice(0, 8)}</span>
                    <ul class="kds-pending-items">
                      {#each order.items as item (item.id)}
                        <li>
                          <span class="kds-item-name">{item.productName ?? item.id}</span>
                          <span class="qty">× {item.quantity}</span>
                        </li>
                      {/each}
                    </ul>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="kds-col-empty">
                <Icon name="clock" size={20} />
                <span>Esperando platos</span>
              </div>
            {/if}
          </section>
        </div>
      {:else if events.length === 0}
        <EmptyState icon="check" title="Cocina al día" description="Cuando llegue una comanda, aparece aquí." />
      {:else}
        <ul class="kds-event-list" data-testid="kds-events">
          {#each events as ev (ev.at + ev.orderId + (ev.orderItemId ?? ''))}
            <li class="kds-event-item ledger-card">
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
  .kds-lede {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

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

  .kds-kanban {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }

  @media (max-width: 1100px) {
    .kds-kanban {
      grid-template-columns: 1fr;
    }
  }

  .kds-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .kds-col-head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-bottom: 0.625rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .kds-col-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0;
  }

  .kds-col-dot {
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .dot-pending {
    background: var(--rose-red);
    box-shadow: 0 0 0 6px rgba(217, 106, 60, 0.12);
  }

  .dot-preparing {
    background: var(--amber);
    box-shadow: 0 0 0 6px rgba(217, 154, 61, 0.14);
  }

  .dot-ready {
    background: var(--emerald-green);
    box-shadow: 0 0 0 6px rgba(46, 158, 116, 0.14);
  }

  .kds-col-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    letter-spacing: 0.01em;
  }

  .kds-col-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.875rem;
    background: var(--bg-surface);
  }

  .kds-pending {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    align-content: start;
  }

  .kds-pending-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    border: 1px solid var(--border-subtle);
  }

  .kds-pending-card.kds-urgent-warn {
    border-color: rgba(217, 154, 61, 0.45);
    box-shadow: var(--shadow-glow);
  }

  .kds-pending-card.kds-urgent {
    border-color: rgba(217, 106, 60, 0.5);
    box-shadow: 0 0 20px rgba(217, 106, 60, 0.25);
  }

  .kds-card-preparing {
    border-left: 3px solid var(--amber);
  }

  .kds-card-ready {
    border-left: 3px solid var(--emerald-green);
    opacity: 0.96;
  }

  .kds-pending-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .kds-elapsed {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-button-sec);
    color: var(--text-muted);
  }

  .kds-elapsed.warn {
    color: var(--amber);
    border-color: rgba(217, 154, 61, 0.35);
    background: rgba(217, 154, 61, 0.12);
  }

  .kds-elapsed.urgent {
    color: var(--rose-red);
    border-color: rgba(217, 106, 60, 0.4);
    background: rgba(217, 106, 60, 0.12);
    animation: kds-pulse 1.6s infinite;
  }

  .kds-elapsed-dot {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: currentColor;
  }

  .kds-ready-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--emerald-green);
  }

  @keyframes kds-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.75;
    }
  }

  .kds-order-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .kds-item-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .kds-pending-items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .kds-pending-items li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 0.375rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .kds-pending-items li:last-child {
    border-bottom: 0;
  }

  .kds-item-name {
    flex: 1;
    min-width: 8rem;
    font-weight: 600;
    color: var(--text-main);
    font-size: 0.9375rem;
  }

  .kds-pending-items .qty {
    font-weight: 700;
    color: var(--text-muted);
    font-family: var(--font-mono);
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
    min-height: 44px;
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
    padding: var(--inset-field);
    min-height: 44px;
    font-size: 0.8125rem;
    min-width: 44px;
  }

  .mark-btn-full {
    width: 100%;
  }
</style>
