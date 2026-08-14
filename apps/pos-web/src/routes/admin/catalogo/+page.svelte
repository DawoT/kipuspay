<script lang="ts">
  import {
    isCatalogQuickAddEnabled,
    isCatalogUomEnabled,
    isCatalogVariantsEnabled,
    isInventorySerialsEnabled,
  } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import Fieldset from '$lib/ui/Fieldset.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { formatCents } from '$lib/cents';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const variantsOn = isCatalogVariantsEnabled();
  const uomOn = isCatalogUomEnabled();
  const serialsOn = isInventorySerialsEnabled();
  const quickAddOn = isCatalogQuickAddEnabled();
  let scanBarcode = $state('');
  let scanName = $state('');
  let scanPriceCents = $state<number | null>(null);
  let scanMessage = $state('');
  let productId = $state('');
  let parentProductId = $state('');
  let overrideCents = $state<number | null>(null);
  let uomCode = $state('UND');
  let numerator = $state(1);
  let denominator = $state(1);
  let isBase = $state(true);
  let message = $state('');
  let messageOk = $state(false);
  let catalog = $state<unknown[]>([]);
  let serialTrackingMode = $state('NONE');
  let loading = $state(false);
  let lookupProduct = $state<{
    id: string;
    sku: string;
    barcode: string;
    name: string;
    priceCents: number;
    productType: string;
  } | null>(null);
  let lookupMsg = $state('');

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';
  async function scanLookup() {
    const raw = scanBarcode.trim();
    lookupMsg = '';
    lookupProduct = null;
    if (!raw) {
      lookupMsg = 'Ingresa el código a buscar.';
      return;
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase()}/api/catalog/scan/${encodeURIComponent(raw)}`, {
        headers: { authorization: auth() },
      });
    } catch {
      lookupMsg = 'No se pudo conectar para buscar el código.';
      return;
    }
    const json = (await response.json()) as {
      code?: string;
      error?: string;
      product?: {
        id: string;
        sku: string;
        barcode: string;
        name: string;
        price_cents: number;
        product_type: string;
      };
    };
    if (!response.ok) {
      lookupMsg =
        json.code === 'NOT_FOUND'
          ? 'No existe un producto con ese código: usa la alta rápida para crearlo.'
          : (json.error ?? `Error ${response.status}`);
      return;
    }
    const product = json.product;
    if (!product) {
      lookupMsg = 'El código no corresponde a un producto.';
      return;
    }
    lookupProduct = {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      priceCents: product.price_cents,
      productType: product.product_type,
    };
    scanName = product.name;
    scanPriceCents = product.price_cents;
    lookupMsg = 'Producto encontrado: ajusta nombre o precio y guarda.';
  }

  async function quickAdd() {
    const barcode = scanBarcode.trim();
    const name = scanName.trim();
    const priceCents = scanPriceCents;
    if (!barcode || !name || priceCents === null || !Number.isSafeInteger(priceCents) || priceCents <= 0) {
      scanMessage = 'Código, nombre y precio (entero) son obligatorios.';
      return;
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase()}/api/catalog/quick-add`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ barcode, name, priceCents }),
      });
    } catch {
      scanMessage = 'No se pudo conectar para crear el producto.';
      return;
    }
    const json = (await response.json()) as { code?: string; created?: boolean; error?: string };
    if (!response.ok) {
      scanMessage = json.error ?? `Error ${response.status}`;
      return;
    }
    scanMessage = json.created
      ? `Producto creado (código ${barcode}).`
      : `Producto existente actualizado (código ${barcode}).`;
    scanBarcode = '';
    scanName = '';
    scanPriceCents = null;
  }

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
        variantPriceOverrideCents: overrideCents === null ? null : overrideCents,
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

  {#if quickAddOn}
    <section class="glass-card section-pad scan-panel" data-testid="quick-add-panel" aria-labelledby="quick-add-title">
      <CardHeader title="Escáner rápido">
        <Badge variant="warning">~3s</Badge>
      </CardHeader>
      <p class="scan-hint">Escanea (o escribe) un código de barras: si existe editas precio/stock; si no, creas el producto al instante. El prefijo EMP- es de vendedores y jamás crea un producto.</p>
      <div class="scan-form">
        <label class="sr-only" for="scan-barcode">Código de barras</label>
        <Input
          id="scan-barcode"
          class="scan-input"
          data-testid="quick-add-barcode"
          bind:value={scanBarcode}
          placeholder="Código (EAN/UPC o EMP-…)"
          autocomplete="off"
        />
        <label class="sr-only" for="scan-name">Nombre</label>
        <Input
          id="scan-name"
          class="scan-input"
          data-testid="quick-add-name"
          bind:value={scanName}
          placeholder="Nombre del artículo"
        />
        <label class="sr-only" for="scan-price">Precio</label>
        <MoneyInput
          id="scan-price"
          class="scan-input"
          data-testid="quick-add-price"
          bind:value={scanPriceCents}
          min={1}
          placeholder="Precio (S/ 0.00)"
        />
        <Button
          variant="secondary"
          data-testid="quick-add-lookup"
          onclick={scanLookup}
        >
          Buscar
        </Button>
        <Button
          variant="primary"
          data-testid="quick-add-submit"
          onclick={quickAdd}
        >
          Crear o actualizar
        </Button>
      </div>
      {#if lookupMsg}
        <StatusMessage tone="info" role="status" data-testid="quick-add-lookup-msg">
          {lookupMsg}
        </StatusMessage>
      {/if}
      {#if lookupProduct}
        <div class="lookup-card" data-testid="quick-add-lookup-product">
          <span class="lookup-name">{lookupProduct.name}</span>
          <span class="lookup-price tabular-nums">S/ {formatCents(lookupProduct.priceCents)}</span>
          <span class="lookup-sku">SKU {lookupProduct.sku || '—'} · {lookupProduct.barcode}</span>
        </div>
      {/if}
      {#if scanMessage}
        <StatusMessage tone="info" role="status" data-testid="quick-add-message">
          {scanMessage}
        </StatusMessage>
      {/if}
    </section>
  {/if}

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'}>
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !variantsOn && !uomOn && !serialsOn}
    <div class="feature-off-banner" data-testid="catalog-off">
      <Icon name="info" size={18} />
      <span>
        Activa una función de catálogo o de series para editar.
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

        <Field label="Producto o variante" id="productId-input">
          <Input
            id="productId-input"
            bind:value={productId}
            placeholder="ID del producto"
          />
        </Field>

        {#if variantsOn}
          <Fieldset title="Familia de variante">
            <Field label="Producto padre" id="parent-input">
              <Input id="parent-input" bind:value={parentProductId} placeholder="Vacío = es padre" />
            </Field>
            <Field label="Precio propio" id="price-input">
              <MoneyInput id="price-input" bind:value={overrideCents} placeholder="Vacío = hereda" />
            </Field>
            <Button variant="primary" onclick={saveVariant} icon="check">
              Guardar variante
            </Button>
          </Fieldset>
        {/if}

        {#if uomOn}
          <Fieldset title="Presentación (UOM)">
            <Field label="Código" id="uom-code-input">
              <Input id="uom-code-input" bind:value={uomCode} maxlength="12" />
            </Field>
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
            <Button variant="primary" onclick={saveUom} icon="check">
              Guardar unidad
            </Button>
          </Fieldset>
        {/if}

        {#if serialsOn}
          <Fieldset title="Identidad serial">
            <Field label="Seguimiento" id="serial-select">
              <select id="serial-select" bind:value={serialTrackingMode}>
                <option value="NONE">Sin serie</option>
                <option value="REQUIRED">Serie obligatoria (una unidad)</option>
              </select>
            </Field>
            <Button variant="primary" onclick={saveSerialTracking} icon="barcode">
              Guardar seguimiento serial
            </Button>
            <a class="link-inline" href="/admin/series">
              <Icon name="arrow-right" size={13} />
              Buscar y gestionar series
            </a>
          </Fieldset>
        {/if}
      </aside>

      <!-- Ledger: catalog map -->
      <section class="glass-card ledger">
        <div class="card-header">
          <h2>Mapa del catálogo</h2>
          <Button variant="secondary" onclick={loadCatalog} busy={loading} icon="refresh">
            {loading ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>
        {#if catalog.length === 0}
          <EmptyState icon="layers" title="Sin catálogo" description="Carga el catálogo para revisar padres, variantes y presentaciones." />
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

  .lookup-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
  }

  .lookup-name {
    font-weight: 700;
  }

  .lookup-price {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--emerald-green);
  }

  .lookup-sku {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }
</style>
