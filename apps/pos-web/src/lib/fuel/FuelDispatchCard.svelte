<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isFuelStationEnabled, isWithholdingsEnabled } from '$lib/features';
  import {
    FUEL_CATALOG,
    computeFuelDispatchByAmount,
    computeFuelDispatchByGallons,
    type FuelDispatchResult,
  } from './dispatch.js';
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

  const fuelOn = isFuelStationEnabled();
  const withholdingsOn = isWithholdingsEnabled();

  let fuelCode = $state('DIESEL_B5');
  let islandId = $state('isla-1');
  let plate = $state('');
  let gallonsInput = $state('10');
  let amountMode = $state<'gallons' | 'amount'>('gallons');
  let amountInput = $state('5000'); // cents

  // precio del día: snapshot del catálogo (servidor impone el precio final)
  const selectedFuel = $derived(FUEL_CATALOG.find((f) => f.code === fuelCode) ?? FUEL_CATALOG[2]!);
  // factura a empresa? Heurística premium: si placa y RUC-like se detecta B2B, muestra detracción
  // Por ahora switch simple para demo cajero apurado (44px target)
  let isBusinessInvoice = $state(true);

  let preview: FuelDispatchResult | null = $state(null);
  let previewError = $state('');

  function recompute() {
    previewError = '';
    try {
      if (amountMode === 'gallons') {
        const g = Number(gallonsInput);
        if (!Number.isFinite(g)) throw new Error('Galones no válidos');
        preview = computeFuelDispatchByGallons({
          fuelCode,
          gallons: g,
          priceCentsPerGallon: selectedFuel.priceCentsPerGallon,
          isBusinessInvoice: withholdingsOn ? isBusinessInvoice : false,
          documentType: isBusinessInvoice ? '01' : '03',
        });
      } else {
        const cents = Number(amountInput);
        if (!Number.isInteger(cents)) throw new Error('Monto no válido');
        preview = computeFuelDispatchByAmount({
          fuelCode,
          amountCents: cents,
          priceCentsPerGallon: selectedFuel.priceCentsPerGallon,
          isBusinessInvoice: withholdingsOn ? isBusinessInvoice : false,
          documentType: isBusinessInvoice ? '01' : '03',
        });
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
    void selectedFuel.priceCentsPerGallon;
    recompute();
  });

  function handleCobrar() {
    if (!preview) return;
    onDispatch?.({ ...preview, plate: plate.trim(), islandId });
  }

  const islands = ['isla-1', 'isla-2', 'isla-3', 'isla-4'] as const;
</script>

{#if !fuelOn}
  <div class="feature-off-banner" data-testid="fuel-off">
    <Icon name="info" size={18} />
    <span>El módulo de surtidores no está activo para esta tienda. Contacta a tu proveedor.</span>
  </div>
{:else}
  <section class="ledger-card fuel-card" data-testid="fuel-dispatch-card" aria-label="Despacho por surtidor">
    <div class="card-header">
      <div class="header-left">
        <Badge variant="indigo">Surtidor</Badge>
        <h2 class="card-title">Despacho en pista</h2>
      </div>
      <span class="price-badge tabular-nums" data-testid="fuel-price">
        S/ {formatCents(selectedFuel.priceCentsPerGallon)} por galón
      </span>
    </div>

    <p class="card-lede">Elige combustible, indica galones o monto y cobra en segundos. Todo funciona sin internet.</p>

    <!-- Combustible + Isla -->
    <div class="fuel-grid">
      <Field label="Combustible" id="fuel-code">
        <select id="fuel-code" bind:value={fuelCode} data-testid="fuel-select" class="fuel-select">
          {#each FUEL_CATALOG as f}
            <option value={f.code}>{f.name}{f.subjectToDetraction ? ' · detracción 10%' : ''}</option>
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
    {#if withholdingsOn && selectedFuel.subjectToDetraction}
      <label class="checkbox-row" data-testid="fuel-b2b-row">
        <input type="checkbox" bind:checked={isBusinessInvoice} data-testid="fuel-b2b-check" />
        <span>Factura a empresa (con detracción 10%)</span>
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
          <strong class="tabular-nums">{Math.floor(preview.gallonsMicrounits / 1000000)}.{String(preview.gallonsMicrounits % 1000000).padStart(6, '0').slice(0, 3)} gal</strong>
        </div>
        <div class="preview-row">
          <span class="preview-label">Subtotal</span>
          <span class="tabular-nums">S/ {formatCents(preview.subtotalCents)}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">IGV 18%</span>
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
              <strong>Detracción 10% · S/ {formatCents(preview.detractionCents)}</strong>
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
      disabled={!preview}
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
