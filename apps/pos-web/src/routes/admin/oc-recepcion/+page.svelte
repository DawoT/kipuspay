<script lang="ts">
  import { isInventorySerialsEnabled, isPartialReceiveEnabled } from '$lib/features';

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
  let purchaseReceiptLineId = $state('');
  let locationId = $state('');
  let serialScan = $state('');
  let serialNumbers = $state<string[]>([]);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

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
    message = res.ok
      ? `Manifest ${json.manifestId} · ${json.serialCount} serie(s)`
      : [json.error, json.action].filter(Boolean).join(' ');
  }
</script>

<section class="admin-po-recv" data-testid="admin-oc-receive">
  <h1>Recepción parcial de OC</h1>
  <p class="lede">CxP solo por cantidad recibida en este receipt (Sprint 20). Con 3-way on, el CxP se crea al match de factura.</p>
  <p><a href="/admin/factura-proveedor" data-testid="admin-link-factura">Match factura 3-way</a></p>

  {#if !recvOn}
    <p data-testid="admin-po-off">PUBLIC_FEATURE_PURCHASING_PARTIAL_RECEIVE desactivado.</p>
  {:else}
    <label>
      OC
      <input bind:value={purchaseOrderId} data-testid="admin-po-id" />
    </label>
    <label>
      Sucursal
      <input bind:value={branchId} data-testid="admin-po-branch" />
    </label>
    <label>
      Producto
      <input bind:value={productId} data-testid="admin-po-product" />
    </label>
    <label>
      Cantidad
      <input type="number" bind:value={quantity} data-testid="admin-po-qty" />
    </label>
    <label>
      Costo unitario (céntimos)
      <input type="number" bind:value={unitCostCents} data-testid="admin-po-cost" />
    </label>
    <label>
      Lote (opcional)
      <input bind:value={batchNumber} data-testid="admin-po-batch" />
    </label>
    <label>
      Vence (opcional)
      <input bind:value={expiryDate} data-testid="admin-po-expiry" placeholder="YYYY-MM-DD" />
    </label>
    <button type="button" data-testid="admin-po-receive" onclick={partialReceive}>
      Registrar recepción
    </button>
    {#if serialsOn}
      <fieldset>
        <legend>Series de la línea recibida</legend>
        <label>
          purchase_receipt_line_id
          <input bind:value={purchaseReceiptLineId} autocomplete="off" />
        </label>
        <label>
          location_id
          <input bind:value={locationId} autocomplete="off" />
        </label>
        <label>
          Escáner de serie
          <input
            bind:value={serialScan}
            onkeydown={collectSerial}
            autocomplete="off"
            placeholder="Escanea y presiona Enter"
          />
        </label>
        <p aria-live="polite">{serialNumbers.length} serie(s) listas.</p>
        <button
          type="button"
          disabled={!purchaseReceiptLineId.trim() || serialNumbers.length === 0}
          onclick={createSerialManifest}
        >
          Asignar series a recepción
        </button>
      </fieldset>
    {/if}
    {#if message}
      <p data-testid="admin-po-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .admin-po-recv {
    max-width: 36rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .lede {
    color: #445;
    margin-bottom: 1.25rem;
  }
  label {
    display: block;
    margin: 0.75rem 0;
  }
  input {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.45rem 0.85rem;
  }
  fieldset {
    margin-top: 1.5rem;
    border: 1px solid #99a;
  }
</style>
