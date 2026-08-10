<script lang="ts">
  import { isInventoryOpsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const invOn = isInventoryOpsEnabled();
  let branchId = $state('b-demo');
  let productId = $state('p1');
  let countedQty = $state(0);
  let systemQty = $state(0);
  let lossQty = $state(1);
  let evidenceKey = $state('r2/merma/demo.jpg');
  let reason = $state('');
  let message = $state('');
  let messageOk = $state(false);

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
    messageOk = res.ok;
    message = res.ok ? `Conteo ${json.id} abierto · estado COUNTING` : (json.error ?? 'error');
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
    messageOk = res.ok;
    message = res.ok ? `Merma ${json.id} registrada · estado PENDING` : (json.error ?? 'error');
  }
</script>

<svelte:head><title>Inventario · Conteo & Merma · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-inventario">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="box" size={12} /> Inventario · Conteo & Merma</p>
      <h1 class="page-title">Control de inventario</h1>
      <p class="page-lede">Hoja ciega de conteo físico y registro de mermas con evidencia.</p>
    </div>
    <a class="link-action" href="/admin/series">
      <Icon name="barcode" size={14} />
      Buscar serie
    </a>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !invOn}
    <div class="feature-off-banner" data-testid="admin-inv-off">
      <Icon name="info" size={18} />
      <span><code>FEATURE_INVENTORY_*</code> desactivado. Activa el flag en el dashboard de configuración.</span>
    </div>
  {:else}
    <div class="inv-grid">
      <!-- Contexto -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Contexto</h2>
          <span class="section-tag">Sucursal & Producto</span>
        </div>
        <div class="field-group">
          <label for="branch-input">Sucursal</label>
          <input id="branch-input" bind:value={branchId} data-testid="admin-inv-branch" />
        </div>
        <div class="field-group">
          <label for="product-input">Producto</label>
          <input id="product-input" bind:value={productId} data-testid="admin-inv-product" />
        </div>
      </section>

      <!-- Conteo físico -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Conteo físico</h2>
          <span class="badge badge-warning">Hoja ciega</span>
        </div>
        <p class="hint-text">El sistema no muestra stock esperado en hoja ciega hasta el review.</p>
        <div class="field-group">
          <label for="counted-input">Contado</label>
          <input type="number" id="counted-input" bind:value={countedQty} data-testid="admin-inv-counted" />
        </div>
        <div class="field-group">
          <label for="system-input">Sistema (solo review)</label>
          <input type="number" id="system-input" bind:value={systemQty} data-testid="admin-inv-system" />
        </div>
        <button type="button" class="primary" data-testid="admin-inv-count-start" onclick={startCount}>
          <Icon name="clipboard-check" size={14} />
          Abrir conteo ciego
        </button>
      </section>

      <!-- Merma -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Registro de merma</h2>
          <span class="badge badge-danger">DAMAGED</span>
        </div>
        <div class="field-group">
          <label for="loss-qty-input">Cantidad</label>
          <input type="number" id="loss-qty-input" bind:value={lossQty} data-testid="admin-inv-loss-qty" />
        </div>
        <div class="field-group">
          <label for="evidence-input">Evidencia R2 Key</label>
          <input id="evidence-input" bind:value={evidenceKey} data-testid="admin-inv-evidence" placeholder="r2/merma/foto.jpg" />
        </div>
        <div class="field-group">
          <label for="reason-input">Motivo</label>
          <textarea id="reason-input" bind:value={reason} data-testid="admin-inv-reason" rows="3" placeholder="Describe la causa de la merma…"></textarea>
        </div>
        <button type="button" class="primary danger-btn" data-testid="admin-inv-loss-create" onclick={createLoss}>
          <Icon name="alert" size={14} />
          Registrar merma
        </button>
      </section>
    </div>
  {/if}
</div>

<style>
  .inv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
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

  .hint-text {
    font-size: 0.8125rem;
    color: var(--text-dim);
    margin-bottom: 0.875rem;
    line-height: 1.4;
  }

  .danger-btn {
    background: rgba(217, 106, 60, 0.15);
    color: var(--rose-red);
    border: 1px solid rgba(217, 106, 60, 0.35);
  }

  .danger-btn:hover {
    background: rgba(217, 106, 60, 0.25);
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
    .inv-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .inv-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
