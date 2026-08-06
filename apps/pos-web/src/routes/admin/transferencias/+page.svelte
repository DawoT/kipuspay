<script lang="ts">
  import { isStockTransfersEnabled } from '$lib/features';

  const xferOn = isStockTransfersEnabled();
  let fromBranchId = $state('b-origen');
  let toBranchId = $state('b-destino');
  let productId = $state('p1');
  let qtySent = $state(5);
  let transferId = $state('');
  let lineId = $state('');
  let qtyReceived = $state(5);
  let qtyShrink = $state(0);
  let shrinkReason = $state('');
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function createTransfer() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        fromBranchId,
        toBranchId,
        lines: [{ productId, qtySent }],
      }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    if (res.ok && json.id) transferId = json.id;
    message = res.ok ? `Transferencia ${json.id} DRAFT` : (json.error ?? 'error');
  }

  async function ship() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/ship`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ transferId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `Enviada · ${json.status}` : (json.error ?? 'error');
  }

  async function receive() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/receive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        transferId,
        lines: [{ lineId, qtyReceived, qtyShrink, shrinkReason: shrinkReason || null }],
      }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `Recibida · ${json.status}` : (json.error ?? 'error');
  }

  async function cancel() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ transferId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `Cancelada · ${json.status}` : (json.error ?? 'error');
  }
</script>

<section class="admin-xfer" data-testid="admin-transferencias">
  <h1>Transferencias entre sucursales</h1>
  <p class="lede">Crear, enviar, recibir o cancelar (Sprint 20 · conservación origen+destino+merma).</p>

  {#if !xferOn}
    <p data-testid="admin-xfer-off">PUBLIC_FEATURE_STOCK_TRANSFERS desactivado.</p>
  {:else}
    <label>
      Origen
      <input bind:value={fromBranchId} data-testid="admin-xfer-from" />
    </label>
    <label>
      Destino
      <input bind:value={toBranchId} data-testid="admin-xfer-to" />
    </label>
    <label>
      Producto
      <input bind:value={productId} data-testid="admin-xfer-product" />
    </label>
    <label>
      Cantidad enviada
      <input type="number" bind:value={qtySent} data-testid="admin-xfer-qty" />
    </label>
    <button type="button" data-testid="admin-xfer-create" onclick={createTransfer}>
      Crear borrador
    </button>

    <h2>Operar transferencia</h2>
    <label>
      Transfer ID
      <input bind:value={transferId} data-testid="admin-xfer-id" />
    </label>
    <button type="button" data-testid="admin-xfer-ship" onclick={ship}>Enviar</button>
    <button type="button" data-testid="admin-xfer-cancel" onclick={cancel}>Cancelar</button>

    <h2>Recibir</h2>
    <label>
      Line ID
      <input bind:value={lineId} data-testid="admin-xfer-line" />
    </label>
    <label>
      Recibido
      <input type="number" bind:value={qtyReceived} data-testid="admin-xfer-received" />
    </label>
    <label>
      Merma
      <input type="number" bind:value={qtyShrink} data-testid="admin-xfer-shrink" />
    </label>
    <label>
      Motivo merma
      <textarea bind:value={shrinkReason} data-testid="admin-xfer-reason" rows="2"></textarea>
    </label>
    <button type="button" data-testid="admin-xfer-receive" onclick={receive}>Recibir</button>

    {#if message}
      <p data-testid="admin-xfer-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .admin-xfer {
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
  input,
  textarea {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
  }
  button {
    margin: 0.35rem 0.35rem 0.35rem 0;
    padding: 0.45rem 0.85rem;
  }
  h2 {
    margin-top: 1.5rem;
    font-size: 1.1rem;
  }
</style>
