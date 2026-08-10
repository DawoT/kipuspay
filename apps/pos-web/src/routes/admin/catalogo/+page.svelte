<script lang="ts">
  import {
    isCatalogUomEnabled,
    isCatalogVariantsEnabled,
    isInventorySerialsEnabled,
  } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

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
  let messageOk = $state(false);
  let catalog = $state<unknown[]>([]);
  let serialTrackingMode = $state('NONE');
  let loading = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });

  async function loadCatalog() {
    loading = true;
    const response = await fetch(`${apiBase()}/api/catalog/variants-uom`, {
      headers: { authorization: auth() },
    });
    const json = (await response.json()) as { items?: unknown[]; error?: string };
    message = response.ok ? '' : (json.error ?? `Error ${response.status}`);
    messageOk = response.ok;
    catalog = response.ok ? (json.items ?? []) : [];
    loading = false;
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
    messageOk = response.ok;
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
    messageOk = response.ok;
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
    messageOk = response.ok;
    message = response.ok
      ? 'Seguimiento serial guardado por el servidor.'
      : [json.error, json.action].filter(Boolean).join(' ');
  }
</script>

<svelte:head><title>Catálogo exacto · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-catalogo">
  <!-- Masthead -->
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="layers" size={12} /> Catálogo · Variantes & UOM</p>
      <h1 class="page-title">Catálogo exacto</h1>
      <p class="page-lede">
        Organiza familias de producto y factores racionales. El stock siempre queda en la
        unidad base de cada variante.
      </p>
    </div>
    <a class="btn-etiquetas" href="/admin/etiquetas">
      <Icon name="tag" size={14} />
      Etiquetas de precio
    </a>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !variantsOn && !uomOn && !serialsOn}
    <div class="feature-off-banner" data-testid="catalog-off">
      <Icon name="info" size={18} />
      <span>
        Activa una capability de catálogo o <code>PUBLIC_FEATURE_INVENTORY_SERIALS</code> para editar.
      </span>
    </div>
  {:else}
    <div class="workbench">
      <!-- Rail: form -->
      <aside class="glass-card rail">
        <div class="card-header">
          <h2>Editor</h2>
          <span class="section-tag">Configuración</span>
        </div>

        <div class="field-group">
          <label for="productId-input">Producto o variante</label>
          <input
            id="productId-input"
            bind:value={productId}
            placeholder="ID del producto"
          />
        </div>

        {#if variantsOn}
          <fieldset class="card-section">
            <legend>Familia de variante</legend>
            <div class="field-group">
              <label for="parent-input">Producto padre</label>
              <input id="parent-input" bind:value={parentProductId} placeholder="Vacío = es padre" />
            </div>
            <div class="field-group">
              <label for="price-input">Precio propio (céntimos)</label>
              <input id="price-input" bind:value={overrideCents} inputmode="numeric" placeholder="Dejar vacío = hereda" />
            </div>
            <button type="button" class="primary" onclick={saveVariant}>
              <Icon name="check" size={14} />
              Guardar variante
            </button>
          </fieldset>
        {/if}

        {#if uomOn}
          <fieldset class="card-section">
            <legend>Presentación (UOM)</legend>
            <div class="field-group">
              <label for="uom-code-input">Código</label>
              <input id="uom-code-input" bind:value={uomCode} maxlength="12" />
            </div>
            <div class="ratio-row" aria-label="Factor racional">
              <div class="field-group">
                <label for="uom-num-input">Numerador</label>
                <input id="uom-num-input" type="number" min="1" bind:value={numerator} />
              </div>
              <span class="ratio-sep">/</span>
              <div class="field-group">
                <label for="uom-den-input">Denominador</label>
                <input id="uom-den-input" type="number" min="1" bind:value={denominator} />
              </div>
            </div>
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={isBase} />
              <span>Unidad base 1/1</span>
            </label>
            <button type="button" class="primary" onclick={saveUom}>
              <Icon name="check" size={14} />
              Guardar unidad
            </button>
          </fieldset>
        {/if}

        {#if serialsOn}
          <fieldset class="card-section">
            <legend>Identidad serial</legend>
            <div class="field-group">
              <label for="serial-select">Seguimiento</label>
              <select id="serial-select" bind:value={serialTrackingMode}>
                <option value="NONE">Sin serie</option>
                <option value="REQUIRED">Serie obligatoria (una unidad)</option>
              </select>
            </div>
            <button type="button" class="primary" onclick={saveSerialTracking}>
              <Icon name="barcode" size={14} />
              Guardar seguimiento serial
            </button>
            <a class="link-inline" href="/admin/series">
              <Icon name="arrow-right" size={13} />
              Buscar y gestionar series
            </a>
          </fieldset>
        {/if}
      </aside>

      <!-- Ledger: catalog map -->
      <section class="glass-card ledger">
        <div class="card-header">
          <h2>Mapa del catálogo</h2>
          <button type="button" class="secondary" onclick={loadCatalog} disabled={loading}>
            <Icon name="refresh" size={14} class={loading ? 'spin' : ''} />
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {#if catalog.length === 0}
          <div class="ledger-empty">
            <Icon name="layers" size={28} />
            <span>Carga el catálogo para revisar padres, variantes y presentaciones.</span>
          </div>
        {:else}
          <pre class="json-view">{JSON.stringify(catalog, null, 2)}</pre>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .workbench {
    display: grid;
    grid-template-columns: minmax(280px, 0.75fr) minmax(0, 1.5fr);
    gap: 1.25rem;
    align-items: start;
  }

  .rail {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .ledger {
    padding: 1.25rem;
  }

  .card-section {
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 1rem 0 0;
    padding: 1rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .card-section legend {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-primary);
    padding: 0;
    margin-bottom: 0.5rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .ratio-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 0.625rem;
  }

  .ratio-sep {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-muted);
    padding-bottom: 0.5rem;
    text-align: center;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .checkbox-row input {
    width: auto;
    cursor: pointer;
    accent-color: var(--accent-primary);
  }

  .ledger-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem;
    color: var(--text-dim);
    font-size: 0.9375rem;
    text-align: center;
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

  .btn-etiquetas {
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
    white-space: nowrap;
    min-height: 38px;
  }

  .btn-etiquetas:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  .link-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    margin-top: 0.25rem;
    transition: color var(--transition-fast);
  }

  .link-inline:hover {
    color: var(--accent-primary-hover);
  }

  @media (max-width: 800px) {
    .workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
