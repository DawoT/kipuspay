<script lang="ts">
  import { isInventoryLocationsEnabled } from '$lib/features';

  type LocationRow = {
    id: string;
    code: string;
    name: string | null;
    is_active: number;
  };
  type StockRow = {
    location_id: string;
    location_code: string;
    product_id: string;
    product_name: string;
    quantity_microunits: number;
    branch_quantity_microunits: number;
  };

  const locationsOn = isInventoryLocationsEnabled();
  let branchId = $state('b-demo');
  let code = $state('');
  let name = $state('');
  let locations = $state<LocationRow[]>([]);
  let stock = $state<StockRow[]>([]);
  let sourceLocationId = $state('');
  let destinationLocationId = $state('');
  let productId = $state('');
  let quantityMicrounits = $state(1_000_000);
  let message = $state('');
  let busy = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });
  const units = (microunits: number) =>
    new Intl.NumberFormat('es-PE', { maximumFractionDigits: 6 }).format(microunits / 1_000_000);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBase()}${path}`, init);
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(body.error ?? `Error ${response.status}`));
    return body;
  }

  async function refresh() {
    busy = true;
    message = '';
    try {
      const [locationData, stockData] = await Promise.all([
        request(`/api/inventory/locations?branchId=${encodeURIComponent(branchId)}`, {
          headers: headers(),
        }),
        request(`/api/inventory/locations/stock?branchId=${encodeURIComponent(branchId)}`, {
          headers: headers(),
        }),
      ]);
      locations = (locationData.items as LocationRow[]) ?? [];
      stock = (stockData.items as StockRow[]) ?? [];
      sourceLocationId ||= locations[0]?.id ?? '';
      destinationLocationId ||= locations[1]?.id ?? '';
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function createLocation() {
    busy = true;
    message = '';
    try {
      await request('/api/inventory/locations', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ branchId, code, name }),
      });
      code = '';
      name = '';
      message = 'Ubicación creada';
      await refresh();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      busy = false;
    }
  }

  async function transfer() {
    busy = true;
    message = '';
    try {
      await request('/api/inventory/locations/transfer', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          branchId,
          sourceLocationId,
          destinationLocationId,
          productId,
          quantityMicrounits,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      message = 'Transferencia registrada sin cambiar el total de sucursal';
      await refresh();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      busy = false;
    }
  }

  async function deactivate(locationId: string) {
    busy = true;
    message = '';
    try {
      await request('/api/inventory/locations', {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ branchId, locationId }),
      });
      message = 'Ubicación desactivada';
      await refresh();
    } catch (error) {
      message =
        error instanceof Error
          ? `${error.message}. Mueve el stock antes de desactivar.`
          : String(error);
      busy = false;
    }
  }

  async function pick() {
    busy = true;
    message = '';
    try {
      const result = await request(
        `/api/inventory/locations/picking?branchId=${encodeURIComponent(branchId)}` +
          `&productId=${encodeURIComponent(productId)}&quantityMicrounits=${quantityMicrounits}`,
        { headers: headers() },
      );
      const steps = (result.items as { locationId: string; quantityMicrounits: number }[]) ?? [];
      message = steps
        .map((step) => `${locations.find((row) => row.id === step.locationId)?.code ?? step.locationId}: ${units(step.quantityMicrounits)}`)
        .join(' → ');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Ubicaciones y racks · KipusPay</title></svelte:head>

<main class="location-admin" data-testid="admin-locations">
  <header>
    <div>
      <p class="eyebrow">Inventario · Sprint 38</p>
      <h1>Ubicaciones y racks</h1>
      <p class="lede">Mueve, cuenta y encuentra producto sin alterar el total de la sucursal.</p>
    </div>
    <a
      class="csv-link"
      href={`${apiBase()}/api/reports/inventory-by-location?format=csv&branchId=${encodeURIComponent(branchId)}`}
    >
      Descargar CSV
    </a>
  </header>

  {#if !locationsOn}
    <section class="notice" data-testid="admin-locations-off">
      <strong>Ubicaciones aún no habilitadas</strong>
      <span>Activa PUBLIC_FEATURE_INVENTORY_LOCATIONS después de reconciliar el stock.</span>
    </section>
  {:else}
    <section class="branch-bar" aria-label="Sucursal activa">
      <label for="branch">Sucursal</label>
      <input id="branch" bind:value={branchId} />
      <button type="button" onclick={refresh} disabled={busy}>Actualizar mapa</button>
    </section>

    {#if message}
      <p class="feedback" aria-live="polite">{message}</p>
    {/if}

    <section class="rack-map" aria-label="Mapa de racks">
      {#each locations as location}
        <article class="rack" data-active={location.is_active === 1}>
          <span class="rack-code">{location.code}</span>
          <strong>{location.name || 'Sin nombre'}</strong>
          <span class="rack-count"
            >{stock.filter((row) => row.location_id === location.id).length} productos</span
          >
          {#if location.code !== 'DEFAULT'}
            <button
              class="rack-action"
              type="button"
              onclick={() => deactivate(location.id)}
              disabled={busy}
            >
              Desactivar
            </button>
          {/if}
        </article>
      {:else}
        <p class="empty">No hay racks. Crea el primero para comenzar el putaway.</p>
      {/each}
    </section>

    <div class="workbench">
      <section class="panel">
        <p class="panel-label">Alta de rack</p>
        <h2>Nueva ubicación</h2>
        <label for="code">Código</label>
        <input id="code" bind:value={code} placeholder="A-01" />
        <label for="name">Nombre</label>
        <input id="name" bind:value={name} placeholder="Pasillo A · nivel 1" />
        <button type="button" onclick={createLocation} disabled={busy || !code.trim()}>
          Crear ubicación
        </button>
      </section>

      <section class="panel">
        <p class="panel-label">Movimiento interno</p>
        <h2>Transferir stock</h2>
        <label for="source">Origen</label>
        <select id="source" bind:value={sourceLocationId}>
          {#each locations as location}<option value={location.id}>{location.code}</option>{/each}
        </select>
        <label for="destination">Destino</label>
        <select id="destination" bind:value={destinationLocationId}>
          {#each locations as location}<option value={location.id}>{location.code}</option>{/each}
        </select>
        <label for="product">Producto ID</label>
        <input id="product" bind:value={productId} />
        <label for="quantity">Cantidad en microunidades</label>
        <input id="quantity" type="number" min="1" step="1" bind:value={quantityMicrounits} />
        <button
          type="button"
          onclick={transfer}
          disabled={busy || !productId || sourceLocationId === destinationLocationId}
        >
          Transferir
        </button>
        <button class="secondary" type="button" onclick={pick} disabled={busy || !productId}>
          Calcular picking FEFO
        </button>
      </section>
    </div>

    <section class="stock-table">
      <div>
        <p class="panel-label">Existencia granular</p>
        <h2>Stock por ubicación</h2>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Rack</th><th>Producto</th><th>Ubicación</th><th>Sucursal</th></tr>
          </thead>
          <tbody>
            {#each stock as row}
              <tr>
                <td><span class="mini-code">{row.location_code}</span></td>
                <td>{row.product_name || row.product_id}</td>
                <td class="number">{units(row.quantity_microunits)}</td>
                <td class="number">{units(row.branch_quantity_microunits)}</td>
              </tr>
            {:else}
              <tr><td colspan="4">Sin stock para mostrar.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: 'Nunito Sans', ui-sans-serif, system-ui, sans-serif;
  }
  .location-admin {
    --primary: #334155;
    --accent: #047857;
    --border: #dbe2ea;
    max-width: 1180px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }
  header,
  .branch-bar,
  .workbench,
  .stock-table > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h1,
  h2,
  p {
    margin-top: 0;
  }
  h1 {
    margin-bottom: 8px;
    font-family: Rubik, ui-sans-serif, system-ui, sans-serif;
    font-size: clamp(2rem, 5vw, 3.5rem);
    letter-spacing: -0.04em;
  }
  h2 {
    margin-bottom: 20px;
    font-size: 1.25rem;
  }
  .eyebrow,
  .panel-label {
    margin-bottom: 6px;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .lede {
    margin-bottom: 0;
    color: #475569;
  }
  .csv-link,
  button {
    min-height: 44px;
    border: 1px solid var(--primary);
    border-radius: 10px;
    background: var(--primary);
    color: white;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    padding: 10px 16px;
    text-decoration: none;
    transition:
      background 180ms ease,
      border-color 180ms ease;
  }
  .csv-link:hover,
  button:hover:not(:disabled) {
    background: #1e293b;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  a:focus-visible {
    outline: 3px solid #10b981;
    outline-offset: 2px;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  button.secondary {
    margin-top: 8px;
    background: white;
    color: var(--primary);
  }
  .notice,
  .feedback {
    display: grid;
    gap: 4px;
    margin-top: 28px;
    border: 1px solid #a7f3d0;
    border-radius: 12px;
    background: #ecfdf5;
    padding: 16px;
  }
  .branch-bar {
    justify-content: flex-start;
    margin: 28px 0 18px;
    border-block: 1px solid var(--border);
    padding: 14px 0;
  }
  label {
    display: block;
    margin: 12px 0 6px;
    color: #334155;
    font-size: 0.875rem;
    font-weight: 700;
  }
  input,
  select {
    box-sizing: border-box;
    min-height: 44px;
    width: 100%;
    border: 1px solid #94a3b8;
    border-radius: 8px;
    background: white;
    color: #0f172a;
    font: inherit;
    padding: 9px 11px;
  }
  .branch-bar input {
    width: min(320px, 100%);
  }
  .rack-map {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin: 20px 0 28px;
  }
  .rack {
    display: grid;
    min-height: 104px;
    align-content: space-between;
    border: 1px solid var(--border);
    border-top: 5px solid var(--accent);
    border-radius: 8px;
    background: white;
    box-shadow: 0 8px 22px rgb(15 23 42 / 6%);
    padding: 14px;
  }
  .rack-code,
  .mini-code {
    width: fit-content;
    border-radius: 4px;
    background: #0f172a;
    color: white;
    font-family: ui-monospace, monospace;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 3px 7px;
  }
  .rack-count {
    color: #64748b;
    font-size: 0.8rem;
  }
  .rack .rack-action {
    min-height: 36px;
    margin-top: 10px;
    border-color: #cbd5e1;
    background: white;
    color: #334155;
    font-size: 0.8rem;
    padding: 6px 9px;
  }
  .empty {
    grid-column: 1 / -1;
    border: 1px dashed #94a3b8;
    border-radius: 10px;
    padding: 24px;
  }
  .workbench {
    align-items: stretch;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .panel,
  .stock-table {
    border: 1px solid var(--border);
    border-radius: 14px;
    background: white;
    box-shadow: 0 10px 30px rgb(15 23 42 / 5%);
    padding: 22px;
  }
  .panel button {
    width: 100%;
    margin-top: 18px;
  }
  .stock-table {
    margin-top: 20px;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: 12px 8px;
    text-align: left;
  }
  th {
    color: #475569;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .number {
    font-family: ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  @media (max-width: 700px) {
    header,
    .branch-bar {
      align-items: stretch;
      flex-direction: column;
    }
    .workbench {
      grid-template-columns: 1fr;
    }
    .csv-link {
      text-align: center;
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
