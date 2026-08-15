<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isPurchasingReturnsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { apiFetch } from '$lib/auth/api-client';

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

  async function createReturn() {
    message = '';
    const res = await apiFetch('/api/purchasing/returns', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
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
    message = `Devolución ${json.returnId} · ${formatCents(json.snapshotTotalCents ?? 0)}`;
  }

  async function closeReturn() {
    message = '';
    const res = await apiFetch('/api/purchasing/returns/close', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        returnId,
        priceDiffOverride,
        authorizedByUserId: authorizedByUserId || null,
      }),
    });
    const json = (await res.json()) as { status?: string; code?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? 'Devolución cerrada' : (json.error ?? `Error ${res.status}`);
  }

  async function cancelReturn() {
    message = '';
    const res = await apiFetch('/api/purchasing/returns/cancel', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? 'Devolución cancelada' : (json.error ?? `Error ${res.status}`);
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
      Conciliar factura
    </a>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="sr-message">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !returnsOn}
    <div class="feature-off-banner" data-testid="admin-supplier-return-off">
      <Icon name="info" size={18} />
      <span>Las devoluciones a proveedor no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="return-layout">
      <!-- Crear devolución -->
      <section class="ledger-card section-pad">
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
          <label for="sr-qty">Cantidad</label>
          <input id="sr-qty" type="number" bind:value={enteredQuantityMicrounits} data-testid="sr-qty" />
        </div>
        <div class="field-group">
          <label for="sr-reason">Motivo</label>
          <input id="sr-reason" bind:value={reason} data-testid="sr-reason" />
        </div>
        <Button variant="primary" icon="plus" data-testid="sr-create" onclick={createReturn}>
          Crear devolución
        </Button>
      </section>

      <!-- Gestionar -->
      <section class="ledger-card section-pad">
        <div class="card-header">
          <h2>Gestionar</h2>
          <span class="section-tag">Acciones</span>
        </div>
        <div class="field-group">
          <label for="sr-id">Devolución</label>
          <input id="sr-id" bind:value={returnId} data-testid="sr-id" placeholder="La creada arriba" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={priceDiffOverride} data-testid="sr-override" />
          <span>Permitir diferencia de precio</span>
        </label>
        <div class="field-group">
          <label for="sr-authz">Autorizado por</label>
          <input id="sr-authz" bind:value={authorizedByUserId} data-testid="sr-authz" placeholder="Requerido si hay diferencia de precio" />
        </div>
        <div class="btn-row">
          <Button variant="success" icon="check" data-testid="sr-close" onclick={closeReturn} disabled={!returnId}>
          Cerrar
        </Button>
          <Button variant="danger" icon="x" data-testid="sr-cancel" onclick={cancelReturn} disabled={!returnId}>
          Cancelar
        </Button>
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
