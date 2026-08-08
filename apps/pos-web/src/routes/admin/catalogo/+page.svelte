<script lang="ts">
  import {
    isCatalogUomEnabled,
    isCatalogVariantsEnabled,
    isInventorySerialsEnabled,
  } from '$lib/features';

  const variantsOn = isCatalogVariantsEnabled();
  const uomOn = isCatalogUomEnabled();
  const serialsOn = isInventorySerialsEnabled();
  let productId = $state('');
  let parentProductId = $state('');
  let overrideCents = $state('');
  let uomCode = $state('UND');
  let numerator = $state(1);
  let denominator = $state(1);
  let isBase = $state(true);
  let message = $state('');
  let catalog = $state<unknown[]>([]);
  let serialTrackingMode = $state('NONE');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });

  async function loadCatalog() {
    const response = await fetch(`${apiBase()}/api/catalog/variants-uom`, {
      headers: { authorization: auth() },
    });
    const json = (await response.json()) as { items?: unknown[]; error?: string };
    message = response.ok ? '' : (json.error ?? `Error ${response.status}`);
    catalog = response.ok ? (json.items ?? []) : [];
  }

  async function saveVariant() {
    const response = await fetch(`${apiBase()}/api/catalog/variants/${productId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        parentProductId: parentProductId || null,
        variantPriceOverrideCents: overrideCents === '' ? null : parseInt(overrideCents, 10),
      }),
    });
    const json = (await response.json()) as { error?: string };
    message = response.ok ? 'Variante guardada.' : (json.error ?? `Error ${response.status}`);
    if (response.ok) await loadCatalog();
  }

  async function saveUom() {
    const response = await fetch(`${apiBase()}/api/catalog/uoms`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        productId,
        uomCode,
        factorNumerator: numerator,
        factorDenominator: denominator,
        isBase,
      }),
    });
    const json = (await response.json()) as { error?: string };
    message = response.ok ? 'Unidad guardada.' : (json.error ?? `Error ${response.status}`);
    if (response.ok) await loadCatalog();
  }

  async function saveSerialTracking() {
    const response = await fetch(`${apiBase()}/api/inventory/serials/tracking`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ productId, serialTrackingMode }),
    });
    const json = (await response.json()) as { error?: string; action?: string };
    message = response.ok
      ? 'Seguimiento serial guardado por el servidor.'
      : [json.error, json.action].filter(Boolean).join(' ');
  }
</script>

<svelte:head><title>Catálogo exacto · KipusPay</title></svelte:head>

<main class="catalog-shell" data-testid="admin-catalogo">
  <header>
    <p class="eyebrow">Catálogo · Variantes y unidades</p>
    <h1>Cada presentación,<br />una cantidad exacta.</h1>
    <p class="lede">
      Organiza familias de producto y factores racionales. El stock siempre queda en la
      unidad base de cada variante.
    </p>
  </header>

  {#if !variantsOn && !uomOn && !serialsOn}
    <aside class="off" data-testid="catalog-off">
      Activa una capability de catálogo o PUBLIC_FEATURE_INVENTORY_SERIALS para editar.
    </aside>
  {:else}
    <section class="workbench">
      <div class="rail">
        <label>Producto o variante <input bind:value={productId} placeholder="ID del producto" /></label>
        {#if variantsOn}
          <fieldset>
            <legend>Familia</legend>
            <label>Producto padre <input bind:value={parentProductId} placeholder="Vacío = padre" /></label>
            <label>Precio propio (céntimos) <input bind:value={overrideCents} inputmode="numeric" /></label>
            <button type="button" onclick={saveVariant}>Guardar variante</button>
          </fieldset>
        {/if}
        {#if uomOn}
          <fieldset>
            <legend>Presentación</legend>
            <label>Código <input bind:value={uomCode} maxlength="12" /></label>
            <div class="ratio" aria-label="Factor racional">
              <label>Numerador <input type="number" min="1" bind:value={numerator} /></label>
              <span>/</span>
              <label>Denominador <input type="number" min="1" bind:value={denominator} /></label>
            </div>
            <label class="check"><input type="checkbox" bind:checked={isBase} /> Unidad base 1/1</label>
            <button type="button" onclick={saveUom}>Guardar unidad</button>
          </fieldset>
        {/if}
        {#if serialsOn}
          <fieldset>
            <legend>Identidad serial</legend>
            <label>
              Seguimiento
              <select bind:value={serialTrackingMode}>
                <option value="NONE">Sin serie</option>
                <option value="REQUIRED">Serie obligatoria (una unidad)</option>
              </select>
            </label>
            <button type="button" onclick={saveSerialTracking}>Guardar seguimiento serial</button>
            <a href="/admin/series">Buscar y gestionar series</a>
          </fieldset>
        {/if}
      </div>

      <div class="ledger">
        <div class="ledger-head">
          <h2>Mapa del catálogo</h2>
          <button class="secondary" type="button" onclick={loadCatalog}>Actualizar</button>
        </div>
        {#if catalog.length === 0}
          <p class="empty">Carga el catálogo para revisar padres, variantes y presentaciones.</p>
        {:else}
          <pre>{JSON.stringify(catalog, null, 2)}</pre>
        {/if}
      </div>
    </section>
    {#if message}<p class="message" aria-live="polite">{message}</p>{/if}
  {/if}
</main>

<style>
  :global(body) { background: #edf3f0; color: #16332c; }
  .catalog-shell { max-width: 1120px; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  header { border-left: 7px solid #ff6b35; padding-left: 1.5rem; margin-bottom: 2rem; }
  .eyebrow, legend { font: 700 .72rem/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #196b57; }
  h1 { margin: .35rem 0; font: 800 clamp(2.3rem, 6vw, 4.8rem)/.92 system-ui, sans-serif; letter-spacing: -.055em; }
  .lede { max-width: 57ch; color: #48655e; }
  .workbench { display: grid; grid-template-columns: minmax(270px, .8fr) minmax(0, 1.4fr); gap: 1rem; }
  .rail, .ledger, .off { background: #fff; border: 1px solid #c9d9d4; box-shadow: 0 12px 34px rgb(22 51 44 / 8%); }
  .rail, .ledger { padding: 1.25rem; }
  fieldset { border: 0; border-top: 1px solid #dce7e3; margin: 1.25rem 0 0; padding: 1.25rem 0 0; }
  label { display: grid; gap: .38rem; margin-bottom: .85rem; font-weight: 650; }
  input, select { width: 100%; box-sizing: border-box; border: 1px solid #9bb8ae; background: #f8fbfa; padding: .72rem; color: inherit; }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #ffb29a; outline-offset: 2px; }
  .ratio { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: .65rem; }
  .check { grid-template-columns: auto 1fr; align-items: center; }
  .check input { width: auto; }
  button { border: 0; background: #196b57; color: white; padding: .78rem 1rem; font-weight: 750; cursor: pointer; }
  .secondary { background: transparent; color: #196b57; border: 1px solid #9bb8ae; }
  .ledger-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  h2 { margin: 0; font-size: 1.15rem; }
  pre { overflow: auto; padding: 1rem; background: #16332c; color: #dff5ed; font-size: .76rem; }
  .empty, .message, .off { color: #57716a; }
  .off { padding: 1.25rem; }
  .message { border-left: 4px solid #ff6b35; padding-left: .8rem; }
  @media (max-width: 720px) { .workbench { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
