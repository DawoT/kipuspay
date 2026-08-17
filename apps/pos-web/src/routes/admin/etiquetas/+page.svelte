<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createPriceLabelClient,
    isCatalogPriceLabelsEnabled,
    priceLabelUiState,
  } from '$lib/catalog/price-label-client';
  import { readAdminAuthenticatedSession } from '$lib/admin/authenticated-session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Field from '$lib/ui/Field.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
import { resolveApiBase } from '$lib/auth/api-client';

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
      : 'Las etiquetas de precio no están activas para este negocio.',
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
        apiBase: resolveApiBase(localStorage),
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
          'Sin conexión. Puedes reintentar lo pendiente; crear y reimprimir requieren conexión.';
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
        ? `v${result.items[0].templateVersion} · datos del servidor`
        : 'datos del servidor';
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
    <div class="masthead-title">
      <Badge variant="indigo">
        <Icon name="tag" size={14} />
        <span>Catálogo · Mesa de Impresión</span>
      </Badge>
      <h1>Etiquetas de precio</h1>
      <p class="lede">Selecciona productos; el servidor fija lista, importe y versión antes de imprimir.</p>
    </div>
    <Badge variant={!authenticated || !enabled ? 'muted' : online ? 'online' : 'offline'} role="status" aria-live="polite">
      <Icon name={!online ? 'wifi-off' : 'wifi'} size={16} />
      <span>
        {!authenticated
          ? 'Sesión no autenticada'
          : enabled
          ? online
            ? 'Con conexión · datos vigentes'
            : 'Sin conexión · datos no actualizados'
          : 'No activa'}
      </span>
    </Badge>
  </header>

  {#if !authenticated}
    <StatusMessage tone="danger" role="alert">
      <Icon name="alert" size={20} />
      <span>
        No hay una sesión administrativa autenticada y un terminal verificado. Inicia sesión de
        nuevo; no se enviará ninguna solicitud con credenciales de demostración.
      </span>
    </StatusMessage>
  {/if}

  <div class="workbench">
    <section class="selection ledger-card" aria-labelledby="selection-title">
      <div class="section-head">
        <div>
          <p class="step">01 · Selección</p>

          <h2 id="selection-title">Productos y copias</h2>
        </div>
        <div class="copies-badge">
          <Icon name="tag" size={14} />
          <output>{selectedCopies} etiquetas</output>
        </div>
      </div>

      <div class="search-box">
        <Icon name="search" size={16} class="search-icon" />
        <input
          id="product-search"
          class="search"
          type="search"
          bind:value={query}
          placeholder="Buscar producto por nombre o SKU..."
          autocomplete="off"
          aria-label="Buscar productos"
        />
      </div>

      <div class="product-list">
        {#each visibleProducts as product (product.id)}
          <div class:selected={product.selected} class="product-row">
            <label class="product-check">
              <input
                type="checkbox"
                checked={product.selected}
                onchange={() => toggleProduct(product.id)}
              />
              <div class="product-info">
                <strong>{product.name}</strong>
                <small><Icon name="barcode" size={12} /> {product.sku}</small>
              </div>
            </label>
            <label class="copies">
              <span>Copias</span>
              <div class="number-stepper">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={product.copies}
                  disabled={!product.selected}
                  oninput={(event) =>
                    setCopies(product.id, Number((event.currentTarget as HTMLInputElement).value))}
                />
              </div>
            </label>
          </div>
        {:else}
          <EmptyState icon="search" title="Sin coincidencias" description={'No hay coincidencias para "' + query + '". Cambia el filtro de búsqueda.'} />
        {/each}
      </div>
    </section>

    <section class="setup ledger-card" aria-labelledby="setup-title">
      <div class="section-head">
        <div>
          <p class="step">02 · Contexto servidor</p>

          <h2 id="setup-title">Plantilla y lista</h2>
        </div>
      </div>

      <fieldset class="format-fieldset">
        <legend>Formato de bobina térmica</legend>
        <div class="format-switch">
          <label class:active={width === '58'}>
            <input type="radio" bind:group={width} value="58" />
            <Icon name="printer" size={14} />
            <span>58 mm</span>
          </label>
          <label class:active={width === '80'}>
            <input type="radio" bind:group={width} value="80" />
            <Icon name="printer" size={14} />
            <span>80 mm</span>
          </label>
        </div>
      </fieldset>

      <Field label="Plantilla de etiqueta" id="template">
        <select id="template" bind:value={templateId}>
          <option value="shelf-standard">Góndola estándar (Retail)</option>
          <option value="compact">Compacta (Farmacia / Ropa)</option>
        </select>
        <p class="meta"><Icon name="shield" size={12} /> Versión: <strong>{templateVersion}</strong></p>
      </Field>

      <Field label="Lista de precios asignada" id="price-list" hint={priceListId ? 'Se enviará la lista elegida al servidor.' : 'El servidor resolverá la lista predeterminada vigente.'}>
        <select id="price-list" bind:value={priceListId}>
          <option value="">Predeterminada del local</option>
          <option value="retail">Venta minorista explícita</option>
          <option value="wholesale">Mayorista explícita</option>
        </select>
      </Field>

      <Button
        variant="primary"
        size="full"
        style="margin-top: 1rem"
        disabled={!authenticated || !enabled || !ui.canCreate || selectedProducts.length === 0 || busy}
        onclick={createBatch}
        busy={busy}
      >
        {busy ? 'Preparando...' : 'Crear Lote de Impresión'}
      </Button>
    </section>

    <aside class="preview ledger-card" aria-labelledby="preview-title">
      <div class="section-head">
        <div>
          <p class="step">03 · Vista previa</p>
          <h2 id="preview-title">Papel {width} mm</h2>
        </div>
      </div>
      <div class:wide={width === '80'} class:has-product={selectedProducts.length > 0} class="label-paper">
        {#if selectedProducts.length === 0}
          <EmptyState icon="tag" title="Sin vista previa" description="Selecciona un producto de la lista para ver la vista previa" />
        {:else}
          <div class="paper-header">
            <span>KIPUSPAY</span>
            <span>{templateVersion}</span>
          </div>
          <strong class="paper-title">{selectedProducts[0].name}</strong>
          <div class="paper-price-pending" title="El servidor fijará el precio al crear el lote">
            <Icon name="lock" size={10} />
            <span class="paper-price-mask">S/ &bull;&bull;&bull;.&bull;&bull;</span>
          </div>
          <div class="paper-footer">
            <code class="paper-sku">{selectedProducts[0].sku}</code>
            <span class="paper-width">{width} mm</span>
          </div>
        {/if}
      </div>
      <p class="trust">
        <Icon name="shield" size={12} />
        El precio se fija en el servidor al crear el lote. No se calcula en el navegador.
      </p>
    </aside>
  </div>

  <section class="batch ledger-card" aria-labelledby="batch-title">
    <div class="section-head">
      <div>
        <p class="step">04 · Ejecución</p>

        <h2 id="batch-title">Progreso del lote</h2>
      </div>
      <output>{acknowledged}/{totalItems} confirmadas</output>
    </div>
    <div class="progress-bar-container">
      <progress max={Math.max(totalItems, 1)} value={acknowledged}>
        {acknowledged} de {totalItems}
      </progress>
    </div>
    <p class="batch-id">
      <Icon name="file-text" size={14} />
      <span>{batchId || 'Todavía no hay un lote activo.'}</span>
    </p>
    <div class="actions">
      <Button
        variant="secondary"
        disabled={!authenticated || !batchId || acknowledged >= totalItems}
        onclick={retrySubset}
        icon="refresh"
      >
        Reintentar pendientes exactas
      </Button>
      <Button
        variant="secondary"
        disabled={!authenticated || !batchId || !enabled || !ui.canReprint || busy}
        onclick={reprint}
        icon="printer"
      >
        Crear reimpresión nueva
      </Button>
    </div>
    <p class="recovery">
      Si recargas la página, se conservan payload, estado y ACK por etiqueta. Una cuota llena no
      revierte ventas ni impide el cierre de caja.
    </p>
  </section>

  <p class="announcer" aria-live="polite" aria-atomic="true">{statusMessage}</p>
</main>

<style>
  .label-shell {
    --card-bg: var(--bg-ledger-card);
    --card-border: var(--border-subtle);
    --input-bg: var(--bg-input);
    --input-border: var(--border-strong);
    --text-primary: var(--text-main);
    --text-secondary: var(--text-muted);
    --accent-color: var(--accent-primary);
    --accent-hover: var(--accent-primary-hover);

    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 1rem 5rem;
  }

  .masthead,
  .section-head,
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .masthead {
    padding-bottom: 1.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--card-border);
  }

  .step {
    font: 700 0.72rem/1.2 var(--font-mono, monospace);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-primary);
    margin: 0 0 0.25rem 0;
  }

  h1 {
    margin: 0.2rem 0;
    font-size: clamp(1.75rem, 4vw, 2.8rem);
    font-family: var(--font-heading, sans-serif);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-family: var(--font-heading, sans-serif);
    font-weight: 700;
    color: var(--text-primary);
  }

  .lede,
  .trust,
  .recovery {
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.45;
  }


  .workbench {
    display: grid;
    grid-template-columns: 1.35fr 1fr 0.9fr;
    gap: 1.25rem;
    margin-bottom: 1.25rem;
  }

  .copies-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.65rem;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-sm, 8px);
    color: var(--emerald-green);
    font: 700 0.78rem/1 var(--font-mono, monospace);
  }

  .search-box {
    position: relative;
    margin-bottom: 1rem;
  }

  .search-box :global(.search-icon) {
    position: absolute;
    left: 0.8rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search {
    width: 100%;
    padding: 0.65rem 0.8rem 0.65rem 2.4rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm, 8px);
    color: var(--text-primary);
    font: inherit;
    font-size: 0.9rem;
    transition: border-color 0.15s ease;
  }

  .search:focus-visible,
  select:focus-visible,
  input[type='number']:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
    border-color: var(--accent-primary);
  }

  .product-list {
    max-height: 24rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .product-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5rem;
    gap: 0.8rem;
    align-items: center;
    padding: 0.75rem 0.85rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm, 8px);
    transition: all 0.15s ease;
  }

  .product-row.selected {
    background: rgba(217, 154, 61, 0.12);
    border-color: rgba(217, 154, 61, 0.4);
  }

  .product-check {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }

  .product-check input[type='checkbox'] {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: var(--accent-primary);
    cursor: pointer;
  }

  .product-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .product-info strong {
    font-size: 0.92rem;
    color: var(--text-primary);
  }

  .product-info small {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
  }

  .copies {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .number-stepper input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm, 8px);
    color: var(--text-primary);
    text-align: center;
    font-family: var(--font-mono, monospace);
    font-size: 0.88rem;
    font-weight: 700;
  }

  label {
    display: block;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.35rem;
  }

  select {
    width: 100%;
    padding: 0.65rem 0.8rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm, 8px);
    color: var(--text-primary);
    font: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.35rem;
    font: 600 0.75rem/1.2 var(--font-mono, monospace);
    color: var(--accent-primary);
  }

  .format-fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1.25rem 0;
  }

  legend {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .format-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .format-switch label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-secondary);
    transition: all 0.15s ease;
  }

  .format-switch label.active {
    background: rgba(217, 154, 61, 0.12);
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .format-switch input[type='radio'] {
    display: none;
  }

  /* Physical Thermal Label Preview (Realistic White Sticker Paper) */
  .label-paper {
    width: min(100%, 13rem);
    aspect-ratio: 58 / 38;
    margin: 1.25rem auto;
    padding: 0.85rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px dashed var(--text-muted);
    background: var(--paper);
    color: var(--ink);
    border-radius: 4px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .label-paper.has-product {
    border-color: #d99a3d;
    box-shadow:
      0 10px 25px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(217, 154, 61, 0.25);
  }

  .label-paper.wide {
    aspect-ratio: 80 / 38;
  }

  .paper-header {
    display: flex;
    justify-content: space-between;
    font: 700 0.65rem/1 var(--font-mono, monospace);
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  .paper-title {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.2;
    margin: 0.2rem 0;
  }

  .paper-price-pending {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(217, 154, 61, 0.12);
    border: 1px dashed rgba(217, 154, 61, 0.5);
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    color: var(--amber);
    width: fit-content;
  }

  .paper-price-mask {
    font: 700 0.92rem/1 var(--font-mono, monospace);
    letter-spacing: 0.03em;
  }

  .paper-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.35rem;
    margin-top: 0.2rem;
  }

  .paper-sku {
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    font-size: 0.78rem;
    color: var(--ink);
  }

  .paper-width {
    font: 600 0.65rem/1 var(--font-mono, monospace);
    color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 0.15rem 0.35rem;
    border-radius: 3px;
  }

  .batch {
    margin-bottom: 1.25rem;
  }

  .progress-bar-container {
    margin: 1rem 0;
  }

  progress {
    width: 100%;
    height: 0.75rem;
    border-radius: var(--radius-full, 9999px);
    overflow: hidden;
    accent-color: var(--accent-primary);
  }

  .batch-id {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 1rem;
    font: 600 0.78rem/1.2 var(--font-mono, monospace);
    color: var(--text-secondary);
  }

  .announcer {
    margin: 1rem 0;
    padding: 0.85rem 1.1rem;
    border-left: 4px solid var(--amber-gold);
    background: var(--card-bg);
    border-radius: 0 var(--radius-md, 12px) var(--radius-md, 12px) 0;
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.88rem;
  }

  @media (max-width: 899px) {
    .workbench {
      grid-template-columns: 1fr 1fr;
    }
    .selection {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 719px) {
    .label-shell {
      padding-inline: 0.75rem;
    }
    .masthead,
    .section-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .workbench {
      grid-template-columns: 1fr;
    }
    .selection {
      grid-column: auto;
    }
    .actions {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition: none !important;
    }
  }
</style>
