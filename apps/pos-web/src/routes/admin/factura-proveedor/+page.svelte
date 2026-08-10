<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isPurchasingThreeWayEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const threeWayOn = isPurchasingThreeWayEnabled();
  let purchaseOrderId = $state('oc-demo');
  let branchId = $state('b-demo');
  let invoiceNumber = $state('F001-00001');
  let productId = $state('p1');
  let invoicedQty = $state(10);
  let invoiceUnitCostCents = $state(1000);
  let totalCents = $state(2000);
  let igvCents = $state(304);
  let priceDiffOverride = $state(false);
  let authorizedByUserId = $state('');
  let overrideReason = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function matchInvoice() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/invoices/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        purchaseOrderId,
        branchId,
        invoiceNumber,
        totalCents,
        igvCents,
        priceDiffOverride,
        authorizedByUserId: authorizedByUserId || null,
        overrideReason: overrideReason || null,
        lines: [{ productId, invoicedQty, invoiceUnitCostCents }],
      }),
    });
    const json = (await res.json()) as {
      invoiceId?: string;
      invoiceStatus?: string;
      apAmountCents?: number;
      code?: string;
      error?: string;
    };
    messageOk = res.ok;
    if (!res.ok) {
      message =
        json.code === 'THREE_WAY_MISMATCH'
          ? 'Factura no cuadra. Activa override de precio con autorización.'
          : (json.error ?? `Error ${res.status}`);
      return;
    }
    message = `Factura ${json.invoiceId} · ${json.invoiceStatus} · CxP ${formatCents(json.apAmountCents ?? 0)}`;
  }
</script>

<svelte:head><title>Factura proveedor 3-way · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-factura-match">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="clipboard-check" size={12} /> Compras · Factura Proveedor</p>
      <h1 class="page-title">Match factura proveedor</h1>
      <p class="page-lede">Verificación 3-way: OC × Recepción × Factura. El CxP se genera al confirmar el match.</p>
    </div>
    <a class="link-action" href="/admin/oc-recepcion">
      <Icon name="arrow-left" size={14} />
      Recepción OC
    </a>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !threeWayOn}
    <div class="feature-off-banner" data-testid="admin-three-way-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_PURCHASING_THREE_WAY</code> desactivado.</span>
    </div>
  {:else}
    <div class="invoice-layout">
      <!-- OC & Factura -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Orden de compra</h2>
          <span class="section-tag">Referencia</span>
        </div>
        <div class="field-group">
          <label for="inv-po">ID de OC</label>
          <input id="inv-po" bind:value={purchaseOrderId} data-testid="inv-po-id" />
        </div>
        <div class="field-group">
          <label for="inv-branch">Sucursal</label>
          <input id="inv-branch" bind:value={branchId} data-testid="inv-branch" />
        </div>
        <div class="field-group">
          <label for="inv-number">Número de factura</label>
          <input id="inv-number" bind:value={invoiceNumber} data-testid="inv-number" placeholder="F001-00001" />
        </div>
      </section>

      <!-- Línea -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Línea de factura</h2>
          <span class="section-tag">Detalle</span>
        </div>
        <div class="field-group">
          <label for="inv-product">Producto</label>
          <input id="inv-product" bind:value={productId} data-testid="inv-product" />
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="inv-qty">Cant. facturada</label>
            <input id="inv-qty" type="number" bind:value={invoicedQty} data-testid="inv-qty" />
          </div>
          <div class="field-group">
            <label for="inv-cost">Costo unit. (cents)</label>
            <input id="inv-cost" type="number" bind:value={invoiceUnitCostCents} data-testid="inv-cost" />
          </div>
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="inv-total">Total (cents)</label>
            <input id="inv-total" type="number" bind:value={totalCents} data-testid="inv-total" />
          </div>
          <div class="field-group">
            <label for="inv-igv">IGV (cents)</label>
            <input id="inv-igv" type="number" bind:value={igvCents} data-testid="inv-igv" />
          </div>
        </div>
      </section>

      <!-- Override -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Override de precio</h2>
          <span class="badge {priceDiffOverride ? 'badge-warning' : 'badge-muted'}">
            {priceDiffOverride ? 'Activo' : 'Desactivado'}
          </span>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={priceDiffOverride} data-testid="inv-override" />
          <span>Autorizar diferencia de precio</span>
        </label>
        {#if priceDiffOverride}
          <div class="override-fields">
            <div class="field-group">
              <label for="inv-auth-user">Autorizado por (ID usuario)</label>
              <input id="inv-auth-user" bind:value={authorizedByUserId} data-testid="inv-auth-user" />
            </div>
            <div class="field-group">
              <label for="inv-reason">Motivo del override</label>
              <input id="inv-reason" bind:value={overrideReason} data-testid="inv-reason" />
            </div>
          </div>
        {/if}
        <button type="button" class="primary match-btn" data-testid="inv-match-btn" onclick={matchInvoice}>
          <Icon name="clipboard-check" size={14} />
          Confirmar match 3-way
        </button>
      </section>
    </div>
  {/if}
</div>

<style>
  .invoice-layout {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
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

  .override-fields {
    margin-bottom: 0.75rem;
  }

  .match-btn {
    width: 100%;
    margin-top: 0.5rem;
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

  @media (max-width: 900px) {
    .invoice-layout {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .invoice-layout {
      grid-template-columns: 1fr;
    }

    .two-col {
      grid-template-columns: 1fr;
    }
  }
</style>
