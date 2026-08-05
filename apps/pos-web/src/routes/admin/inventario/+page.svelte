<script lang="ts">
  import { isInventoryOpsEnabled } from '$lib/features';

  const invOn = isInventoryOpsEnabled();
  let branchId = $state('b-demo');
  let productId = $state('p1');
  let countedQty = $state(0);
  let systemQty = $state(0);
  let lossQty = $state(1);
  let evidenceKey = $state('r2/merma/demo.jpg');
  let reason = $state('');
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function startCount() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/counts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ branchId, differenceThresholdCents: 1000 }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    message = res.ok ? `Conteo ${json.id} COUNTING` : (json.error ?? 'error');
  }

  async function createLoss() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/losses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        branchId,
        productId,
        quantity: lossQty,
        category: 'DAMAGED',
        evidenceR2Key: evidenceKey,
        reason,
      }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    message = res.ok ? `Merma ${json.id} PENDING` : (json.error ?? 'error');
  }
</script>

<section class="admin-inv" data-testid="admin-inventario">
  <h1>Inventario · conteo y merma</h1>
  <p class="lede">Hoja ciega y mermas con evidencia (Sprint 18).</p>

  {#if !invOn}
    <p data-testid="admin-inv-off">FEATURE_INVENTORY_* desactivado.</p>
  {:else}
    <label>
      Sucursal
      <input bind:value={branchId} data-testid="admin-inv-branch" />
    </label>
    <label>
      Producto
      <input bind:value={productId} data-testid="admin-inv-product" />
    </label>

    <h2>Conteo físico</h2>
    <p class="hint">El sistema no muestra stock esperado en hoja ciega hasta el review.</p>
    <label>
      Contado
      <input type="number" bind:value={countedQty} data-testid="admin-inv-counted" />
    </label>
    <label>
      Sistema (solo review)
      <input type="number" bind:value={systemQty} data-testid="admin-inv-system" />
    </label>
    <button type="button" data-testid="admin-inv-count-start" onclick={startCount}>
      Abrir conteo ciego
    </button>

    <h2>Merma</h2>
    <label>
      Cantidad
      <input type="number" bind:value={lossQty} data-testid="admin-inv-loss-qty" />
    </label>
    <label>
      Evidencia R2
      <input bind:value={evidenceKey} data-testid="admin-inv-evidence" />
    </label>
    <label>
      Motivo
      <textarea bind:value={reason} data-testid="admin-inv-reason" rows="2"></textarea>
    </label>
    <button type="button" data-testid="admin-inv-loss-create" onclick={createLoss}>
      Registrar merma
    </button>

    {#if message}
      <p data-testid="admin-inv-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .admin-inv {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
  }
  .lede,
  .hint {
    color: #3d4450;
  }
  label {
    display: block;
    margin: 0.5rem 0;
  }
  input,
  textarea {
    width: 100%;
    max-width: 20rem;
    display: block;
    margin-top: 0.25rem;
    padding: 0.35rem 0.5rem;
  }
  button {
    margin: 0.75rem 0;
    padding: 0.55rem 1rem;
    background: #1a2332;
    color: #f8f6f1;
    border: 0;
    cursor: pointer;
  }
</style>
