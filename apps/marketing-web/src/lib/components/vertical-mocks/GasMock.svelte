<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents } from '$lib/brand/money';
  import { onMount } from 'svelte';

  type GasTab = 'surtidor' | 'precios' | 'flota';
  type IsletaTone = 'libre' | 'despachando' | 'pago';

  interface Isleta {
    readonly id: string;
    readonly code: string;
    readonly tone: IsletaTone;
    readonly plate?: string;
    readonly fuel?: string;
    readonly pricePerGal_cents?: number;
    readonly isDiesel?: boolean;
  }

  interface Combustible {
    readonly id: string;
    readonly name: string;
    readonly unit: string;
    price_cents: number;
    readonly bestseller?: boolean;
    readonly detraccion?: boolean;
  }

  interface FlotaCliente {
    readonly id: string;
    readonly empresa: string;
    readonly ruc: string;
    readonly saldo_cents: number;
    readonly combustible: string;
    readonly dieselAfecto: boolean;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<GasTab>('surtidor');

  // ─── SURTIDOR tab ────────────────────────────────────────────────────────
  const isletas: readonly Isleta[] = [
    { id: 'i1', code: 'Isleta 1', tone: 'libre' },
    {
      id: 'i2',
      code: 'Isleta 2',
      tone: 'despachando',
      plate: 'ABC-456',
      fuel: 'Gasohol 95',
      pricePerGal_cents: 1780,
      isDiesel: false,
    },
    {
      id: 'i3',
      code: 'Isleta 3',
      tone: 'pago',
      plate: 'XYZ-789',
      fuel: 'Diésel B5',
      pricePerGal_cents: 1620,
      isDiesel: true,
    },
  ];

  let selectedIsletaId = $state('i2');
  const selectedIsleta = $derived(isletas.find((i) => i.id === selectedIsletaId) ?? isletas[1]);

  // Galones representados en milésimas para evitar floats: 18200 = 18.200 gal
  let galonesMilesimas = $state(18200);

  function formatGalones(milesimas: number): string {
    const entero = Math.floor(milesimas / 1000);
    const decs = String(milesimas % 1000).padStart(3, '0');
    return `${entero}.${decs}`;
  }

  // Total del despacho: galones × precio por galón (todo en centimos enteros)
  const totalDespacho_cents = $derived(
    Math.round((galonesMilesimas * (selectedIsleta.pricePerGal_cents ?? 1780)) / 1000),
  );

  // Detracción solo si la isleta activa despacha diésel
  const despachoDetraccion_cents = $derived(
    selectedIsleta.isDiesel ? Math.round(totalDespacho_cents * 10 / 100) : 0,
  );
  const despachoNeto_cents = $derived(totalDespacho_cents - despachoDetraccion_cents);

  let isCobrando = $state(false);
  let isCobrado = $state(false);

  function handleCobrarDespacho() {
    if (isCobrando || isCobrado) return;
    isCobrando = true;
    setTimeout(() => {
      isCobrando = false;
      isCobrado = true;
    }, 700);
  }

  function handleNuevaVenta() {
    isCobrado = false;
    galonesMilesimas = 18200;
  }

  // ─── PRECIOS tab ─────────────────────────────────────────────────────────
  let combustibles = $state<Combustible[]>([
    { id: 'g90', name: 'Gasohol 90', unit: 'gal', price_cents: 1680 },
    { id: 'g95', name: 'Gasohol 95', unit: 'gal', price_cents: 1780, bestseller: true },
    { id: 'g97', name: 'Gasohol 97', unit: 'gal', price_cents: 1920 },
    { id: 'g98', name: 'Gasohol 98', unit: 'gal', price_cents: 2050 },
    { id: 'diesel', name: 'Diésel B5', unit: 'gal', price_cents: 1620, detraccion: true },
    { id: 'glp', name: 'GLP', unit: 'kg', price_cents: 540 },
  ]);

  let updatedFuelId = $state<string | null>(null);

  function handleActualizarPrecios() {
    combustibles = combustibles.map((c) =>
      c.id === 'g95' ? { ...c, price_cents: c.price_cents === 1780 ? 1790 : 1780 } : c,
    );
    updatedFuelId = 'g95';
    setTimeout(() => {
      updatedFuelId = null;
    }, 1600);
  }

  // ─── FLOTA tab ───────────────────────────────────────────────────────────
  const flotaClientes: readonly FlotaCliente[] = [
    {
      id: 'f1',
      empresa: 'Transportes Lima S.A.C.',
      ruc: '20112233441',
      saldo_cents: 125000,
      combustible: 'Diésel B5',
      dieselAfecto: true,
    },
    {
      id: 'f2',
      empresa: 'Constructora Andina E.I.R.L.',
      ruc: '20445566778',
      saldo_cents: 380000,
      combustible: 'Gasohol 95',
      dieselAfecto: false,
    },
    {
      id: 'f3',
      empresa: 'Almacenes Peru S.A.',
      ruc: '20887766551',
      saldo_cents: 89000,
      combustible: 'Diésel B5',
      dieselAfecto: true,
    },
  ];

  let selectedFlotaId = $state('f1');
  const selectedFlota = $derived(
    flotaClientes.find((f) => f.id === selectedFlotaId) ?? flotaClientes[0],
  );

  // Monto de despacho ejemplo a flota: S/ 200.00 = 20000 cents
  const flotaDespachoMonto_cents = 20000;
  const flotaDetraccion_cents = $derived(
    selectedFlota.dieselAfecto ? Math.round(flotaDespachoMonto_cents * 10 / 100) : 0,
  );
  const flotaNeto_cents = $derived(flotaDespachoMonto_cents - flotaDetraccion_cents);

  let flotaDespachado = $state(false);
  function handleDespacharFlota() {
    flotaDespachado = true;
    setTimeout(() => {
      flotaDespachado = false;
    }, 1200);
  }

  // ─── Animación del contador de galones ──────────────────────────────────
  onMount(() => {
    const interval = setInterval(() => {
      if (galonesMilesimas < 20500 && !isCobrado) {
        galonesMilesimas += 40;
      }
    }, 900);
    return () => clearInterval(interval);
  });
</script>

<div class="vertical-mock-container" data-testid="gas-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Grifo · KipusPay"
    statusBadge={activeTab === 'surtidor'
      ? 'Isleta 2 · Despachando'
      : activeTab === 'precios'
        ? 'Precios · En vivo'
        : 'Flota · B2B'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz de control de surtidores, precios de combustibles y gestión de flota para grifo"
  >
    <div class="mock-screen">
      <!-- Main Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de grifo">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'surtidor'}
          class="mock-nav-tab"
          class:active={activeTab === 'surtidor'}
          onclick={() => (activeTab = 'surtidor')}
        >
          [Surtidor]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'precios'}
          class="mock-nav-tab"
          class:active={activeTab === 'precios'}
          onclick={() => (activeTab = 'precios')}
        >
          [Precios]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'flota'}
          class="mock-nav-tab"
          class:active={activeTab === 'flota'}
          onclick={() => (activeTab = 'flota')}
        >
          [Flota]
        </button>
      </div>

      <!-- ═══ VISTA 1: SURTIDOR ═══ -->
      {#if activeTab === 'surtidor'}
        <div class="tab-view-content" data-testid="gas-view-surtidor">
          <!-- Isleta selector -->
          <div class="isleta-tabs" role="tablist" aria-label="Seleccionar isleta">
            {#each isletas as isleta (isleta.id)}
              <button
                type="button"
                role="tab"
                aria-selected={selectedIsletaId === isleta.id}
                class="isleta-chip tone-{isleta.tone}"
                class:active={selectedIsletaId === isleta.id}
                onclick={() => {
                  selectedIsletaId = isleta.id;
                  isCobrado = false;
                  if (isleta.id === 'i2') galonesMilesimas = 18200;
                }}
              >
                <span class="isleta-dot tone-{isleta.tone}" aria-hidden="true"></span>
                {isleta.code}
              </button>
            {/each}
          </div>

          <!-- Isleta activa detail -->
          {#if selectedIsleta.tone === 'libre'}
            <div class="isleta-libre-card">
              <span class="libre-dot" aria-hidden="true"></span>
              <div>
                <p class="libre-title">Isleta disponible</p>
                <p class="libre-sub">Sin despacho activo · Lista para atender</p>
              </div>
            </div>
          {:else}
            <!-- Despacho card -->
            <div class="despacho-card" class:cobrado={isCobrado}>
              <div class="despacho-header">
                <div class="despacho-meta">
                  <span class="placa-badge">{selectedIsleta.plate}</span>
                  <span class="fuel-badge" class:diesel={selectedIsleta.isDiesel}>
                    {selectedIsleta.fuel}
                    {#if selectedIsleta.isDiesel}
                      <span class="detrac-mini">· Det. 10%</span>
                    {/if}
                  </span>
                </div>
                <div class="isleta-status-pill tone-{selectedIsleta.tone}">
                  {#if selectedIsleta.tone === 'despachando'}
                    Despachando
                  {:else}
                    En espera de pago
                  {/if}
                </div>
              </div>

              <!-- Gallon counter (animated) -->
              {#if selectedIsleta.tone === 'despachando'}
                <div class="gal-counter-area">
                  <div class="gal-counter-main">
                    <span class="gal-value tabular-nums">
                      {isCobrado ? '20.500' : formatGalones(galonesMilesimas)}
                    </span>
                    <span class="gal-unit">gal</span>
                  </div>
                  <div class="gal-price-row">
                    <span class="gal-price-label">S/ {formatCents(selectedIsleta.pricePerGal_cents ?? 1780)} / gal</span>
                    <span class="gal-dot-live" aria-hidden="true" class:stopped={isCobrado}></span>
                  </div>
                </div>
              {:else}
                <div class="gal-counter-area">
                  <div class="gal-counter-main">
                    <span class="gal-value tabular-nums">15.820</span>
                    <span class="gal-unit">gal</span>
                  </div>
                  <div class="gal-price-row">
                    <span class="gal-price-label">S/ {formatCents(selectedIsleta.pricePerGal_cents ?? 1620)} / gal</span>
                    <span class="pago-indicator">⏳ Pendiente de cobro</span>
                  </div>
                </div>
              {/if}

              <!-- Total breakdown -->
              <div class="despacho-total-block">
                {#if selectedIsleta.isDiesel && despachoDetraccion_cents > 0 && !isCobrado}
                  <div class="detrac-row">
                    <span class="detrac-label">Detracción SUNAT (10%)</span>
                    <span class="detrac-amount tabular-nums">- S/ {formatCents(despachoDetraccion_cents)}</span>
                  </div>
                  <div class="detrac-row neto">
                    <span class="detrac-label">Neto a pagar</span>
                    <span class="detrac-amount tabular-nums">S/ {formatCents(despachoNeto_cents)}</span>
                  </div>
                {/if}
                <div class="total-row">
                  <span class="total-label">{isCobrado ? 'COBRADO' : 'TOTAL DESPACHO'}</span>
                  <span class="total-amount tabular-nums">
                    <span class="cur">S/</span>
                    {#if selectedIsleta.tone === 'despachando'}
                      {isCobrado ? '36.49' : formatCents(totalDespacho_cents)}
                    {:else}
                      {formatCents(Math.round(15820 * (selectedIsleta.pricePerGal_cents ?? 1620) / 1000))}
                    {/if}
                  </span>
                </div>
              </div>
            </div>
          {/if}

          <!-- Action footer -->
          <div class="action-footer">
            {#if selectedIsleta.tone === 'libre'}
              <button type="button" class="charge-btn secondary" disabled>
                Isleta libre · Sin despacho
              </button>
            {:else if isCobrado}
              <button type="button" class="charge-btn paid" onclick={handleNuevaVenta}>
                Nueva venta ✓
              </button>
            {:else}
              <button
                type="button"
                class="charge-btn"
                class:loading={isCobrando}
                onclick={handleCobrarDespacho}
                disabled={isCobrando}
              >
                {#if isCobrando}
                  <span class="btn-spinner" aria-hidden="true"></span>
                  <span>Procesando cobro…</span>
                {:else}
                  <span>
                    Cobrar S/ {selectedIsleta.tone === 'despachando'
                      ? formatCents(totalDespacho_cents)
                      : formatCents(Math.round(15820 * (selectedIsleta.pricePerGal_cents ?? 1620) / 1000))}
                  </span>
                {/if}
              </button>
            {/if}
          </div>
        </div>

      <!-- ═══ VISTA 2: PRECIOS ═══ -->
      {:else if activeTab === 'precios'}
        <div class="tab-view-content" data-testid="gas-view-precios">
          <div class="precios-header">
            <span class="precios-title-tag">Precios vigentes hoy</span>
            <span class="precios-live-badge">
              <span class="pulse-dot" aria-hidden="true"></span>
              Activos
            </span>
          </div>

          <div class="precios-list">
            {#each combustibles as fuel (fuel.id)}
              <div
                class="fuel-row"
                class:bestseller={fuel.bestseller}
                class:updated={updatedFuelId === fuel.id}
                class:diesel-row={fuel.detraccion}
              >
                <div class="fuel-info">
                  <span class="fuel-name">{fuel.name}</span>
                  <div class="fuel-badges">
                    {#if fuel.bestseller}
                      <span class="badge-bestseller">MÁS VENDIDO</span>
                    {/if}
                    {#if fuel.detraccion}
                      <span class="badge-detraccion">DETRACCIÓN 10%</span>
                    {/if}
                  </div>
                </div>
                <div class="fuel-price-col">
                  <span class="fuel-price tabular-nums">S/ {formatCents(fuel.price_cents)}</span>
                  <span class="fuel-unit">/ {fuel.unit}</span>
                </div>
              </div>
            {/each}
          </div>

          <div class="precios-footer">
            <p class="precios-hint">Precios en Nuevos Soles · Impuesto incluido</p>
            <button type="button" class="update-prices-btn" onclick={handleActualizarPrecios}>
              {updatedFuelId ? 'Actualizado ✓' : 'Simular actualización'}
            </button>
          </div>
        </div>

      <!-- ═══ VISTA 3: FLOTA ═══ -->
      {:else if activeTab === 'flota'}
        <div class="tab-view-content" data-testid="gas-view-flota">
          <div class="flota-header">
            <span class="flota-title-tag">Clientes Empresa</span>
            <span class="flota-count">{flotaClientes.length} cuentas activas</span>
          </div>

          <!-- Empresa selector -->
          <div class="empresa-chips" role="group" aria-label="Seleccionar empresa de flota">
            {#each flotaClientes as cliente (cliente.id)}
              <button
                type="button"
                class="empresa-chip"
                class:active={selectedFlotaId === cliente.id}
                class:diesel-empresa={cliente.dieselAfecto}
                onclick={() => {
                  selectedFlotaId = cliente.id;
                  flotaDespachado = false;
                }}
              >
                <span class="empresa-short">
                  {cliente.empresa.split(' ')[0]}
                </span>
                <span class="empresa-type-dot" class:diesel={cliente.dieselAfecto} aria-hidden="true"></span>
              </button>
            {/each}
          </div>

          <!-- Empresa detail -->
          <div class="empresa-detail-card">
            <div class="ed-header">
              <div>
                <p class="ed-empresa">{selectedFlota.empresa}</p>
                <p class="ed-ruc">RUC {selectedFlota.ruc}</p>
              </div>
              <span class="ed-fuel-badge" class:diesel-badge={selectedFlota.dieselAfecto}>
                {selectedFlota.combustible}
              </span>
            </div>

            <div class="saldo-row">
              <span class="saldo-label">Saldo disponible</span>
              <span class="saldo-amount tabular-nums">S/ {formatCents(selectedFlota.saldo_cents)}</span>
            </div>

            <!-- Detracción panel (solo para diesel) -->
            {#if selectedFlota.dieselAfecto}
              <div class="detrac-panel">
                <div class="detrac-panel-header">
                  <span class="detrac-panel-title">Cálculo detracción · Despacho ejemplo</span>
                  <span class="sunat-badge">SUNAT SPOT</span>
                </div>
                <div class="detrac-calc-rows">
                  <div class="detrac-calc-row">
                    <span>Monto de venta</span>
                    <span class="tabular-nums">S/ {formatCents(flotaDespachoMonto_cents)}</span>
                  </div>
                  <div class="detrac-calc-row highlight">
                    <span>Detracción 10%</span>
                    <span class="tabular-nums detrac-neg">− S/ {formatCents(flotaDetraccion_cents)}</span>
                  </div>
                  <div class="detrac-calc-row neto">
                    <span class="neto-label">Neto a pagar</span>
                    <span class="tabular-nums neto-amount">S/ {formatCents(flotaNeto_cents)}</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="no-detrac-pill">
                <span>Sin detracción · {selectedFlota.combustible}</span>
              </div>
            {/if}
          </div>

          <!-- Footer -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={flotaDespachado}
              onclick={handleDespacharFlota}
            >
              {#if flotaDespachado}
                Despacho registrado ✓
              {:else}
                Despachar a {selectedFlota.empresa.split(' ')[0]}
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </PhoneMockFrame>
</div>

<style>
  .vertical-mock-container {
    width: 380px;
    max-width: 100%;
    margin: 0 auto;
  }

  .mock-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.35rem;
    padding: 0.1rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* ── Navigation Tabs ──────────────────────────────────────────────────── */
  .mock-nav-tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    background: #0d1117;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.15rem;
    flex-shrink: 0;
  }

  .mock-nav-tab {
    background: transparent;
    border: none;
    color: rgba(243, 239, 230, 0.65);
    font-family: var(--font-mono);
    font-size: 0.63rem;
    font-weight: 600;
    padding: 0.35rem 0.2rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mock-nav-tab:hover {
    color: var(--paper);
    background: rgba(243, 239, 230, 0.05);
  }

  .mock-nav-tab.active {
    background: rgba(229, 169, 59, 0.22);
    color: var(--amber-bright);
    font-weight: 700;
    border: 1px solid rgba(229, 169, 59, 0.35);
  }

  .tab-view-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 0.35rem;
  }

  /* ── Isleta chips ─────────────────────────────────────────────────────── */
  .isleta-tabs {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .isleta-chip {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.65);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.35rem 0.3rem;
    border-radius: 7px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 34px;
  }

  .isleta-chip:hover {
    color: var(--paper);
    background: rgba(243, 239, 230, 0.08);
  }

  .isleta-chip.active {
    border-color: rgba(229, 169, 59, 0.4);
    background: rgba(229, 169, 59, 0.14);
    color: var(--amber-bright);
  }

  .isleta-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .isleta-dot.tone-libre {
    background: #34d399;
    box-shadow: 0 0 5px #34d399;
  }

  .isleta-dot.tone-despachando {
    background: var(--amber-bright);
    box-shadow: 0 0 5px var(--amber);
    animation: blink-dot 1.2s ease-in-out infinite;
  }

  .isleta-dot.tone-pago {
    background: #f87171;
    box-shadow: 0 0 5px #f87171;
  }

  @keyframes blink-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* ── Isleta libre card ────────────────────────────────────────────────── */
  .isleta-libre-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    background: rgba(52, 211, 153, 0.07);
    border: 1px solid rgba(52, 211, 153, 0.2);
    border-radius: 10px;
    padding: 0.8rem 0.9rem;
  }

  .libre-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 8px #34d399;
    flex-shrink: 0;
  }

  .libre-title {
    font-weight: 700;
    font-size: 0.78rem;
    color: #6ee7b7;
    margin: 0;
  }

  .libre-sub {
    font-size: 0.62rem;
    color: rgba(52, 211, 153, 0.6);
    margin: 0.1rem 0 0;
  }

  /* ── Despacho card ────────────────────────────────────────────────────── */
  .despacho-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: #12151c;
    border: 1px solid rgba(229, 169, 59, 0.2);
    border-radius: 10px;
    padding: 0.55rem 0.65rem;
    flex: 1;
    transition: border-color 0.3s ease;
  }

  .despacho-card.cobrado {
    border-color: rgba(52, 211, 153, 0.35);
  }

  .despacho-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .despacho-meta {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .placa-badge {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--paper);
    background: rgba(243, 239, 230, 0.08);
    border: 1px solid rgba(243, 239, 230, 0.14);
    padding: 0.1rem 0.4rem;
    border-radius: 5px;
    letter-spacing: 0.05em;
    align-self: flex-start;
  }

  .fuel-badge {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.1);
    border: 1px solid rgba(229, 169, 59, 0.2);
    padding: 0.08rem 0.35rem;
    border-radius: 4px;
    align-self: flex-start;
  }

  .fuel-badge.diesel {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.25);
  }

  .detrac-mini {
    font-weight: 500;
    opacity: 0.8;
  }

  .isleta-status-pill {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: 20px;
    white-space: nowrap;
  }

  .isleta-status-pill.tone-despachando {
    background: rgba(229, 169, 59, 0.18);
    color: var(--amber-bright);
    border: 1px solid rgba(229, 169, 59, 0.35);
  }

  .isleta-status-pill.tone-pago {
    background: rgba(248, 113, 113, 0.15);
    color: #fca5a5;
    border: 1px solid rgba(248, 113, 113, 0.3);
  }

  /* ── Gallon counter ───────────────────────────────────────────────────── */
  .gal-counter-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.4rem 0;
  }

  .gal-counter-main {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .gal-value {
    font-family: var(--font-mono);
    font-size: 2rem;
    font-weight: 800;
    color: var(--amber-bright);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .gal-unit {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: rgba(229, 169, 59, 0.7);
    font-weight: 600;
  }

  .gal-price-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .gal-price-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .gal-dot-live {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 5px #34d399;
    animation: blink-dot 1s ease-in-out infinite;
  }

  .gal-dot-live.stopped {
    background: rgba(52, 211, 153, 0.3);
    box-shadow: none;
    animation: none;
  }

  .pago-indicator {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #fca5a5;
  }

  /* ── Total block ──────────────────────────────────────────────────────── */
  .despacho-total-block {
    background: #0d1117;
    border: 1px solid rgba(243, 239, 230, 0.07);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .detrac-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.63rem;
  }

  .detrac-label {
    color: rgba(243, 239, 230, 0.55);
  }

  .detrac-amount {
    color: rgba(243, 239, 230, 0.65);
    font-family: var(--font-mono);
    font-size: 0.63rem;
  }

  .detrac-row.neto .detrac-amount {
    color: var(--paper);
    font-weight: 700;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-top: 1px solid rgba(243, 239, 230, 0.08);
    padding-top: 0.2rem;
    margin-top: 0.1rem;
  }

  .total-label {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(243, 239, 230, 0.55);
  }

  .total-amount {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--paper);
  }

  .cur {
    font-size: 0.7rem;
    font-weight: 600;
    margin-right: 0.15rem;
    color: rgba(243, 239, 230, 0.7);
  }

  /* ── Action footer ────────────────────────────────────────────────────── */
  .action-footer {
    flex-shrink: 0;
  }

  .charge-btn {
    width: 100%;
    background: var(--amber);
    color: #0d1117;
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.65rem 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 44px;
  }

  .charge-btn:hover:not(:disabled) {
    background: var(--amber-bright);
  }

  .charge-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .charge-btn.secondary {
    background: rgba(243, 239, 230, 0.06);
    color: rgba(243, 239, 230, 0.45);
    border: 1px solid rgba(243, 239, 230, 0.1);
  }

  .charge-btn.paid {
    background: rgba(52, 211, 153, 0.15);
    color: #6ee7b7;
    border: 1px solid rgba(52, 211, 153, 0.35);
  }

  .charge-btn.loading {
    background: rgba(229, 169, 59, 0.6);
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(13, 17, 23, 0.3);
    border-top-color: #0d1117;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ── PRECIOS TAB ──────────────────────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════════════════ */

  .precios-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .precios-title-tag {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
  }

  .precios-live-badge {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.25);
    padding: 0.15rem 0.4rem;
    border-radius: 20px;
  }

  .pulse-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #34d399;
    animation: blink-dot 1.2s ease-in-out infinite;
  }

  .precios-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-height: 0;
    max-height: 240px;
    overflow-y: auto;
  }

  .precios-list::-webkit-scrollbar {
    width: 4px;
  }

  .precios-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .fuel-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.07);
    border-radius: 7px;
    padding: 0.4rem 0.6rem;
    transition: all 0.3s ease;
  }

  .fuel-row.bestseller {
    border-color: rgba(229, 169, 59, 0.3);
    background: rgba(229, 169, 59, 0.06);
  }

  .fuel-row.diesel-row {
    border-color: rgba(248, 113, 113, 0.2);
  }

  .fuel-row.updated {
    border-color: rgba(52, 211, 153, 0.5);
    background: rgba(52, 211, 153, 0.08);
  }

  .fuel-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .fuel-name {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--paper);
  }

  .fuel-badges {
    display: flex;
    gap: 0.25rem;
  }

  .badge-bestseller {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    letter-spacing: 0.04em;
  }

  .badge-detraccion {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    color: #fca5a5;
    background: rgba(248, 113, 113, 0.12);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    letter-spacing: 0.03em;
  }

  .fuel-price-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.05rem;
  }

  .fuel-price {
    font-family: var(--font-mono);
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--paper);
  }

  .fuel-unit {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.45);
  }

  .precios-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    gap: 0.5rem;
  }

  .precios-hint {
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.4);
    margin: 0;
    font-style: italic;
  }

  .update-prices-btn {
    background: rgba(243, 239, 230, 0.07);
    border: 1px solid rgba(243, 239, 230, 0.15);
    color: rgba(243, 239, 230, 0.75);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    min-height: 30px;
  }

  .update-prices-btn:hover {
    background: rgba(52, 211, 153, 0.1);
    border-color: rgba(52, 211, 153, 0.3);
    color: #6ee7b7;
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ── FLOTA TAB ────────────────────────────────────────────────────────── */
  /* ═══════════════════════════════════════════════════════════════════════ */

  .flota-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .flota-title-tag {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
  }

  .flota-count {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.12);
    border: 1px solid rgba(229, 169, 59, 0.2);
    padding: 0.15rem 0.4rem;
    border-radius: 20px;
  }

  .empresa-chips {
    display: flex;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .empresa-chip {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.65);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.35rem 0.25rem;
    border-radius: 7px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 46px;
  }

  .empresa-chip:hover {
    background: rgba(243, 239, 230, 0.08);
    color: var(--paper);
  }

  .empresa-chip.active {
    background: rgba(229, 169, 59, 0.14);
    border-color: rgba(229, 169, 59, 0.4);
    color: var(--amber-bright);
  }

  .empresa-short {
    font-size: 0.62rem;
    font-weight: 700;
  }

  .empresa-type-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
  }

  .empresa-type-dot.diesel {
    background: #f87171;
  }

  .empresa-detail-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 10px;
    padding: 0.55rem 0.65rem;
    flex: 1;
  }

  .ed-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.4rem;
  }

  .ed-empresa {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--paper);
    margin: 0;
    line-height: 1.3;
  }

  .ed-ruc {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.5);
    margin: 0.1rem 0 0;
  }

  .ed-fuel-badge {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.12);
    border: 1px solid rgba(229, 169, 59, 0.25);
    padding: 0.12rem 0.4rem;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ed-fuel-badge.diesel-badge {
    color: #fca5a5;
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.25);
  }

  .saldo-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #0d1117;
    border: 1px solid rgba(243, 239, 230, 0.07);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
  }

  .saldo-label {
    font-size: 0.63rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .saldo-amount {
    font-family: var(--font-mono);
    font-size: 0.88rem;
    font-weight: 800;
    color: var(--paper);
  }

  /* ── Detracción panel ─────────────────────────────────────────────────── */
  .detrac-panel {
    background: rgba(248, 113, 113, 0.06);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 7px;
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .detrac-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .detrac-panel-title {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(248, 113, 113, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sunat-badge {
    font-family: var(--font-mono);
    font-size: 0.52rem;
    font-weight: 700;
    color: #fca5a5;
    background: rgba(248, 113, 113, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .detrac-calc-rows {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .detrac-calc-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.63rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .detrac-calc-row.highlight .detrac-neg {
    color: #fca5a5;
    font-weight: 700;
  }

  .detrac-calc-row.neto {
    border-top: 1px solid rgba(248, 113, 113, 0.2);
    padding-top: 0.15rem;
    margin-top: 0.05rem;
  }

  .neto-label {
    font-weight: 700;
    color: var(--paper);
  }

  .neto-amount {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--paper);
  }

  .no-detrac-pill {
    background: rgba(52, 211, 153, 0.07);
    border: 1px solid rgba(52, 211, 153, 0.2);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: #6ee7b7;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-spinner {
      animation: none;
    }
    .charge-btn {
      transition: none;
    }
    .charge-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
