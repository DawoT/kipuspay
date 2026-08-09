<script lang="ts">
  import { isInventoryLocationsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

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

<svelte:head><title>Ubicaciones y Racks · KipusPay</title></svelte:head>

<div class="location-admin-container" data-testid="admin-locations">
  <header class="glass-panel admin-header">
    <div>
      <span class="badge badge-indigo">Inventario Avanzado · Sprint 38</span>
      <h1 class="page-title">Ubicaciones y Racks por Sucursal</h1>
      <p class="lede-text">Mueve, cuenta y localiza producto por estante sin alterar el agregado total de la sucursal.</p>
    </div>
    <a
      class="btn btn-secondary csv-btn"
      href={`${apiBase()}/api/reports/inventory-by-location?format=csv&branchId=${encodeURIComponent(branchId)}`}
    >
      <Icon name="download" size={16} />
      Exportar CSV
    </a>
  </header>

  {#if !locationsOn}
    <div class="glass-panel notice-box" data-testid="admin-locations-off">
      <span class="badge badge-warning">Capability Desactivada</span>
      <h2>Ubicaciones aún no habilitadas</h2>
      <p>Activa PUBLIC_FEATURE_INVENTORY_LOCATIONS después de reconciliar el inventario por sucursal.</p>
    </div>
  {:else}
    <section class="glass-panel branch-bar">
      <div class="branch-input-group">
        <label for="branch-id-input">Sucursal Activa</label>
        <input id="branch-id-input" bind:value={branchId} placeholder="b-demo" />
      </div>
      <button type="button" class="btn btn-primary" onclick={refresh} disabled={busy}>
        <Icon name="refresh" size={16} />
        {busy ? 'Cargando…' : 'Actualizar Mapa'}
      </button>
    </section>

    {#if message}
      <div class="feedback-banner" class:success-banner={message.includes('creada') || message.includes('registrada') || message.includes('desactivada')}>
        <span><Icon name="alert" size={16} /> {message}</span>
      </div>
    {/if}

    <!-- Racks Map Grid -->
    <section class="racks-section">
      <div class="section-title-bar">
        <h2>Mapa de Racks & Almacenes</h2>
        <span class="badge badge-indigo">{locations.length} Racks Registrados</span>
      </div>

      <div class="rack-map-grid">
        {#each locations as location}
          <article class="glass-panel rack-card" class:inactive={location.is_active !== 1}>
            <div class="rack-card-header">
              <span class="rack-code-badge">{location.code}</span>
              {#if location.code === 'DEFAULT'}
                <span class="badge badge-success">DEFAULT</span>
              {:else}
                <span class="badge" class:badge-success={location.is_active === 1} class:badge-warning={location.is_active !== 1}>
                  {location.is_active === 1 ? 'ACTIVO' : 'INACTIVO'}
                </span>
              {/if}
            </div>

            <strong class="rack-name">{location.name || 'Sin nombre asignado'}</strong>

            <div class="rack-stats-row">
              <span class="stat-label">Productos Almacenados:</span>
              <span class="stat-count tabular-nums">
                {stock.filter((row) => row.location_id === location.id).length} SKU
              </span>
            </div>

            {#if location.code !== 'DEFAULT'}
              <button
                class="btn btn-secondary deactivate-btn"
                type="button"
                onclick={() => deactivate(location.id)}
                disabled={busy}
              >
                <Icon name="trash" size={14} />
                Desactivar
              </button>
            {/if}
          </article>
        {:else}
          <div class="glass-panel empty-racks-box">
            <Icon name="package" size={32} />
            <p>No hay racks registrados. Crea la primera ubicación para comenzar la gestión de putaway.</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- Operations Workbench Grid -->
    <div class="workbench-grid">
      <!-- Create Location Panel -->
      <section class="glass-panel workbench-card">
        <div class="card-header">
          <div>
            <span class="panel-label">Alta de Rack</span>
            <h2>Nueva Ubicación</h2>
          </div>
        </div>

        <div class="form-body">
          <div>
            <label for="code-input">Código de Rack</label>
            <input id="code-input" bind:value={code} placeholder="Ej. RACK-A1" />
          </div>
          <div>
            <label for="name-input">Nombre / Descripción</label>
            <input id="name-input" bind:value={name} placeholder="Ej. Pasillo 1 · Nivel 2" />
          </div>
          <button type="button" class="btn btn-primary" onclick={createLocation} disabled={busy || !code.trim()}>
            <Icon name="plus" size={16} />
            Crear Ubicación
          </button>
        </div>
      </section>

      <!-- Transfer Stock Panel -->
      <section class="glass-panel workbench-card">
        <div class="card-header">
          <div>
            <span class="panel-label">Movimiento Interno</span>
            <h2>Transferir Stock Intra-Sucursal</h2>
          </div>
        </div>

        <div class="form-body">
          <div class="selects-row">
            <div>
              <label for="source-select">Origen</label>
              <select id="source-select" bind:value={sourceLocationId}>
                {#each locations as location}
                  <option value={location.id}>{location.code} ({location.name || 'Sin nombre'})</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="destination-select">Destino</label>
              <select id="destination-select" bind:value={destinationLocationId}>
                {#each locations as location}
                  <option value={location.id}>{location.code} ({location.name || 'Sin nombre'})</option>
                {/each}
              </select>
            </div>
          </div>

          <div>
            <label for="product-id-input">Producto ID</label>
            <input id="product-id-input" bind:value={productId} placeholder="p1" />
          </div>
          <div>
            <label for="quantity-microunits-input">Cantidad (Microunidades 1e6)</label>
            <input id="quantity-microunits-input" type="number" min="1" step="1" bind:value={quantityMicrounits} />
          </div>

          <div class="action-buttons-row">
            <button
              type="button"
              class="btn btn-primary"
              onclick={transfer}
              disabled={busy ||
                !productId ||
                !sourceLocationId ||
                !destinationLocationId ||
                sourceLocationId === destinationLocationId}
            >
              <Icon name="arrow-right" size={16} />
              Transferir Stock
            </button>
            <button class="btn btn-secondary" type="button" onclick={pick} disabled={busy || !productId}>
              <Icon name="package" size={16} />
              Picking FEFO
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- Granular Stock Table -->
    <section class="glass-panel stock-table-card">
      <div class="card-header">
        <div>
          <span class="panel-label">Existencia Granular</span>
          <h2>Stock por Ubicación y Producto</h2>
        </div>
      </div>

      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Código Rack</th>
              <th>Producto ID</th>
              <th>Nombre de Producto</th>
              <th>Stock en Rack</th>
              <th>Total Sucursal</th>
            </tr>
          </thead>
          <tbody>
            {#each stock as row}
              <tr>
                <td><span class="badge badge-indigo">{row.location_code}</span></td>
                <td class="tabular-nums">{row.product_id}</td>
                <td><strong>{row.product_name}</strong></td>
                <td class="tabular-nums">{units(row.quantity_microunits)} u</td>
                <td class="tabular-nums">{units(row.branch_quantity_microunits)} u</td>
              </tr>
            {:else}
              <tr>
                <td colspan="5" class="empty-table-cell">No hay datos de inventario registrados para esta sucursal.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .location-admin-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .admin-header {
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 800;
    margin-top: 0.25rem;
  }

  .lede-text {
    color: var(--text-muted);
    font-size: 0.9375rem;
  }

  .notice-box {
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .branch-bar {
    padding: 1rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }

  .branch-input-group {
    display: flex;
    flex-direction: column;
    max-width: 320px;
    width: 100%;
  }

  .feedback-banner {
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: var(--radius-md);
    padding: 0.875rem 1.25rem;
    font-weight: 600;
  }
  .success-banner {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
    color: #34d399;
  }

  .section-title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .rack-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }

  .rack-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .rack-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .rack-code-badge {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 1.125rem;
    color: var(--accent-primary);
  }

  .rack-name {
    font-size: 1rem;
    color: var(--text-main);
  }

  .rack-stats-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
    color: var(--text-muted);
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.5rem;
  }

  .stat-count {
    font-weight: 700;
    color: var(--emerald-green);
  }

  .deactivate-btn {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .empty-racks-box {
    grid-column: 1 / -1;
    padding: 3rem;
    text-align: center;
    color: var(--text-muted);
  }

  .workbench-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  .workbench-card {
    padding: 1.5rem;
  }

  .panel-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-primary);
  }

  .form-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  .selects-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .action-buttons-row {
    display: flex;
    gap: 0.75rem;
  }

  .stock-table-card {
    padding: 1.5rem;
  }

  .table-responsive {
    overflow-x: auto;
  }

  .empty-table-cell {
    text-align: center;
    color: var(--text-dim);
    padding: 2rem;
  }

  @media (max-width: 900px) {
    .workbench-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
