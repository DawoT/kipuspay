<script lang="ts">
  
  import { initTenantBranchId, initCashSessionContext } from '$lib/admin/cash-session';
  import { isInventoryLocationsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Table from '$lib/ui/Table.svelte';
import { apiFetch } from '$lib/auth/api-client';

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
  let branchId = $state(initTenantBranchId());
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

  const units = (microunits: number) =>
    new Intl.NumberFormat('es-PE', { maximumFractionDigits: 6 }).format(microunits / 1_000_000);

  async function request(path: string, init?: { method?: string; body?: string }) {
    const response = await apiFetch(path, {
      storage: localStorage,
      method: init?.method,
      headers: { 'content-type': 'application/json' },
      body: init?.body,
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(body.error ?? `Error ${response.status}`));
    return body;
  }

  async function refresh() {
    busy = true;
    message = '';
    try {
      const [locationData, stockData] = await Promise.all([
        request(`/api/inventory/locations?branchId=${encodeURIComponent(branchId)}`),
        request(`/api/inventory/locations/stock?branchId=${encodeURIComponent(branchId)}`),
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
        body: JSON.stringify({
          branchId: branchId.trim() || initTenantBranchId(),
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

  async function exportCsv() {
    try {
      const res = await apiFetch(
        `/api/reports/inventory-by-location?format=csv&branchId=${encodeURIComponent(branchId)}`,
        { storage: localStorage },
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'inventario-ubicaciones.csv';
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      message = 'No se pudo exportar el CSV.';
    }
  }
</script>

<svelte:head><title>Ubicaciones y Racks · KipusPay</title></svelte:head>

<div class="page-shell location-admin-container" data-testid="admin-locations">
  <header class="page-masthead">
    <div>
      <p class="page-eyebrow">Inventario</p>
      <h1 class="page-title">Ubicaciones y racks</h1>
      <p class="page-lede">Mueve, cuenta y localiza producto por estante sin alterar el total de la sucursal.</p>
    </div>
    <Button
      variant="secondary"
      icon="download"
      onclick={() => void exportCsv()}
    >
      Exportar CSV
    </Button>
  </header>

  {#if !locationsOn}
    <div class="ledger-card notice-box" data-testid="admin-locations-off">
      <span class="badge badge-warning">No activa</span>
      <h2>Ubicaciones aún no habilitadas</h2>
      <p>Contacta a tu proveedor para activarlas.</p>
    </div>
  {:else}
    <section class="ledger-card branch-bar">
      <div class="field-group branch-input-group">
        <label for="branch-id-input">Sucursal activa</label>
        <input id="branch-id-input" bind:value={branchId} placeholder="Sucursal" />
      </div>
      <Button
        variant="primary"
        onclick={refresh}
        disabled={busy}
        icon="refresh"
      >
        {busy ? 'Cargando…' : 'Actualizar mapa'}
      </Button>
    </section>

    {#if message}
      <StatusMessage
        tone={message.includes('creada') || message.includes('registrada') || message.includes('desactivada') ? 'info' : 'danger'}
      >
        <Icon name="alert" size={16} />
        <span>{message}</span>
      </StatusMessage>
    {/if}

    <section class="racks-section">
      <div class="section-title-bar">
        <h2>Mapa de racks</h2>
        <span class="badge badge-indigo">{locations.length} racks</span>
      </div>

      <div class="rack-map-grid">
        {#each locations as location}
          <article class="ledger-card rack-card" class:inactive={location.is_active !== 1}>
            <div class="rack-card-header">
              <span class="rack-code-badge">{location.code}</span>
              {#if location.code === 'DEFAULT'}
                <span class="badge badge-success">DEFAULT</span>
              {:else}
                <span class="badge" class:badge-success={location.is_active === 1} class:badge-warning={location.is_active !== 1}>
                  {location.is_active === 1 ? 'Activo' : 'Inactivo'}
                </span>
              {/if}
            </div>

            <strong class="rack-name">{location.name || 'Sin nombre asignado'}</strong>

            <div class="rack-stats-row">
              <span class="stat-label">Productos:</span>
              <span class="stat-count tabular-nums">
                {stock.filter((row) => row.location_id === location.id).length} SKU
              </span>
            </div>

            {#if location.code !== 'DEFAULT'}
              <Button
                variant="secondary"
                style="margin-top: 0.5rem"
                onclick={() => deactivate(location.id)}
                disabled={busy}
                icon="trash"
              >
                Desactivar
              </Button>
            {/if}
          </article>
        {:else}
          <div class="ledger-card empty-racks-box">
            <EmptyState
              icon="package"
              title="Sin racks"
              description="No hay racks registrados. Crea la primera ubicación para comenzar."
            >
              <Button variant="primary" href="#nueva-ubicacion" data-testid="ubicaciones-empty-create">
                Crear ubicación
              </Button>
            </EmptyState>
          </div>
        {/each}
      </div>
    </section>

    <div class="workbench-2col">
      <section class="ledger-card" id="nueva-ubicacion">
        <div class="card-header">
          <div>
            <span class="section-tag">Alta de rack</span>
            <h2>Nueva ubicación</h2>
          </div>
        </div>

        <div class="form-body">
          <div class="field-group">
            <label for="code-input">Código de rack</label>
            <input id="code-input" bind:value={code} placeholder="Ej. RACK-A1" />
          </div>
          <div class="field-group">
            <label for="name-input">Nombre / descripción</label>
            <input id="name-input" bind:value={name} placeholder="Ej. Pasillo 1 · Nivel 2" />
          </div>
          <Button
            variant="primary"
            onclick={createLocation}
            disabled={busy || !code.trim()}
            icon="plus"
          >
            Crear ubicación
          </Button>
        </div>
      </section>

      <section class="ledger-card">
        <div class="card-header">
          <div>
            <span class="section-tag">Movimiento interno</span>
            <h2>Transferir stock</h2>
          </div>
        </div>

        <div class="form-body">
          <div class="selects-row">
            <div class="field-group">
              <label for="source-select">Origen</label>
              <select id="source-select" bind:value={sourceLocationId}>
                {#each locations as location}
                  <option value={location.id}>{location.code} ({location.name || 'Sin nombre'})</option>
                {/each}
              </select>
            </div>
            <div class="field-group">
              <label for="destination-select">Destino</label>
              <select id="destination-select" bind:value={destinationLocationId}>
                {#each locations as location}
                  <option value={location.id}>{location.code} ({location.name || 'Sin nombre'})</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="field-group">
            <label for="product-id-input">Producto ID</label>
            <input id="product-id-input" bind:value={productId} placeholder="p1" />
          </div>
          <div class="field-group">
            <label for="quantity-microunits-input">Cantidad</label>
            <input id="quantity-microunits-input" type="number" min="1" step="1" bind:value={quantityMicrounits} />
          </div>

          <div class="btn-row">
            <Button
              variant="primary"
              onclick={transfer}
              disabled={busy ||
                !productId ||
                !sourceLocationId ||
                !destinationLocationId ||
                sourceLocationId === destinationLocationId}
              icon="arrow-right"
            >
              Transferir stock
            </Button>
            <Button
              variant="secondary"
              onclick={pick}
              disabled={busy || !productId}
              icon="package"
            >
              Picking FEFO
            </Button>
          </div>
        </div>
      </section>
    </div>

    <section class="ledger-card">
      <div class="card-header">
        <div>
          <span class="section-tag">Existencia granular</span>
          <h2>Stock por ubicación y producto</h2>
        </div>
      </div>

      <Table
        columns={[
          { label: 'Código Rack' },
          { label: 'Producto ID' },
          { label: 'Nombre de Producto' },
          { label: 'Stock en Rack', align: 'right' },
          { label: 'Total Sucursal', align: 'right' },
        ]}
        items={stock}
        empty="No hay datos de inventario registrados para esta sucursal."
        emptyDescription="Crea una ubicación y registra existencias para ver el stock por rack."
      >
        {#snippet emptyAction()}
          <Button variant="secondary" href="#nueva-ubicacion" data-testid="stock-empty-create">
            Crear ubicación
          </Button>
        {/snippet}
        {#snippet cell(row: StockRow, col)}
          {#if col.label === 'Código Rack'}
            <Badge variant="indigo">{row.location_code}</Badge>
          {:else if col.label === 'Producto ID'}
            <span class="tabular-nums">{row.product_id}</span>
          {:else if col.label === 'Nombre de Producto'}
            <strong>{row.product_name}</strong>
          {:else if col.label === 'Stock en Rack'}
            <span class="tabular-nums">{units(row.quantity_microunits)} u</span>
          {:else}
            <span class="tabular-nums">{units(row.branch_quantity_microunits)} u</span>
          {/if}
        {/snippet}
      </Table>
    </section>
  {/if}
</div>

<style>
  .location-admin-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .notice-box {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .branch-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .branch-input-group {
    max-width: 320px;
    width: 100%;
  }

  .racks-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .section-title-bar h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .rack-map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }

  .rack-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .rack-card.inactive {
    opacity: 0.72;
  }

  .rack-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
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

  .empty-racks-box {
    grid-column: 1 / -1;
  }

  .form-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .selects-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media (max-width: 899px) {
    .selects-row {
      grid-template-columns: 1fr;
    }
  }
</style>
