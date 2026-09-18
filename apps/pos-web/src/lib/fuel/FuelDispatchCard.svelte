<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { capabilities as tenantCapabilities } from '$lib/tenant/capabilitiesStore.js';
  import {
    computeFuelDispatchByAmountWithCatalog,
    computeFuelDispatchByGallonsWithCatalog,
    GALLON_MICROUNITS_PER_GALLON,
    type FuelProduct,
    type FuelDispatchResult,
  } from './dispatch.js';
  import { createFuelDispatch, fetchFuelCatalog, type FuelCatalogSnapshot } from './fuel-client.js';
  import { onMount } from 'svelte';
  import { cashSessionContext } from '$lib/admin/cash-session';
  import Icon from '$lib/ui/Icon.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';

  let {
    onDispatch,
  }: {
    onDispatch?: (result: FuelDispatchResult & { plate: string; islandId: string }) => void;
  } = $props();

  let capabilitiesSnapshot = $state<ReadonlySet<string>>(new Set());
  const fuelOn = $derived(capabilitiesSnapshot.has('fuel.dispatch'));
  const withholdingsOn = $derived(capabilitiesSnapshot.has('fiscal.withholdings'));

  let fuelCode = $state('');
  let islandId = $state('isla-1');
  let plate = $state('');
  let gallonsInput = $state('10');
  let amountMode = $state<'gallons' | 'amount'>('gallons');
  let amountInput = $state('5000'); // cents
  // El catálogo y la política fiscal siempre provienen del servidor. No hay
  // precios, códigos ni tasas de respaldo en el cliente.
  let catalog = $state<FuelProduct[]>([]);
  let catalogError = $state('');

  onMount(() => {
    const unsubscribeCapabilities = tenantCapabilities.subscribe((value) => {
      capabilitiesSnapshot = new Set(value);
    });
    let active = true;
    void fetchFuelCatalog()
      .then((items) => {
        if (!active || items.length === 0) return;
        const nextCatalog = items.flatMap((item: FuelCatalogSnapshot) => {
          if (!item.code || !Number.isSafeInteger(item.priceCentsPerGallon) || item.priceCentsPerGallon <= 0) return [];
          const detractionRateBps = item.detractionRateBps ?? 0;
          const igvRateBps = item.igvRateBps;
          if (igvRateBps === undefined || !Number.isSafeInteger(igvRateBps) || igvRateBps < 0) return [];
          return [{
            code: item.code,
            name: item.name ?? item.code,
            priceCentsPerGallon: item.priceCentsPerGallon,
            igvRateBps,
            unit: 'gal' as const,
            subjectToDetraction: detractionRateBps > 0,
            detractionRateBps,
          }];
        });
        catalog = nextCatalog;
        if (!nextCatalog.some((fuel) => fuel.code === fuelCode)) fuelCode = nextCatalog[0]!.code;
      })
      .catch(() => {
        if (active) catalogError = 'No se pudo actualizar el catálogo; se usará el último snapshot disponible.';
      });
    return () => {
      active = false;
      unsubscribeCapabilities();
    };
  });

  // precio del día: snapshot del catálogo (servidor impone el precio final)
  const selectedFuel = $derived(catalog.find((f) => f.code === fuelCode) ?? catalog[0]);
  let isBusinessInvoice = $state(false);

  let preview: FuelDispatchResult | null = $state(null);
  let previewError = $state('');
  let charging = $state(false);
  let pendingIdentity = $state<{ dispatchId: string; idempotencyKey: string } | null>(null);

  function recompute() {
    previewError = '';
    pendingIdentity = null;
    try {
      if (!selectedFuel) throw new Error('Catálogo no disponible');
      if (amountMode === 'gallons') {
        const g = Number(gallonsInput);
        if (!Number.isFinite(g)) throw new Error('Galones no válidos');
        preview = computeFuelDispatchByGallonsWithCatalog({
          fuelCode,
          gallons: g,
          isBusinessInvoice: withholdingsOn ? isBusinessInvoice : false,
          documentType: isBusinessInvoice ? '01' : '03',
        }, catalog);
      } else {
        const cents = Number(amountInput);
        if (!Number.isInteger(cents)) throw new Error('Monto no válido');
        preview = computeFuelDispatchByAmountWithCatalog({
          fuelCode,
          amountCents: cents,
          isBusinessInvoice: withholdingsOn ? isBusinessInvoice : false,
          documentType: isBusinessInvoice ? '01' : '03',
        }, catalog);
      }
    } catch (e) {
      preview = null;
      previewError = e instanceof Error ? e.message : 'No se pudo calcular';
    }
  }

  // feedback <100ms: recompute sin debounce (puro, sin red)
  $effect(() => {
    void fuelCode;
    void gallonsInput;
    void amountInput;
    void amountMode;
    void isBusinessInvoice;
    void selectedFuel?.priceCentsPerGallon;
    recompute();
  });

  async function handleCobrar() {
    if (!preview) return;
    charging = true;
    previewError = '';
    try {
      pendingIdentity ??= { dispatchId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      const cash = cashSessionContext();
      const authoritative = await createFuelDispatch({
        dispatchId: pendingIdentity?.dispatchId ?? crypto.randomUUID(),
        idempotencyKey: pendingIdentity?.idempotencyKey ?? crypto.randomUUID(),
        fuelCode: preview.fuelCode,
        volumeMicrounits: preview.gallonsMicrounits,
        businessInvoice: withholdingsOn && isBusinessInvoice,
        documentType: isBusinessInvoice ? '01' : '03',
        islandId,
        nozzleId: islandId,
        paymentMethod: 'cash',
        branchId: cash.branchId,
        cashRegisterSessionId: cash.sessionId,
        plate: plate.trim(),
      });
      pendingIdentity = null;
      onDispatch?.({
        ...preview,
        totalCents: authoritative.totalCents,
        detractionCents: authoritative.detractionCents ?? preview.detractionCents,
        netPayableCents: authoritative.totalCents,
        plate: plate.trim(),
        islandId,
      });
    } catch {
      previewError = 'No se pudo confirmar el despacho. Revisa la conexión e inténtalo otra vez.';
    } finally {
      charging = false;
    }
  }

  const islands = ['isla-1', 'isla-2', 'isla-3', 'isla-4'] as const;

  function formatRateBps(rateBps: number): string {
    return `${rateBps / 100}%`;
  }
</script>

{#if !fuelOn}
  <div class="feature-off-banner" data-testid="fuel-off">
    <Icon name="info" size={18} />
    <span>El módulo de surtidores no está activo para esta tienda. Contacta a tu proveedor.</span>
  </div>
{:else if catalog.length === 0}
  <div class="feature-off-banner" data-testid="fuel-catalog-unavailable">
    <Icon name="info" size={18} />
    <span>No hay un catálogo de combustibles disponible para esta tienda.</span>
  </div>
{:else}
  <section class="ledger-card fuel-card" data-testid="fuel-dispatch-card" aria-label="Despacho por surtidor">
    <div class="card-header">
      <div class="header-left">
        <Badge variant="indigo">Surtidor</Badge>
        <h2 class="card-title">Despacho en pista</h2>
      </div>
      <span class="price-badge tabular-nums" data-testid="fuel-price">
        S/ {formatCents(selectedFuel!.priceCentsPerGallon)} por galón
      </span>
    </div>

    <p class="card-lede">Elige combustible, indica galones o monto y cobra en segundos. Todo funciona sin internet.</p>

    <!-- Combustible + Isla -->
    <div class="fuel-grid">
      <Field label="Combustible" id="fuel-code">
        <select id="fuel-code" bind:value={fuelCode} data-testid="fuel-select" class="fuel-select">
          {#each catalog as f}
            <option value={f.code}>{f.name}{f.subjectToDetraction ? ` · detracción ${formatRateBps(f.detractionRateBps ?? 0)}` : ''}</option>
          {/each}
        </select>
      </Field>
      <Field label="Isleta" id="fuel-island">
        <select id="fuel-island" bind:value={islandId} data-testid="fuel-island" class="fuel-select">
          {#each islands as id}
            <option value={id}>{id.toUpperCase()}</option>
          {/each}
        </select>
      </Field>
    </div>

    {#if catalogError}
      <p class="preview-hint" role="status">{catalogError}</p>
    {/if}

    <!-- Placa (opcional, para flota) -->
    <Field label="Placa (opcional)" id="fuel-plate">
      <Input id="fuel-plate" bind:value={plate} data-testid="fuel-plate" placeholder="ABC-123" maxlength={7} />
    </Field>

    <!-- Modo: galones vs monto -->
    <div class="mode-tabs" role="tablist" aria-label="Modo de despacho">
      <button
        type="button"
        role="tab"
        aria-selected={amountMode === 'gallons'}
        class:active={amountMode === 'gallons'}
        class="mode-tab"
        data-testid="fuel-mode-gallons"
        onclick={() => (amountMode = 'gallons')}
      >
        Por galones
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={amountMode === 'amount'}
        class:active={amountMode === 'amount'}
        class="mode-tab"
        data-testid="fuel-mode-amount"
        onclick={() => (amountMode = 'amount')}
      >
        Por monto
      </button>
    </div>

    {#if amountMode === 'gallons'}
      <Field label="Galones" id="fuel-gallons">
        <Input
          id="fuel-gallons"
          type="number"
          inputmode="decimal"
          bind:value={gallonsInput}
          data-testid="fuel-gallons"
          placeholder="10.000"
          min="0.001"
          step="0.001"
        />
      </Field>
    {:else}
      <Field label="Monto" id="fuel-amount">
        <Input id="fuel-amount" type="number" bind:value={amountInput} data-testid="fuel-amount" placeholder="10000" min="1" step="1" />
        <span class="field-hint">Equivale a galones calculados al precio del día</span>
      </Field>
    {/if}

    <!-- Factura a empresa? (solo si withholdingsOn) -->
    {#if withholdingsOn && selectedFuel?.subjectToDetraction}
      <label class="checkbox-row" data-testid="fuel-b2b-row">
        <input type="checkbox" bind:checked={isBusinessInvoice} data-testid="fuel-b2b-check" />
        <span>Factura a empresa (con detracción {formatRateBps(selectedFuel?.detractionRateBps ?? 0)})</span>
        <Badge variant="warning">Detracción</Badge>
      </label>
    {/if}

    <!-- Preview <100ms -->
    {#if previewError}
      <p class="preview-error" role="alert" data-testid="fuel-error">{previewError}</p>
    {:else if preview}
      <div class="preview-box" data-testid="fuel-preview">
        <div class="preview-row">
          <span class="preview-label">Volumen</span>
          <strong class="tabular-nums">{Math.floor(preview.gallonsMicrounits / GALLON_MICROUNITS_PER_GALLON)}.{String(preview.gallonsMicrounits % GALLON_MICROUNITS_PER_GALLON).padStart(6, '0').slice(0, 3)} gal</strong>
        </div>
        <div class="preview-row">
          <span class="preview-label">Subtotal</span>
          <span class="tabular-nums">S/ {formatCents(preview.subtotalCents)}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">IGV {formatRateBps(preview.igvRateBps)}</span>
          <span class="tabular-nums">S/ {formatCents(preview.igvCents)}</span>
        </div>
        <div class="preview-row total-row">
          <span class="preview-label">Total</span>
          <strong class="tabular-nums total-amount">S/ {formatCents(preview.totalCents)}</strong>
        </div>
        {#if preview.detractionCents > 0}
          <div class="detraction-box" data-testid="fuel-detraction">
            <Icon name="shield" size={16} />
            <div class="detraction-text">
              <strong>Detracción {formatRateBps(preview.detractionRateBps)} · S/ {formatCents(preview.detractionCents)}</strong>
              <span class="detraction-hint">Monto a depositar aparte. No se descuenta del total a cobrar.</span>
            </div>
          </div>
        {/if}
        <div class="preview-meta">
          <span class="tabular-nums">{preview.fuelName} · {islandId.toUpperCase()}</span>
          {#if plate.trim()}<span class="tabular-nums">Placa {plate.trim().toUpperCase()}</span>{/if}
        </div>
      </div>
    {/if}

    <!-- Acción principal 44x44 -->
    <Button
      variant="primary"
      size="xl"
      data-testid="fuel-charge"
      onclick={handleCobrar}
      disabled={!preview || charging}
      icon="zap"
      aria-label="Cobrar despacho"
    >
      Cobrar S/ {preview ? formatCents(preview.totalCents) : '—'}
    </Button>
    <p class="charge-hint">Botón de 44 px · contraste AA · listo para hora punta.</p>
  </section>
{/if}

<style>
  .fuel-card { display: flex; flex-direction: column; gap: 1rem; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .card-title { font-size: 1.25rem; font-weight: 800; margin: 0; }
  .card-lede { color: var(--text-muted); font-size: 0.9375rem; line-height: 1.5; margin: 0; }
  .price-badge { background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); padding: 0.375rem 0.625rem; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.875rem; }
  .fuel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.875rem; }
  .fuel-select { width: 100%; min-height: 44px; padding: 0.625rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-main); font-weight: 600; }
  .mode-tabs { display: flex; gap: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.25rem; border-radius: var(--radius-sm); }
  .mode-tab { flex: 1; min-height: 44px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); font-weight: 700; }
  .mode-tab.active { background: var(--bg-card); color: var(--text-main); border-color: var(--border-subtle); }
  .checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; min-height: 44px; }
  .checkbox-row input { width: 22px; height: 22px; accent-color: var(--accent-primary); }
  .preview-box { background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .preview-row { display: flex; justify-content: space-between; align-items: center; }
  .preview-label { color: var(--text-muted); font-weight: 600; font-size: 0.875rem; }
  .total-row { border-top: 1px solid var(--border-subtle); padding-top: 0.5rem; margin-top: 0.25rem; }
  .total-amount { font-size: 1.5rem; color: var(--text-main); }
  .detraction-box { display: flex; gap: 0.625rem; align-items: flex-start; background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251,191,36,0.35); border-radius: var(--radius-sm); padding: 0.75rem; margin-top: 0.25rem; }
  .detraction-text { display: flex; flex-direction: column; }
  .detraction-hint { font-size: 0.8125rem; color: var(--text-muted); line-height: 1.4; }
  .preview-meta { display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 0.8125rem; color: var(--text-muted); border-top: 1px dashed var(--border-subtle); padding-top: 0.5rem; margin-top: 0.25rem; }
  .preview-error { color: var(--rose-red); font-weight: 600; }
  .charge-hint { font-size: 0.75rem; color: var(--text-muted); text-align: center; margin: 0; }
  .feature-off-banner { display: flex; gap: 0.5rem; align-items: center; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.875rem; color: var(--text-muted); }
  .field-hint { font-size: 0.8125rem; color: var(--text-muted); }
  @media (max-width: 640px) { .fuel-grid { grid-template-columns: 1fr; } }
</style>
