<script lang="ts">
  import { isPricingPromotionsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { catalogItemLabel } from '$lib/ui/ops-copy';
  import { apiFetch } from '$lib/auth/api-client';

  const promosOn = isPricingPromotionsEnabled();
  let name = $state('2x1 fin de semana');
  let appliesTo = $state('PRODUCT');
  let productId = $state('p1');
  let ruleJson = $state('');
  let maxStackJson = $state('');
  let message = $state('');
  let messageOk = $state(false);
  let promotions = $state<{ name: string }[]>([]);
  let listed = $state(false);
  let loading = $state(false);

  async function createPromo() {
    message = '';
    loading = true;
    let rule: Record<string, unknown>;
    let stack: Record<string, unknown>;
    try {
      rule = ruleJson.trim()
        ? (JSON.parse(ruleJson) as Record<string, unknown>)
        : { kind: 'buy_x_get_y', buyQty: 1, getQty: 1 };
      stack = maxStackJson.trim() ? (JSON.parse(maxStackJson) as Record<string, unknown>) : {};
    } catch {
      messageOk = false;
      message = 'La regla no se pudo leer. Déjala vacía para un 2x1.';
      loading = false;
      return;
    }
    const res = await apiFetch('/api/pricing/promotions', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        appliesTo,
        ruleJson: rule,
        maxStackJson: stack,
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
    const res = await apiFetch('/api/pricing/promotions', {
      storage: localStorage,
    });
    const json = (await res.json()) as { promotions?: unknown[]; error?: string };
    messageOk = res.ok;
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      promotions = [];
    } else {
      promotions = (json.promotions ?? []).map((p, i) => ({ name: catalogItemLabel(p, i) }));
    }
    listed = true;
    loading = false;
  }
</script>

<svelte:head><title>Promociones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-promociones">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="percent" size={12} /> Ventas · Promociones</p>
      <h1 class="page-title">Promociones</h1>
      <p class="page-lede">Descuentos y 2x1. El precio final lo confirma el cobro; en caja solo se elige la promoción.</p>
    </div>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !promosOn}
    <div class="feature-off-banner" data-testid="admin-promos-off">
      <Icon name="info" size={18} />
      <span>Las promociones no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="promos-layout">
      <!-- Form -->
      <section class="ledger-card section-pad">
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
            <option value="PRODUCT">Producto</option>
            <option value="CATEGORY">Categoría</option>
            <option value="LIST">Lista</option>
            <option value="CART">Carrito</option>
          </select>
        </div>

        <div class="field-group">
          <label for="promo-product">Producto (si aplica a un producto)</label>
          <input id="promo-product" bind:value={productId} data-testid="promo-product" />
        </div>

        <div class="field-group">
          <label for="promo-rule">Regla de descuento</label>
          <textarea id="promo-rule" bind:value={ruleJson} rows="4" data-testid="promo-rule" class="mono-area" placeholder="Vacío = 2x1"></textarea>
        </div>

        <div class="field-group">
          <label for="promo-stack">Tope de acumulación</label>
          <textarea id="promo-stack" bind:value={maxStackJson} rows="2" data-testid="promo-stack" class="mono-area" placeholder="Opcional"></textarea>
        </div>

        <div class="btn-row">
          <Button variant="primary" icon="plus" data-testid="promo-create" onclick={createPromo} disabled={loading}>
          Crear promoción
        </Button>
          <Button variant="secondary" icon="list" data-testid="promo-list" onclick={listPromos} disabled={loading}>
          Listar
        </Button>
        </div>
      </section>

      {#if listed}
        <section class="ledger-card section-pad">
          <div class="card-header">
            <h2>Promociones activas</h2>
            <span class="badge badge-success">{promotions.length}</span>
          </div>
          {#if promotions.length === 0}
            <p class="page-lede">No hay promociones cargadas.</p>
          {:else}
            <ul class="item-list" data-testid="promo-list-json">
              {#each promotions as p}
                <li>{p.name}</li>
              {/each}
            </ul>
          {/if}
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



  .mono-area {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    resize: vertical;
  }


  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .item-list li {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 899px) {
    .promos-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
