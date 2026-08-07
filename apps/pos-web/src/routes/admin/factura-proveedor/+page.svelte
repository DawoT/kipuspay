<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isPurchasingThreeWayEnabled } from '$lib/features';

  const threeWayOn = isPurchasingThreeWayEnabled();
  let purchaseOrderId = $state('po-demo');
  let branchId = $state('b-demo');
  let invoiceNumber = $state('F001-1');
  let productId = $state('p1');
  let invoicedQty = $state(4);
  let invoiceUnitCostCents = $state(500);
  let totalCents = $state(2000);
  let igvCents = $state(304);
  let priceDiffOverride = $state(false);
  let authorizedByUserId = $state('');
  let overrideReason = $state('');
  let message = $state('');

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
    if (!res.ok) {
      message =
        json.code === 'THREE_WAY_MISMATCH'
          ? 'Factura no cuadra. Activá override de precio con autorización.'
          : (json.error ?? `Error ${res.status}`);
      return;
    }
    message = `OK ${json.invoiceId} (${json.invoiceStatus}) CxP ${formatCents(json.apAmountCents ?? 0)}`;
  }
</script>

<section data-testid="admin-factura-match">
  <h1>Match factura proveedor (3-way)</h1>
  <p>
    <a href="/admin/oc-recepcion">← Recepción OC</a>
  </p>

  {#if !threeWayOn}
    <p data-testid="admin-three-way-off">PUBLIC_FEATURE_PURCHASING_THREE_WAY desactivado.</p>
  {:else}
    <label>
      OC
      <input bind:value={purchaseOrderId} data-testid="inv-po-id" />
    </label>
    <label>
      Sucursal
      <input bind:value={branchId} data-testid="inv-branch" />
    </label>
    <label>
      N° factura
      <input bind:value={invoiceNumber} data-testid="inv-number" />
    </label>
    <label>
      Producto
      <input bind:value={productId} data-testid="inv-product" />
    </label>
    <label>
      Qty facturada
      <input type="number" bind:value={invoicedQty} data-testid="inv-qty" />
    </label>
    <label>
      Costo unitario (cents)
      <input type="number" bind:value={invoiceUnitCostCents} data-testid="inv-cost" />
    </label>
    <label>
      Total cents
      <input type="number" bind:value={totalCents} data-testid="inv-total" />
    </label>
    <label>
      IGV cents
      <input type="number" bind:value={igvCents} data-testid="inv-igv" />
    </label>
    <label>
      <input type="checkbox" bind:checked={priceDiffOverride} data-testid="inv-override" />
      Override diferencia de precio
    </label>
    {#if priceDiffOverride}
      <label>
        Autorizado por user id
        <input bind:value={authorizedByUserId} data-testid="inv-auth-user" />
      </label>
      <label>
        Motivo
        <input bind:value={overrideReason} data-testid="inv-reason" />
      </label>
    {/if}
    <button type="button" data-testid="inv-match-btn" onclick={matchInvoice}>
      Confirmar match
    </button>
    {#if message}
      <p data-testid="inv-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  section {
    max-width: 32rem;
    margin: 1.5rem auto;
    padding: 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  label {
    display: block;
    margin: 0.5rem 0;
  }
  input:not([type='checkbox']) {
    display: block;
    width: 100%;
  }
</style>
