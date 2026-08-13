<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import { customerOrderAccess } from '$lib/customer-orders/customer-order-access';
  import {
    createCustomerOrdersApi,
    type CustomerOrderDetailDto,
    type CustomerOrderStatus,
    type CustomerOrderSummaryDto,
  } from '$lib/customer-orders/customer-order-client';
  import { isCustomerOrdersEnabled } from '$lib/features';
  import {
    CustomerOrderFulfillmentQueue,
    createIndexedDbCustomerOrderQueue,
    reconcileCustomerOrderFulfillments,
    type QueuedCustomerOrderFulfillment,
  } from '$lib/offline-sync/customer-order-fulfillment-queue';
  import { resolveApiBase } from '$lib/auth/api-client';

  const enabled = isCustomerOrdersEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  const session = $derived(sessionState?.current ?? null);
  const access = $derived(customerOrderAccess(session?.role ?? ''));
  const api = $derived(session
    ? createCustomerOrdersApi({
        authenticatedFetch: session.authenticatedFetch,
        terminalContext: () => session.terminal,
        apiBase: resolveApiBase(localStorage),
      })
    : null);

  let online = $state(true);
  let stale = $state(false);
  let loading = $state(false);
  let query = $state('');
  let statusFilter = $state<'ALL' | CustomerOrderStatus>('ALL');
  let orders = $state<CustomerOrderSummaryDto[]>([]);
  let selected = $state<CustomerOrderDetailDto | null>(null);
  let quantities = $state<Record<string, number>>({});
  let pending = $state<QueuedCustomerOrderFulfillment[]>([]);
  let message = $state('Selecciona un pedido para revisar su reserva.');
  let alert = $state('');
  let customerId = $state('');
  let productId = $state('');
  let createQuantity = $state(1_000_000);
  let cancelReason = $state('');
  let cashRegisterSessionId = $state('');
  let paymentMethodId = $state('');
  let queue: CustomerOrderFulfillmentQueue | null = null;
  let notice = $state<{ status: 'PENDING' | 'SENT' | 'FAILED' }>({ status: 'PENDING' });

  const visibleOrders = $derived(
    orders.filter((order) => {
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const term = query.trim().toLowerCase();
      return (
        matchesStatus &&
        (!term || `${order.id} ${order.customer_id}`.toLowerCase().includes(term))
      );
    }),
  );
  const validCachedLease = $derived(
    pending.some(
      (entry) =>
        entry.orderId === selected?.id &&
        entry.status !== 'CONFLICT' &&
        Date.parse(entry.expiresAt) > Date.now(),
    ),
  );

  function formatQuantity(value: number): string {
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(value / 1_000_000);
  }

  function formatCents(value: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(value / 100);
  }

  function timeRemaining(reservedUntil: string): string {
    const seconds = Math.floor((Date.parse(reservedUntil) - Date.now()) / 1000);
    if (seconds <= 0) return 'Reserva vencida';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} h ${minutes} min`;
  }

  function itemTotals(item: CustomerOrderDetailDto['items'][number]) {
    const requestedQuantityMicrounits = item.requested_quantity_microunits;
    const reservedQuantityMicrounits = item.reserved_quantity_microunits;
    const fulfilledQuantityMicrounits = item.fulfilled_quantity_microunits;
    const releasedQuantityMicrounits = item.released_quantity_microunits;
    return {
      requestedQuantityMicrounits,
      reservedQuantityMicrounits,
      fulfilledQuantityMicrounits,
      releasedQuantityMicrounits,
    };
  }

  async function refresh() {
    if (!api || !enabled || !access.canRead) return;
    loading = true;
    alert = '';
    try {
      const isCashRole = ['cashier', 'supervisor'].includes(session?.role?.toLowerCase() ?? '');
      orders = [
        ...(isCashRole && session?.branchId
          ? await api.list({ branchId: session.branchId })
          : await api.list()),
      ];
      stale = false;
      message = `${orders.length} pedidos cargados desde el servidor.`;
    } catch (error) {
      stale = true;
      alert = `No se pudo actualizar la cola: ${error instanceof Error ? error.message : 'error de red'}.`;
    } finally {
      loading = false;
    }
  }

  async function selectOrder(orderId: string) {
    if (!api) return;
    try {
      selected = await api.detail(orderId);
      quantities = Object.fromEntries(
        selected.items.map((item) => [item.id, item.reserved_quantity_microunits]),
      );
      message = `Pedido ${orderId} abierto. El precio mostrado es el reservado.`;
    } catch (error) {
      alert = `No se pudo abrir el pedido: ${error instanceof Error ? error.message : 'error'}.`;
    }
  }

  async function createFromCart() {
    if (!api || !session?.branchId || !access.canCreate || !customerId || !productId) return;
    try {
      const created = await api.create({
        branchId: session.branchId,
        customerId,
        idempotencyKey: crypto.randomUUID(),
        reservedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        items: [{ productId, enteredQuantityMicrounits: Math.trunc(createQuantity) }],
      });
      message = `Pedido ${created.orderId} creado. Sin pago al crear.`;
      await refresh();
    } catch (error) {
      alert = `No se creó el pedido: ${error instanceof Error ? error.message : 'error'}.`;
    }
  }

  async function cacheLease() {
    if (!api || !queue || !selected || !online || !access.canFulfill || !session?.terminal) return;
    const items = selected.items
      .map((item) => ({
        itemId: item.id,
        quantityMicrounits: Math.trunc(quantities[item.id] ?? 0),
      }))
      .filter((item) => item.quantityMicrounits > 0);
    if (!items.length) {
      alert = 'Selecciona al menos una cantidad para preparar el retiro.';
      return;
    }
    try {
      const lease = await api.requestLease({
        orderId: selected.id,
        items,
        requestedTtlSeconds: 300,
        idempotencyKey: crypto.randomUUID(),
      });
      await queue.enqueue({
        orderId: selected.id,
        branchId: selected.branch_id,
        terminalId: session.terminal.terminalId,
        envelope: lease.envelope,
        idempotencyKey: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + lease.ttlSeconds * 1000).toISOString(),
        items,
      });
      pending = [...(await queue.listPending())];
      message = 'Reserva guardada en este terminal. Ya puedes confirmar el retiro.';
    } catch (error) {
      alert = `No se pudo preparar la reserva: ${error instanceof Error ? error.message : 'error'}.`;
    }
  }

  async function fulfillPending() {
    if (!api || !queue || !selected || !online || !access.canFulfill) return;
    const result = await reconcileCustomerOrderFulfillments(queue, {
      fulfill: async (entry) => {
        const fulfilled = await api.fulfill({
          orderId: entry.orderId,
          envelope: entry.envelope,
          idempotencyKey: entry.idempotencyKey,
          ...(cashRegisterSessionId ? { cashRegisterSessionId } : {}),
          ...(paymentMethodId ? { paymentMethodId } : {}),
        });
        return {
          status: 'SUCCESS',
          saleId: String(fulfilled.saleId),
          fulfillmentId: String(fulfilled.saleItemId),
        };
      },
    });
    pending = [...(await queue.listPending())];
    if (result.succeeded) {
      await refresh();
      await selectOrder(selected.id);
      message = 'Cumplimiento confirmado por el servidor. El checkout ordinario sigue disponible.';
    } else {
      alert =
        result.conflicted > 0
          ? 'Reserva vencida o usada. Conflicto recuperable: solicita una nueva; no se creó una venta sin confirmar.'
          : 'Cumplimiento pendiente. Conservamos el intento para reintentar.';
    }
  }

  async function cancelOrder() {
    if (!api || !selected || !access.canCancel || !cancelReason.trim()) return;
    try {
      await api.cancel({
        orderId: selected.id,
        reason: cancelReason,
        idempotencyKey: crypto.randomUUID(),
      });
      message = 'Pedido cancelado y remanente liberado.';
      selected = null;
      await refresh();
    } catch (error) {
      alert = `No se canceló: ${error instanceof Error ? error.message : 'error'}.`;
    }
  }

  async function repriceExpired() {
    if (!api || !selected || !session?.userId || !session.terminal || !access.canApproveReprice)
      return;
    try {
      const approval = await api.approveReprice({
        orderId: selected.id,
        actorUserId: session.userId,
        requestedTtlSeconds: 180,
      });
      // The supervisor token remains function-local and is never stored in state or IndexedDB.
      const handoff = await api.repriceHandoff({
        orderId: selected.id,
        authorizationToken: approval.token,
        idempotencyKey: crypto.randomUUID(),
      });
      message = `Recotización ${handoff.quoteId} lista con precios actuales del servidor. Continúa en checkout ordinario.`;
    } catch (error) {
      alert = `No se autorizó la recotización: ${error instanceof Error ? error.message : 'error'}.`;
    }
  }

  onMount(() => {
    const updateConnection = () => {
      online = navigator.onLine;
      if (!online) stale = true;
    };
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  });

  $effect(() => {
    if (session?.terminal && !queue) {
      queue = new CustomerOrderFulfillmentQueue(createIndexedDbCustomerOrderQueue(), {
        branchId: session.branchId ?? '',
        terminalId: session.terminal.terminalId,
      });
      queue.listPending().then((items) => (pending = [...items])).catch(() => {
        alert = 'No se pudo abrir la cola local de cumplimientos.';
      });
    }
    void refresh();
  });
</script>

<svelte:head><title>Pedido con retiro · KipusPay</title></svelte:head>

<main class="pickup-shell">
  <header class="masthead">
    <div>
      <p class="eyebrow">Caja · reserva operativa</p>
      <h1>Pedido con retiro</h1>
      <p class="lede">
        Reserva stock. Sin pago al crear: la reserva no cobra nada ni emite CPE.
      </p>
    </div>
    <div class:offline={!online} class="connection" role="status" aria-live="polite">
      {online ? 'En línea · datos del servidor' : 'Sin conexión · Datos locales desactualizados'}
    </div>
  </header>

  {#if !enabled}
    <p class="alert" role="alert">La función de pedidos con retiro está desactivada.</p>
  {:else if !session || !access.canRead}
    <p class="alert" role="alert">Tu sesión no tiene acceso a pedidos con retiro.</p>
  {:else}
    {#if stale}
      <p class="warning" role="alert">
        Datos locales desactualizados. La venta y sincronización ordinarias pueden continuar.
      </p>
    {/if}
    {#if alert}<p class="alert" role="alert">{alert}</p>{/if}

    <div class="grid">
      <section class="queue" aria-labelledby="queue-title">
        <div class="section-head">
          <div><p class="step">01</p><h2 id="queue-title">Cola de retiro</h2></div>
          <button type="button" data-testid="customer-orders-refresh" onclick={refresh} disabled={!online || loading}>Actualizar</button>
        </div>
        <label for="order-search">Buscar por código o cliente</label>
        <input id="order-search" type="search" data-testid="customer-orders-search" bind:value={query} autocomplete="off" />
        <label for="status-filter">Filtrar estado</label>
        <select id="status-filter" data-testid="customer-orders-status-filter" bind:value={statusFilter}>
          <option value="ALL">Todos</option>
          <option value="OPEN">Abiertos</option>
          <option value="PARTIAL">Parciales</option>
          <option value="FULFILLED">Cumplidos</option>
          <option value="CANCELLED">Cancelados</option>
          <option value="EXPIRED">Vencidos</option>
        </select>
        <div class="order-list">
          {#each visibleOrders as order (order.id)}
            <button class:selected={selected?.id === order.id} class="order-card" data-testid="customer-order-card" type="button" onclick={() => selectOrder(order.id)}>
              <span><strong>{order.id}</strong><small>Cliente {order.customer_id}</small></span>
              <span><b>{order.status}</b><small>Tiempo restante: {timeRemaining(order.reserved_until)}</small></span>
            </button>
          {:else}
            <p>No hay pedidos que coincidan con los filtros.</p>
          {/each}
        </div>
      </section>

      <section class="detail" aria-labelledby="detail-title">
        <div class="section-head">
          <div><p class="step">02</p><h2 id="detail-title">Detalle confiable</h2></div>
          {#if selected}<output>{selected.status}</output>{/if}
        </div>
        {#if selected}
          <p><strong>Tiempo restante:</strong> {timeRemaining(selected.reserved_until)}</p>
          <div class="items">
            {#each selected.items as item (item.id)}
              {@const totals = itemTotals(item)}
              <article class="item">
                <div><strong>{item.product_name}</strong><small>{item.id}</small></div>
                <dl>
                  <div><dt>Solicitado</dt><dd>{formatQuantity(totals.requestedQuantityMicrounits)}</dd></div>
                  <div><dt>Reservado</dt><dd>{formatQuantity(totals.reservedQuantityMicrounits)}</dd></div>
                  <div><dt>Cumplido</dt><dd>{formatQuantity(totals.fulfilledQuantityMicrounits)}</dd></div>
                  <div><dt>Liberado</dt><dd>{formatQuantity(totals.releasedQuantityMicrounits)}</dd></div>
                </dl>
                <p>Precio reservado: <strong>{formatCents(item.unit_price_cents)}</strong></p>
                {#if access.canFulfill && item.reserved_quantity_microunits > 0}
                  <label for={`quantity-${item.id}`}>Cantidad a cumplir</label>
                  <input id={`quantity-${item.id}`} type="number" min="1" max={item.reserved_quantity_microunits} bind:value={quantities[item.id]} />
                {/if}
              </article>
            {/each}
          </div>
          <div class="notice">
            <span>Aviso de vencimiento</span>
            <strong>{notice.status === 'PENDING' ? 'Pendiente' : notice.status === 'SENT' ? 'Enviado' : 'Fallido'}</strong>
            <small>Pendiente · Reintento · Escalado son estados operativos observables.</small>
          </div>

          {#if access.canFulfill}
            <div class="cash-fields">
              <label for="cash-session">Sesión de caja</label>
              <input id="cash-session" data-testid="customer-orders-cash-session" bind:value={cashRegisterSessionId} />
              <label for="payment-method">Medio de pago</label>
              <input id="payment-method" data-testid="customer-orders-payment-method" bind:value={paymentMethodId} />
            </div>
            <div class="actions">
              <button type="button" data-testid="customer-orders-prepare-lease" onclick={cacheLease} disabled={!online}>Preparar retiro</button>
              <Button variant="primary" data-testid="customer-orders-fulfill" onclick={fulfillPending} disabled={!online || !validCachedLease}>
                Cumplir parcialmente
              </Button>
            </div>
            {#if !validCachedLease}<p class="lease-state">Sin reserva vigente. El retiro permanece deshabilitado.</p>{/if}
          {/if}

          {#if selected.status === 'EXPIRED'}
            <div class="expired">
              <strong>Requiere aprobación de supervisor</strong>
              <p>La recotización usa precios actuales del servidor y continúa como checkout ordinario.</p>
              {#if access.canApproveReprice}
                <button type="button" data-testid="customer-orders-reprice" onclick={repriceExpired} disabled={!online || !session.userId || !session.terminal}>
                  Autorizar y preparar recotización
                </button>
              {/if}
            </div>
          {/if}

          {#if access.canCancel}
            <label for="cancel-reason">Motivo de cancelación</label>
            <textarea id="cancel-reason" data-testid="customer-orders-cancel-reason" bind:value={cancelReason}></textarea>
            <button type="button" data-testid="customer-orders-cancel" onclick={cancelOrder} disabled={!cancelReason.trim()}>Cancelar pedido</button>
          {/if}
        {:else}
          <p>Selecciona un pedido para ver cantidades, precio reservado y vencimiento.</p>
        {/if}
      </section>

      <aside class="create" aria-labelledby="create-title">
        <p class="step">03</p><h2 id="create-title">Crear desde carrito</h2>
        {#if access.canCreate}
          <label for="customer">Cliente</label><input id="customer" data-testid="customer-orders-customer-id" bind:value={customerId} />
          <label for="product">Producto del carrito</label><input id="product" data-testid="customer-orders-product-id" bind:value={productId} />
          <label for="create-quantity">Cantidad</label>
          <input id="create-quantity" data-testid="customer-orders-create-quantity" type="number" min="1" bind:value={createQuantity} />
          <Button variant="primary" data-testid="customer-orders-create" onclick={createFromCart} disabled={!online || !session.branchId || !customerId || !productId}>
            Crear desde carrito
          </Button>
        {:else}
          <p>Tu rol tiene acceso de lectura, sin controles operativos de caja.</p>
        {/if}
        <div class="pending">
          <strong>Cumplimiento pendiente: {pending.length}</strong>
          <p>Los intentos sobreviven a F5. Un conflicto nunca se convierte silenciosamente en venta ordinaria.</p>
          <button type="button" data-testid="customer-orders-retry-pending" onclick={fulfillPending} disabled={!online || pending.length === 0}>Reintentar envío</button>
        </div>
      </aside>
    </div>
    <p class="announcer" data-testid="customer-orders-message" aria-live="polite" aria-atomic="true">{message}</p>
  {/if}
</main>

<style>
  .pickup-shell { width: 100%; overflow-x: hidden; color: var(--text-main); }
  .masthead { border-bottom: 3px solid var(--accent-primary); padding-bottom: 1rem; }
  .eyebrow, .step { color: var(--accent-primary); font: 750 .75rem/1.2 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
  h1 { margin: .2rem 0; font-size: clamp(2rem, 5vw, 3.7rem); line-height: 1; }
  h2 { margin: .15rem 0 .8rem; }
  .lede, small { color: var(--text-muted); }
  .connection, .warning, .alert, .announcer { padding: .8rem 1rem; border: 1px solid var(--border-subtle); border-left: 5px solid var(--accent-primary); }
  .connection.offline, .alert { border-left-color: #e4572e; }
  .warning { margin: 1rem 0; border-left-color: #d99b16; }
  .queue, .detail, .create { min-width: 0; padding: 1rem; background: var(--bg-surface); }
  label { display: block; margin-top: .7rem; font-weight: 700; }
  input, select, textarea, button { min-height: 44px; max-width: 100%; box-sizing: border-box; border: 1px solid var(--border-strong, #64748b); border-radius: var(--radius-sm); padding: .55rem .7rem; font: inherit; color: inherit; background: var(--bg-surface); }
  input, select, textarea { width: 100%; }
  button { cursor: pointer; font-weight: 750; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #ff9f43; outline-offset: 2px; }
  .order-list { display: grid; gap: .5rem; margin-top: .8rem; max-height: 36rem; overflow-y: auto; }
  .order-card { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: .5rem; text-align: left; }
  .order-card span, .item > div { display: grid; gap: .2rem; }
  .order-card.selected { box-shadow: inset 4px 0 var(--accent-primary); }
  .items { display: grid; gap: .7rem; }
  .item { border: 1px solid var(--border-subtle); padding: .8rem; }
  dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; margin: .7rem 0; }
  dl div { padding: .4rem; background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
  dt { color: var(--text-muted); font-size: .72rem; } dd { margin: .2rem 0 0; font-weight: 800; }
  .notice, .expired, .pending, .lease-state { margin-top: .9rem; padding: .75rem; border: 1px solid var(--border-subtle); display: grid; gap: .25rem; }
  .actions { margin-top: .8rem; justify-content: flex-start; flex-wrap: wrap; }
  .announcer { margin-top: 1rem; }
  @media (max-width: 1000px) { .create { grid-column: 1 / -1; } }
  @media (max-width: 650px) {
    .pickup-shell { padding-inline: .65rem; }
    .masthead, .section-head { align-items: flex-start; flex-direction: column; }
    .create { grid-column: auto; }
    dl { grid-template-columns: 1fr 1fr; }
    .actions button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
</style>
