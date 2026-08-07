<script lang="ts">
  import { isPricingPromotionsEnabled } from '$lib/features';

  const promosOn = isPricingPromotionsEnabled();
  let name = $state('2x1 fin de semana');
  let appliesTo = $state('PRODUCT');
  let productId = $state('p1');
  let ruleJson = $state('{"kind":"buy_x_get_y","buyQty":1,"getQty":1}');
  let maxStackJson = $state('{}');
  let message = $state('');
  let listJson = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function createPromo() {
    message = '';
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
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    message = `OK ${json.promotionId}`;
  }

  async function listPromos() {
    message = '';
    const res = await fetch(`${apiBase()}/api/pricing/promotions`, {
      headers: { authorization: auth() },
    });
    const json = (await res.json()) as { promotions?: unknown[]; error?: string };
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    listJson = JSON.stringify(json.promotions ?? [], null, 2);
  }
</script>

<section data-testid="admin-promociones">
  <h1>Promociones</h1>
  <p>Admin/Owner — el precio final lo impone el servidor (solo IDs en caja).</p>

  {#if !promosOn}
    <p data-testid="admin-promos-off">PUBLIC_FEATURE_PRICING_PROMOTIONS desactivado.</p>
  {:else}
    <label>
      Nombre
      <input bind:value={name} data-testid="promo-name" />
    </label>
    <label>
      Aplica a
      <select bind:value={appliesTo} data-testid="promo-applies">
        <option value="PRODUCT">PRODUCT</option>
        <option value="CATEGORY">CATEGORY</option>
        <option value="LIST">LIST</option>
        <option value="CART">CART</option>
      </select>
    </label>
    <label>
      Producto (si PRODUCT)
      <input bind:value={productId} data-testid="promo-product" />
    </label>
    <label>
      rule_json
      <textarea bind:value={ruleJson} rows="3" data-testid="promo-rule"></textarea>
    </label>
    <label>
      max_stack_json
      <textarea bind:value={maxStackJson} rows="2" data-testid="promo-stack"></textarea>
    </label>
    <button type="button" data-testid="promo-create" onclick={createPromo}>Crear</button>
    <button type="button" data-testid="promo-list" onclick={listPromos}>Listar</button>
    {#if message}
      <p data-testid="promo-message">{message}</p>
    {/if}
    {#if listJson}
      <pre data-testid="promo-list-json">{listJson}</pre>
    {/if}
  {/if}
</section>
