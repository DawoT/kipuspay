<script lang="ts">
  
  import { initTenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { formatCents } from '$lib/cents';
  import { isLedgerArApEnabled, isPurchasingThreeWayEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { workflowStatusLabel } from '$lib/ui/ops-copy';
import { apiFetch } from '$lib/auth/api-client';

  const threeWayOn = isPurchasingThreeWayEnabled();
  const apPayOn = isLedgerArApEnabled();
  let accountsPayableId = $state('');
  let apPayCents = $state(0);
  let purchaseOrderId = $state('');
  let branchId = $state(initTenantBranchId());
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


  async function matchInvoice() {
    message = '';
    const res = await apiFetch('/api/purchasing/invoices/match', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        purchaseOrderId,
        branchId: branchId.trim() || initTenantBranchId(),
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
    message = `Factura ${json.invoiceId} · ${workflowStatusLabel(json.invoiceStatus ?? 'OPEN')} · por pagar ${formatCents(json.apAmountCents ?? 0)}`;
  }

  async function payAp() {
    message = '';
    const res = await apiFetch('/api/ledger/ap/pay', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountsPayableId,
        amountCents: apPayCents,
        paymentMethod: 'transfer',
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
      }),
    });
    const json = (await res.json()) as { nextBalanceCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok
      ? `Pago registrado · saldo ${formatCents(json.nextBalanceCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Factura proveedor · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-factura-match">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="clipboard-check" size={12} /> Compras · Factura Proveedor</p>
      <h1 class="page-title">Conciliar factura de proveedor</h1>
      <p class="page-lede">Orden, recepción y factura deben cuadrar. La cuenta por pagar se crea al confirmar.</p>
    </div>
    <a class="link-action" href="/admin/oc-recepcion">
      <Icon name="arrow-left" size={14} />
      Recepción OC
    </a>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !threeWayOn}
    <div class="feature-off-banner" data-testid="admin-three-way-off">
      <Icon name="info" size={18} />
      <span>La conciliación de compras no está activa para este negocio.</span>
    </div>
  {:else}
    <div class="invoice-layout">
      <!-- OC & Factura -->
      <section class="ledger-card section-pad">
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
      <section class="ledger-card section-pad">
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
            <label for="inv-cost">Costo unitario</label>
            <input id="inv-cost" type="number" bind:value={invoiceUnitCostCents} data-testid="inv-cost" />
          </div>
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="inv-total">Total</label>
            <input id="inv-total" type="number" bind:value={totalCents} data-testid="inv-total" />
          </div>
          <div class="field-group">
            <label for="inv-igv">IGV</label>
            <input id="inv-igv" type="number" bind:value={igvCents} data-testid="inv-igv" />
          </div>
        </div>
      </section>

      <!-- Override -->
      <section class="ledger-card section-pad">
        <div class="card-header">
          <h2>Ajuste de precio</h2>
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
        <Button variant="primary" size="full" icon="clipboard-check" data-testid="inv-match-btn" onclick={matchInvoice}>
          Confirmar conciliación
        </Button>
      </section>
    </div>
    {#if apPayOn}
      <section class="ledger-card section-pad" data-testid="admin-ap-pay">
        <div class="card-header">
          <h2>Pagar cuenta por pagar</h2>
        </div>
        <div class="field-group">
          <label for="ap-id">Cuenta por pagar</label>
          <input id="ap-id" bind:value={accountsPayableId} data-testid="inv-ap-id" />
        </div>
        <div class="field-group">
          <label for="ap-cents">Monto</label>
          <input id="ap-cents" type="number" bind:value={apPayCents} data-testid="inv-ap-cents" />
        </div>
        <Button variant="secondary" icon="dollar" data-testid="inv-ap-pay" onclick={() => void payAp()}>
          Registrar pago
        </Button>
      </section>
    {/if}
  {/if}
</div>

<style>
  .invoice-layout {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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

  .override-fields {
    margin-bottom: 0.75rem;
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

  }
</style>
