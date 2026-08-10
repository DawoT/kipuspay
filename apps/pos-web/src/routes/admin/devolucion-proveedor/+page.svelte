<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isPurchasingReturnsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const returnsOn = isPurchasingReturnsEnabled();
  let purchaseReceiptId = $state('rcpt-demo');
  let supplierInvoiceId = $state('');
  let productId = $state('p1');
  let enteredQuantityMicrounits = $state(1_000_000);
  let reason = $state('Mercadería dañada');
  let returnId = $state('');
  let authorizedByUserId = $state('');
  let priceDiffOverride = $state(false);
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function createReturn() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/returns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        purchaseReceiptId,
        supplierInvoiceId: supplierInvoiceId || null,
        reason,
        items: [{ productId, enteredQuantityMicrounits }],
      }),
    });
    const json = (await res.json()) as {
      returnId?: string;
      snapshotTotalCents?: number;
      code?: string;
      error?: string;
    };
    messageOk = res.ok;
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    returnId = json.returnId ?? '';
    message = `OPEN ${json.returnId} · ${formatCents(json.snapshotTotalCents ?? 0)} (0 CPE)`;
  }

  async function closeReturn() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/returns/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        returnId,
        priceDiffOverride,
        authorizedByUserId: authorizedByUserId || null,
      }),
    });
    const json = (await res.json()) as { status?: string; code?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `CLOSED ${returnId}` : (json.error ?? `Error ${res.status}`);
  }

  async function cancelReturn() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/returns/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ returnId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `CANCELLED ${returnId}` : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Devolución a proveedor · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-supplier-return">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="rotate-ccw" size={12} /> Compras · Devolución Proveedor</p>
      <h1 class="page-title">Devolución a proveedor</h1>
      <p class="page-lede">Crear, cerrar o cancelar devoluciones de mercadería al proveedor.</p>
    </div>
    <a class="link-action" href="/admin/factura-proveedor">
      <Icon name="arrow-left" size={14} />
      Factura 3-way
    </a>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite" data-testid="sr-message">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !returnsOn}
    <div class="feature-off-banner" data-testid="admin-supplier-return-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_PURCHASING_RETURNS</code> desactivado.</span>
    </div>
  {:else}
    <div class="return-layout">
      <!-- Crear devolución -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Crear devolución</h2>
          <span class="section-tag">Datos</span>
        </div>
        <div class="field-group">
          <label for="sr-receipt">Recepción</label>
          <input id="sr-receipt" bind:value={purchaseReceiptId} data-testid="sr-receipt" />
        </div>
        <div class="field-group">
          <label for="sr-invoice">Factura (opcional)</label>
          <input id="sr-invoice" bind:value={supplierInvoiceId} data-testid="sr-invoice" placeholder="Dejar vacío si no aplica" />
        </div>
        <div class="field-group">
          <label for="sr-product">Producto</label>
          <input id="sr-product" bind:value={productId} data-testid="sr-product" />
        </div>
        <div class="field-group">
          <label for="sr-qty">Microunidades</label>
          <input id="sr-qty" type="number" bind:value={enteredQuantityMicrounits} data-testid="sr-qty" />
        </div>
        <div class="field-group">
          <label for="sr-reason">Motivo</label>
          <input id="sr-reason" bind:value={reason} data-testid="sr-reason" />
        </div>
        <button type="button" class="primary" data-testid="sr-create" onclick={createReturn}>
          <Icon name="plus" size={14} />
          Crear OPEN
        </button>
      </section>

      <!-- Gestionar -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Gestionar</h2>
          <span class="section-tag">Acciones</span>
        </div>
        <div class="field-group">
          <label for="sr-id">Return ID</label>
          <input id="sr-id" bind:value={returnId} data-testid="sr-id" placeholder="ID creado arriba" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={priceDiffOverride} data-testid="sr-override" />
          <span>Override diferencia de precio</span>
        </label>
        <div class="field-group">
          <label for="sr-authz">Autorizado por (ID usuario)</label>
          <input id="sr-authz" bind:value={authorizedByUserId} data-testid="sr-authz" placeholder="Requerido si override está activo" />
        </div>
        <div class="btn-row">
          <button type="button" class="success" data-testid="sr-close" onclick={closeReturn} disabled={!returnId}>
            <Icon name="check" size={14} />
            Cerrar
          </button>
          <button type="button" class="secondary danger-sec" data-testid="sr-cancel" onclick={cancelReturn} disabled={!returnId}>
            <Icon name="x" size={14} />
            Cancelar
          </button>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .return-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad {
    padding: 1.25rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.875rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }

  .checkbox-row input {
    width: auto;
    cursor: pointer;
    accent-color: var(--accent-primary);
  }

  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .danger-sec {
    border-color: rgba(217, 106, 60, 0.35);
    color: var(--rose-red);
  }

  .danger-sec:hover {
    background: rgba(217, 106, 60, 0.1);
    border-color: var(--rose-red);
  }

  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 38px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  @media (max-width: 600px) {
    .return-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
