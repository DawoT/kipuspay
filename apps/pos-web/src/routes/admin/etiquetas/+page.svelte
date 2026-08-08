<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createPriceLabelClient,
    isCatalogPriceLabelsEnabled,
    priceLabelUiState,
  } from '$lib/catalog/price-label-client';
  import { readAdminAuthenticatedSession } from '$lib/admin/authenticated-session';

  type ProductRow = {
    id: string;
    name: string;
    sku: string;
    selected: boolean;
    copies: number;
  };

  const enabled = isCatalogPriceLabelsEnabled();
  const adminSession = readAdminAuthenticatedSession();
  const authenticated = adminSession !== null;
  let online = $state(true);
  let query = $state('');
  let width = $state<'58' | '80'>('58');
  let templateId = $state('shelf-standard');
  let templateVersion = $state('v3 · vigente');
  let priceListId = $state('');
  let statusMessage = $state(
    !authenticated
      ? 'Sesión no autenticada. Inicia sesión de nuevo para administrar etiquetas.'
      : enabled
      ? 'Listo para crear un lote con precios resueltos por el servidor.'
      : 'Capability de etiquetas desactivada. Activa PUBLIC_FEATURE_CATALOG_PRICE_LABELS.',
  );
  let busy = $state(false);
  let batchId = $state('');
  let acknowledged = $state(0);
  let totalItems = $state(0);
  let products = $state<ProductRow[]>([
    { id: 'product-1', name: 'Arroz superior 1 kg', sku: 'ALI-001', selected: false, copies: 1 },
    { id: 'product-2', name: 'Aceite vegetal 900 ml', sku: 'ALI-014', selected: false, copies: 1 },
    { id: 'product-3', name: 'Leche evaporada 400 g', sku: 'ALI-027', selected: false, copies: 1 },
  ]);

  const ui = $derived(priceLabelUiState({ online }));
  const visibleProducts = $derived(
    products.filter((product) =>
      `${product.name} ${product.sku}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  const selectedProducts = $derived(products.filter((product) => product.selected));
  const selectedCopies = $derived(
    selectedProducts.reduce((sum, product) => sum + Math.max(1, product.copies), 0),
  );

  const client = adminSession
    ? createPriceLabelClient({
        apiBase:
          (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? 'https://api.kipuspay.local',
        fetcher: adminSession.authenticatedFetch,
        terminalContext: () => adminSession.terminal,
        online: () => online,
      })
    : null;

  onMount(() => {
    const updateConnection = () => {
      online = navigator.onLine;
      if (!online) {
        statusMessage =
          'Sin conexión. Puedes reintentar el snapshot pendiente; crear y reimprimir requieren conexión.';
      }
    };
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  });

  function toggleProduct(id: string) {
    products = products.map((product) =>
      product.id === id ? { ...product, selected: !product.selected } : product,
    );
  }

  function setCopies(id: string, value: number) {
    products = products.map((product) =>
      product.id === id ? { ...product, copies: Math.max(1, Math.trunc(value) || 1) } : product,
    );
  }

  async function createBatch() {
    if (!client || !enabled || !ui.canCreate || selectedProducts.length === 0) return;
    busy = true;
    statusMessage = 'El servidor está fijando precios y plantilla…';
    try {
      const result = await client.createBatch({
        products: selectedProducts.map((product) => ({
          productId: product.id,
          copies: Math.max(1, product.copies),
        })),
        templateId,
        ...(priceListId ? { priceListId } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      batchId = result.batchId;
      templateVersion = result.items[0]?.templateVersion
        ? `v${result.items[0].templateVersion} · snapshot`
        : 'snapshot';
      totalItems = result.items.length || selectedCopies;
      acknowledged = 0;
      statusMessage = `Lote ${batchId} creado. Los importes provienen del snapshot firmado por el servidor.`;
    } catch (error) {
      statusMessage =
        error instanceof Error
          ? `No se creó el lote: ${error.message}. Revisa la conexión y conserva la selección.`
          : 'No se creó el lote. Revisa la conexión y conserva la selección.';
    } finally {
      busy = false;
    }
  }

  async function retrySubset() {
    if (!client || !batchId) return;
    await client.retryBatch({ batchId });
    statusMessage = `Reintentando únicamente ${totalItems - acknowledged} etiquetas pendientes del snapshot ${batchId}.`;
  }

  async function reprint() {
    if (!client || !batchId || !enabled || !ui.canReprint) return;
    busy = true;
    try {
      const result = await client.reprintBatch({
        batchId,
        idempotencyKey: crypto.randomUUID(),
      });
      batchId = result.batchId;
      acknowledged = 0;
      totalItems = result.items.length || totalItems;
      statusMessage = `Reimpresión explícita creada como ${result.batchId} con un snapshot nuevo.`;
    } catch (error) {
      statusMessage = `No se creó la reimpresión: ${error instanceof Error ? error.message : 'error de red'}.`;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Etiquetas de precio · KipusPay</title></svelte:head>

<main class="label-shell" data-testid="price-label-workbench">
  <header class="masthead">
    <div>
      <p class="eyebrow">Catálogo · mesa de impresión</p>
      <h1>Etiquetas de precio</h1>
      <p class="lede">Selecciona productos; el servidor fija lista, importe y versión antes de imprimir.</p>
    </div>
    <div class:offline={!online} class="connection" role="status" aria-live="polite">
      <span aria-hidden="true"></span>
      {!authenticated
        ? 'Sesión no autenticada'
        : enabled
          ? online
            ? 'Con conexión · datos vigentes'
            : 'Sin conexión · snapshot puede estar desactualizado'
          : 'Capability desactivada'}
    </div>
  </header>

  {#if !authenticated}
    <p class="auth-required" role="alert">
      No hay una sesión administrativa autenticada y un terminal verificado. Inicia sesión de
      nuevo; no se enviará ninguna solicitud con credenciales de demostración.
    </p>
  {/if}

  <div class="workbench">
    <section class="selection" aria-labelledby="selection-title">
      <div class="section-head">
        <div>
          <p class="step">01 · Selección</p>
          <h2 id="selection-title">Productos y copias</h2>
        </div>
        <output>{selectedCopies} etiquetas</output>
      </div>

      <label for="product-search">Buscar productos</label>
      <input
        id="product-search"
        class="search"
        type="search"
        bind:value={query}
        placeholder="Nombre o SKU"
        autocomplete="off"
      />

      <div class="product-list">
        {#each visibleProducts as product (product.id)}
          <div class:selected={product.selected} class="product-row">
            <label>
              <input
                type="checkbox"
                checked={product.selected}
                onchange={() => toggleProduct(product.id)}
              />
              <span><strong>{product.name}</strong><small>{product.sku}</small></span>
            </label>
            <label class="copies">
              Copias
              <input
                type="number"
                min="1"
                max="99"
                value={product.copies}
                disabled={!product.selected}
                oninput={(event) =>
                  setCopies(product.id, Number((event.currentTarget as HTMLInputElement).value))}
              />
            </label>
          </div>
        {:else}
          <p class="empty">No hay coincidencias. Cambia el nombre o SKU.</p>
        {/each}
      </div>
    </section>

    <section class="setup" aria-labelledby="setup-title">
      <div class="section-head">
        <div>
          <p class="step">02 · Contexto servidor</p>
          <h2 id="setup-title">Plantilla y lista</h2>
        </div>
      </div>

      <fieldset>
        <legend>Formato de etiqueta</legend>
        <div class="format-switch">
          <label><input type="radio" bind:group={width} value="58" /> 58 mm</label>
          <label><input type="radio" bind:group={width} value="80" /> 80 mm</label>
        </div>
      </fieldset>

      <label for="template">Plantilla</label>
      <select id="template" bind:value={templateId}>
        <option value="shelf-standard">Góndola estándar</option>
        <option value="compact">Compacta</option>
      </select>
      <p class="meta">Versión: <strong>{templateVersion}</strong></p>

      <label for="price-list">Lista de precios</label>
      <select id="price-list" bind:value={priceListId}>
        <option value="">Predeterminada del local</option>
        <option value="retail">Venta minorista explícita</option>
        <option value="wholesale">Mayorista explícita</option>
      </select>
      <p class="hint">
        {priceListId ? 'Se enviará la lista elegida.' : 'El servidor resolverá la lista predeterminada vigente.'}
      </p>

      <button
        class="primary"
        type="button"
        disabled={!authenticated || !enabled || !ui.canCreate || selectedProducts.length === 0 || busy}
        onclick={createBatch}
      >
        {busy ? 'Preparando…' : 'Crear lote'}
      </button>
    </section>

    <aside class="preview" aria-labelledby="preview-title">
      <div class="section-head">
        <div>
          <p class="step">03 · Vista previa</p>
          <h2 id="preview-title">Papel {width} mm</h2>
        </div>
      </div>
      <div class:wide={width === '80'} class="label-paper">
        <small>KIPUSPAY · {templateVersion}</small>
        <strong>{selectedProducts[0]?.name ?? 'Selecciona un producto'}</strong>
        <span>Precio resuelto por servidor</span>
        <code>{selectedProducts[0]?.sku ?? 'SKU —'}</code>
      </div>
      <p class="trust">La vista previa no calcula dinero en el navegador.</p>
    </aside>
  </div>

  <section class="batch" aria-labelledby="batch-title">
    <div class="section-head">
      <div>
        <p class="step">04 · Ejecución</p>
        <h2 id="batch-title">Progreso del lote</h2>
      </div>
      <output>{acknowledged}/{totalItems} confirmadas</output>
    </div>
    <progress max={Math.max(totalItems, 1)} value={acknowledged}>
      {acknowledged} de {totalItems}
    </progress>
    <p class="batch-id">{batchId || 'Todavía no hay un lote activo.'}</p>
    <div class="actions">
      <button type="button" disabled={!authenticated || !batchId || acknowledged >= totalItems} onclick={retrySubset}>
        Reintentar pendientes exactas
      </button>
      <button type="button" disabled={!authenticated || !batchId || !enabled || !ui.canReprint || busy} onclick={reprint}>
        Crear reimpresión nueva
      </button>
    </div>
    <p class="recovery">
      Si recargas la página, se conservan payload, estado y ACK por etiqueta. Una cuota llena no
      revierte ventas ni impide el cierre de caja.
    </p>
  </section>

  <p class="announcer" aria-live="polite" aria-atomic="true">{statusMessage}</p>
</main>

<style>
  :global(body) { margin: 0; background: #edf3f0; color: #16332c; font-family: system-ui, sans-serif; }
  .label-shell { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 5rem; }
  .masthead, .section-head, .actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .masthead { padding: 1.25rem 0 1.5rem; border-bottom: 4px solid #16332c; }
  .eyebrow, .step, .meta, .batch-id { font: 700 .72rem/1.25 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
  .eyebrow, .step { color: #196b57; }
  h1 { margin: .25rem 0; font-size: clamp(2rem, 5vw, 4.2rem); line-height: .95; letter-spacing: -.045em; }
  h2 { margin: .2rem 0; font-size: 1.12rem; }
  .lede, .hint, .trust, .recovery { color: #526b64; }
  .connection { display: flex; align-items: center; gap: .5rem; padding: .7rem .85rem; border: 1px solid #7fa59a; background: #f8fbfa; font-weight: 700; }
  .connection span { width: .7rem; height: .7rem; border-radius: 50%; background: #167452; }
  .connection.offline { color: #812b22; border-color: #bd756c; background: #fff4f1; }
  .connection.offline span { background: #a83429; }
  .workbench { display: grid; grid-template-columns: 1.35fr .85fr .8fr; border-inline: 1px solid #b8ccc6; }
  .selection, .setup, .preview, .batch { background: white; padding: 1.15rem; border-bottom: 1px solid #b8ccc6; }
  .setup, .preview { border-left: 1px solid #b8ccc6; }
  .section-head { margin-bottom: 1rem; }
  .section-head p { margin: 0; }
  output { font: 750 .78rem/1 ui-monospace, monospace; }
  label, legend { font-weight: 700; }
  .search, select { width: 100%; box-sizing: border-box; margin: .35rem 0 1rem; }
  input, select, button { min-height: 44px; padding: .55rem .7rem; border: 1px solid #75978e; background: white; color: inherit; font: inherit; }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #ff9f7d; outline-offset: 2px; }
  .product-list { max-height: 23rem; overflow: auto; border-top: 1px solid #d6e2de; }
  .product-row { display: grid; grid-template-columns: minmax(0, 1fr) 5rem; gap: .8rem; align-items: center; padding: .7rem; border-bottom: 1px solid #d6e2de; }
  .product-row.selected { background: #eaf6f1; box-shadow: inset 4px 0 #196b57; }
  .product-row > label:first-child { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .65rem; }
  .product-row input[type='checkbox'], .format-switch input { min-width: 1.35rem; min-height: 1.35rem; }
  .product-row span, .copies { display: grid; gap: .15rem; }
  .product-row small { color: #60766f; font-family: ui-monospace, monospace; }
  .copies { font-size: .72rem; }
  .copies input { width: 100%; }
  fieldset { margin: 0 0 1rem; padding: 0; border: 0; }
  .format-switch { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: .45rem; }
  .format-switch label { display: flex; align-items: center; justify-content: center; gap: .4rem; min-height: 44px; border: 1px solid #75978e; }
  .primary { width: 100%; margin-top: .8rem; background: #196b57; color: white; border-color: #196b57; font-weight: 800; }
  button { cursor: pointer; font-weight: 750; }
  button:disabled { cursor: not-allowed; opacity: .5; }
  .label-paper { width: min(100%, 12rem); aspect-ratio: 58 / 38; margin: 1.25rem auto; padding: .75rem; box-sizing: border-box; display: grid; align-content: space-between; border: 1px dashed #60766f; background: #fffef8; box-shadow: 0 8px 18px rgb(22 51 44 / 12%); }
  .label-paper.wide { aspect-ratio: 80 / 38; }
  .label-paper strong { font-size: 1rem; }
  .label-paper span { font-size: .7rem; color: #60766f; }
  .label-paper code { justify-self: end; }
  .batch { border-inline: 1px solid #b8ccc6; }
  progress { width: 100%; height: .8rem; accent-color: #196b57; }
  .actions { justify-content: flex-start; flex-wrap: wrap; }
  .announcer { margin: 1rem 0; padding: .9rem 1rem; border-left: 5px solid #ff6b35; background: #fff; font-weight: 700; }
  .auth-required { padding: .9rem 1rem; border: 1px solid #bd756c; background: #fff4f1; color: #812b22; font-weight: 750; }
  @media (max-width: 840px) {
    .workbench { grid-template-columns: 1fr 1fr; }
    .selection { grid-column: 1 / -1; }
    .setup { border-left: 0; }
  }
  @media (max-width: 560px) {
    .label-shell { padding-inline: .75rem; }
    .masthead, .section-head { align-items: flex-start; flex-direction: column; }
    .workbench { grid-template-columns: 1fr; }
    .selection { grid-column: auto; }
    .setup, .preview { border-left: 0; }
    .actions button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
  }
</style>
