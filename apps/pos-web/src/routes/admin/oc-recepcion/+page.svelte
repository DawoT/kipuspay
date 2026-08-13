<script lang="ts">
  import { isInventorySerialsEnabled, isPartialReceiveEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const recvOn = isPartialReceiveEnabled();
  const serialsOn = isInventorySerialsEnabled();
  let purchaseOrderId = $state('po-demo');
  let branchId = $state('b-demo');
  let productId = $state('p1');
  let quantity = $state(4);
  let unitCostCents = $state(500);
  let batchNumber = $state('');
  let expiryDate = $state('');
  let message = $state('');
  let messageOk = $state(false);
  let purchaseReceiptLineId = $state('');
  let locationId = $state('');
  let serialScan = $state('');
  let serialNumbers = $state<string[]>([]);

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';

  async function partialReceive() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/orders/partial-receive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        purchaseOrderId,
        branchId,
        lines: [
          {
            productId,
            quantity,
            unitCostCents,
            batchNumber: batchNumber || null,
            expiryDate: expiryDate || null,
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      receiptId?: string;
      nextStatus?: string;
      apAmountCents?: number;
      error?: string;
    };
    messageOk = res.ok;
    message = res.ok
      ? `Receipt ${json.receiptId} · ${json.nextStatus} · CxP ${json.apAmountCents} céntimos`
      : (json.error ?? 'error');
  }

  function collectSerial(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = serialScan.trim();
    if (value && !serialNumbers.includes(value)) serialNumbers = [...serialNumbers, value];
    serialScan = '';
  }

  async function createSerialManifest() {
    const res = await fetch(`${apiBase()}/api/inventory/serials/manifests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        branchId,
        purchaseReceiptLineId,
        locationId,
        serialNumbers,
      }),
    });
    const json = (await res.json()) as {
      manifestId?: string;
      serialCount?: number;
      error?: string;
      action?: string;
    };
    messageOk = res.ok;
    message = res.ok
      ? `Manifest ${json.manifestId} · ${json.serialCount} serie(s)`
      : [json.error, json.action].filter(Boolean).join(' ');
  }
</script>

<svelte:head><title>Recepción parcial OC · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-oc-receive">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="clipboard" size={12} /> Compras · Recepción OC</p>
      <h1 class="page-title">Recepción parcial de OC</h1>
      <p class="page-lede">CxP solo por cantidad recibida. Con 3-way on, el CxP se crea al match de factura.</p>
    </div>
    <a class="link-action" href="/admin/factura-proveedor" data-testid="admin-link-factura">
      <Icon name="clipboard-check" size={14} />
      Match factura 3-way
    </a>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !recvOn}
    <div class="feature-off-banner" data-testid="admin-po-off">
      <Icon name="info" size={18} />
      <span>La recepción parcial no está activa para este negocio.</span>
    </div>
  {:else}
    <div class="recv-layout">
      <!-- Recepción -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Datos de recepción</h2>
          <span class="section-tag">Línea</span>
        </div>
        <div class="field-group">
          <label for="po-id">Orden de compra</label>
          <input id="po-id" bind:value={purchaseOrderId} data-testid="admin-po-id" />
        </div>
        <div class="field-group">
          <label for="po-branch">Sucursal</label>
          <input id="po-branch" bind:value={branchId} data-testid="admin-po-branch" />
        </div>
        <div class="field-group">
          <label for="po-product">Producto</label>
          <input id="po-product" bind:value={productId} data-testid="admin-po-product" />
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="po-qty">Cantidad</label>
            <input id="po-qty" type="number" bind:value={quantity} data-testid="admin-po-qty" />
          </div>
          <div class="field-group">
            <label for="po-cost">Costo unitario</label>
            <input id="po-cost" type="number" bind:value={unitCostCents} data-testid="admin-po-cost" />
          </div>
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="po-batch">Lote (opcional)</label>
            <input id="po-batch" bind:value={batchNumber} data-testid="admin-po-batch" />
          </div>
          <div class="field-group">
            <label for="po-expiry">Vence (opcional)</label>
            <input id="po-expiry" type="date" bind:value={expiryDate} data-testid="admin-po-expiry" />
          </div>
        </div>
        <Button variant="primary" icon="check" data-testid="admin-po-receive" onclick={partialReceive}>
          Registrar recepción
        </Button>
      </section>

      <!-- Series -->
      {#if serialsOn}
        <section class="glass-card section-pad">
          <div class="card-header">
            <h2>Series de la línea</h2>
            <span class="badge {serialNumbers.length > 0 ? 'badge-success' : 'badge-muted'}">
              {serialNumbers.length} serie(s)
            </span>
          </div>
          <div class="field-group">
            <label for="serial-line-id">purchase_receipt_line_id</label>
            <input id="serial-line-id" bind:value={purchaseReceiptLineId} autocomplete="off" />
          </div>
          <div class="field-group">
            <label for="serial-loc-id">location_id</label>
            <input id="serial-loc-id" bind:value={locationId} autocomplete="off" />
          </div>
          <div class="field-group">
            <label for="serial-scan-input">Escáner de serie</label>
            <input
              id="serial-scan-input"
              bind:value={serialScan}
              onkeydown={collectSerial}
              autocomplete="off"
              placeholder="Escanea y presiona Enter"
            />
          </div>
          <p class="serial-count" aria-live="polite">{serialNumbers.length} serie(s) listas.</p>
          <Button variant="primary" icon="barcode" disabled={!purchaseReceiptLineId.trim() || serialNumbers.length === 0} onclick={createSerialManifest}>
          Asignar series a recepción
        </Button>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .recv-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }




  .serial-count {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.625rem;
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
    .recv-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
