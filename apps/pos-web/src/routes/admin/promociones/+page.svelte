<script lang="ts">
  import { isPricingPromotionsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const promosOn = isPricingPromotionsEnabled();
  let name = $state('2x1 fin de semana');
  let appliesTo = $state('PRODUCT');
  let productId = $state('p1');
  let ruleJson = $state('{"kind":"buy_x_get_y","buyQty":1,"getQty":1}');
  let maxStackJson = $state('{}');
  let message = $state('');
  let messageOk = $state(false);
  let listJson = $state('');
  let loading = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function createPromo() {
    message = '';
    loading = true;
    const res = await fetch(`${apiBase()}/api/pricing/promotions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        name,
        appliesTo,
        ruleJson: JSON.parse(ruleJson) as Record<string, unknown>,
        maxStackJson: JSON.parse(maxStackJson) as Record<string, unknown>,
        productIds: appliesTo === 'PRODUCT' && productId ? [productId] : [],
      }),
    });
    const json = (await res.json()) as { promotionId?: string; code?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Promoción creada · ID ${json.promotionId}` : (json.error ?? `Error ${res.status}`);
    loading = false;
  }

  async function listPromos() {
    message = '';
    loading = true;
    const res = await fetch(`${apiBase()}/api/pricing/promotions`, {
      headers: { authorization: auth() },
    });
    const json = (await res.json()) as { promotions?: unknown[]; error?: string };
    messageOk = res.ok;
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
    } else {
      listJson = JSON.stringify(json.promotions ?? [], null, 2);
    }
    loading = false;
  }
</script>

<svelte:head><title>Promociones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-promociones">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="percent" size={12} /> Ventas · Promociones</p>
      <h1 class="page-title">Promociones</h1>
      <p class="page-lede">Reglas de descuento y promociones. El precio final lo impone el servidor — solo IDs en caja.</p>
    </div>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !promosOn}
    <div class="feature-off-banner" data-testid="admin-promos-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_PRICING_PROMOTIONS</code> desactivado.</span>
    </div>
  {:else}
    <div class="promos-layout">
      <!-- Form -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Nueva promoción</h2>
          <span class="section-tag">Configuración</span>
        </div>

        <div class="field-group">
          <label for="promo-name">Nombre</label>
          <input id="promo-name" bind:value={name} data-testid="promo-name" placeholder="Ej. 2x1 fin de semana" />
        </div>

        <div class="field-group">
          <label for="promo-applies">Aplica a</label>
          <select id="promo-applies" bind:value={appliesTo} data-testid="promo-applies">
            <option value="PRODUCT">PRODUCT</option>
            <option value="CATEGORY">CATEGORY</option>
            <option value="LIST">LIST</option>
            <option value="CART">CART</option>
          </select>
        </div>

        <div class="field-group">
          <label for="promo-product">Producto (si PRODUCT)</label>
          <input id="promo-product" bind:value={productId} data-testid="promo-product" />
        </div>

        <div class="field-group">
          <label for="promo-rule">rule_json</label>
          <textarea id="promo-rule" bind:value={ruleJson} rows="4" data-testid="promo-rule" class="mono-area"></textarea>
        </div>

        <div class="field-group">
          <label for="promo-stack">max_stack_json</label>
          <textarea id="promo-stack" bind:value={maxStackJson} rows="2" data-testid="promo-stack" class="mono-area"></textarea>
        </div>

        <div class="btn-row">
          <button type="button" class="primary" data-testid="promo-create" onclick={createPromo} disabled={loading}>
            <Icon name="plus" size={14} />
            Crear promoción
          </button>
          <button type="button" class="secondary" data-testid="promo-list" onclick={listPromos} disabled={loading}>
            <Icon name="list" size={14} />
            Listar
          </button>
        </div>
      </section>

      <!-- JSON output -->
      {#if listJson}
        <section class="glass-card section-pad">
          <div class="card-header">
            <h2>Promociones activas</h2>
            <span class="badge badge-success">Cargado</span>
          </div>
          <pre class="json-view" data-testid="promo-list-json">{listJson}</pre>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .promos-layout {
    display: grid;
    grid-template-columns: minmax(320px, 0.8fr) 1fr;
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

  .mono-area {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    resize: vertical;
  }

  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .json-view {
    overflow: auto;
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    max-height: 60vh;
  }

  @media (max-width: 700px) {
    .promos-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
