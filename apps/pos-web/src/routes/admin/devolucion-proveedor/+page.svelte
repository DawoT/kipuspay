<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isPurchasingReturnsEnabled } from '$lib/features';

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
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    message = `CLOSED ${returnId}`;
  }

  async function cancelReturn() {
    message = '';
    const res = await fetch(`${apiBase()}/api/purchasing/returns/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ returnId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    message = `CANCELLED ${returnId}`;
  }
</script>

<section data-testid="admin-supplier-return">
  <h1>Devolución a proveedor</h1>
  <p>
    <a href="/admin/factura-proveedor">← Factura 3-way</a>
  </p>
  {#if !returnsOn}
    <p data-testid="admin-supplier-return-off">PUBLIC_FEATURE_PURCHASING_RETURNS desactivado.</p>
  {:else}
    <label>
      Recepción
      <input bind:value={purchaseReceiptId} data-testid="sr-receipt" />
    </label>
    <label>
      Factura (opcional)
      <input bind:value={supplierInvoiceId} data-testid="sr-invoice" />
    </label>
    <label>
      Producto
      <input bind:value={productId} data-testid="sr-product" />
    </label>
    <label>
      Microunidades
      <input type="number" bind:value={enteredQuantityMicrounits} data-testid="sr-qty" />
    </label>
    <label>
      Motivo
      <input bind:value={reason} data-testid="sr-reason" />
    </label>
    <button type="button" data-testid="sr-create" onclick={createReturn}>Crear OPEN</button>
    <label>
      Return ID
      <input bind:value={returnId} data-testid="sr-id" />
    </label>
    <label>
      Override precio
      <input type="checkbox" bind:checked={priceDiffOverride} data-testid="sr-override" />
    </label>
    <label>
      Autorizado por
      <input bind:value={authorizedByUserId} data-testid="sr-authz" />
    </label>
    <button type="button" data-testid="sr-close" onclick={closeReturn}>Cerrar</button>
    <button type="button" data-testid="sr-cancel" onclick={cancelReturn}>Cancelar</button>
    {#if message}
      <p data-testid="sr-message">{message}</p>
    {/if}
  {/if}
</section>
