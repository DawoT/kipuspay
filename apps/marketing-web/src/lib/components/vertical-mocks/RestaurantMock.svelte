<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  type RestaurantTab = 'comanda' | 'kds' | 'mapa';

  interface MenuItem {
    readonly id: string;
    readonly qty: number;
    readonly name: string;
    readonly amount_cents: number;
    readonly note?: string;
  }

  interface TableData {
    readonly id: string;
    readonly label: string;
    readonly items: readonly MenuItem[];
  }

  interface KDSTicket {
    readonly id: string;
    readonly code: string;
    readonly table: string;
    readonly items: readonly string[];
    readonly initialStatus: string;
    readonly time: string;
    readonly tone: 'prep' | 'queue' | 'served';
  }

  interface SalonTable {
    readonly id: string;
    readonly code: string;
    readonly status: string;
    readonly amount_cents?: number;
    readonly waiter: string;
    readonly tone: 'free' | 'occupied' | 'checkout' | 'reserved';
    readonly notes?: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<RestaurantTab>('comanda');

  const tables: readonly TableData[] = [
    {
      id: 'm04',
      label: 'Mesa 04',
      items: [
        { id: 'i1', qty: 1, name: 'Ceviche clásico de pescado', amount_cents: 3800, note: 'Ají suave' },
        { id: 'i2', qty: 1, name: 'Lomo saltado criollo', amount_cents: 4200, note: 'Término medio' },
        { id: 'i3', qty: 1, name: 'Jarra chicha morada 1L', amount_cents: 1600 },
      ],
    },
    {
      id: 'm08',
      label: 'Mesa 08',
      items: [
        { id: 'i4', qty: 2, name: 'Arroz con mariscos', amount_cents: 7600 },
        { id: 'i5', qty: 2, name: 'Limonada frozen 500ml', amount_cents: 1800 },
      ],
    },
    {
      id: 'm12',
      label: 'Mesa 12',
      items: [
        { id: 'i6', qty: 1, name: 'Causa limeña de pollo', amount_cents: 2400 },
        { id: 'i7', qty: 1, name: 'Seco de res con frijoles', amount_cents: 3900 },
      ],
    },
    {
      id: 'takeaway',
      label: 'Para Llevar',
      items: [
        { id: 'i8', qty: 1, name: 'Tacu tacu con lomo al jugo', amount_cents: 4400 },
        { id: 'i9', qty: 1, name: 'Maracuyá frozen 1L', amount_cents: 1500 },
      ],
    },
  ];

  let selectedTableId = $state<string>('m04');
  let splitMode = $state<'full' | 'split2'>('full');
  let isCharging = $state(false);
  let isPaid = $state(false);

  // KDS Cocina state
  let kds084Ready = $state(false);

  const kdsTickets: readonly KDSTicket[] = [
    {
      id: 'k1',
      code: '#CMD-084 · Mesa 04',
      table: 'Mesa 04',
      items: ['1x Ceviche clásico', '1x Lomo saltado'],
      initialStatus: 'En preparación',
      time: '8 min',
      tone: 'prep',
    },
    {
      id: 'k2',
      code: '#CMD-085 · Mesa 08',
      table: 'Mesa 08',
      items: ['2x Menú criollo'],
      initialStatus: 'En cola',
      time: '2 min',
      tone: 'queue',
    },
    {
      id: 'k3',
      code: '#CMD-082 · Mesa 12',
      table: 'Mesa 12',
      items: ['1x Tiradito'],
      initialStatus: 'Servido ✓',
      time: '14 min',
      tone: 'served',
    },
  ];

  // Mapa Salón state
  const salonTables: readonly SalonTable[] = [
    { id: 't1', code: 'M-01', status: 'Libre', waiter: 'Carlos M.', tone: 'free' },
    { id: 't2', code: 'M-02', status: 'Ocupada', amount_cents: 6500, waiter: 'Lucía R.', tone: 'occupied' },
    { id: 't3', code: 'M-03', status: 'Libre', waiter: 'Carlos M.', tone: 'free' },
    { id: 't4', code: 'M-04', status: 'Por cobrar', amount_cents: 9600, waiter: 'Carlos M.', tone: 'checkout' },
    { id: 't5', code: 'M-05', status: 'Reservada', waiter: 'Carlos M.', tone: 'reserved', notes: 'Reserva 14:00 · Mozo: Carlos M.' },
  ];

  let selectedSalonTableId = $state<string>('t4');
  const selectedSalonTable = $derived(
    salonTables.find((t) => t.id === selectedSalonTableId) ?? salonTables[3],
  );

  const activeTable = $derived(
    tables.find((t) => t.id === selectedTableId) ?? tables[0],
  );

  const total_cents = $derived(sumCents(activeTable.items.map((i) => i.amount_cents)));
  const split_cents = $derived(Math.round(total_cents / 2));
  const gravada_cents = $derived(Math.round(total_cents / 1.18));
  const igv_cents = $derived(total_cents - gravada_cents);

  function handleSelectTable(tableId: string) {
    selectedTableId = tableId;
    isPaid = false;
    isCharging = false;
  }

  function handleCharge() {
    if (isCharging) return;
    if (isPaid) {
      isPaid = false;
      return;
    }
    isCharging = true;
    setTimeout(() => {
      isCharging = false;
      isPaid = true;
    }, 600);
  }
</script>

<div class="vertical-mock-container" data-testid="restaurant-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Restaurante · KipusPay"
    statusBadge={activeTab === 'comanda'
      ? `${activeTable.label} · Salón`
      : activeTab === 'kds'
        ? 'KDS Cocina · En vivo'
        : 'Mapa Salón · En vivo'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de comandas, KDS cocina y mapa de salón para restaurante"
  >
    <div class="mock-screen">
      <!-- Main Mode Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de restaurante">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'comanda'}
          class="mock-nav-tab"
          class:active={activeTab === 'comanda'}
          onclick={() => (activeTab = 'comanda')}
        >
          [Comanda]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kds'}
          class="mock-nav-tab"
          class:active={activeTab === 'kds'}
          onclick={() => (activeTab = 'kds')}
        >
          [KDS Cocina]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mapa'}
          class="mock-nav-tab"
          class:active={activeTab === 'mapa'}
          onclick={() => (activeTab = 'mapa')}
        >
          [Mapa Salón]
        </button>
      </div>

      <!-- VISTA 1: COMANDA -->
      {#if activeTab === 'comanda'}
        <div class="tab-view-content" data-testid="restaurant-view-comanda">
          <!-- Table Selector -->
          <div class="table-tabs" role="tablist" aria-label="Seleccionar mesa o comanda rápida">
            {#each tables as table (table.id)}
              <button
                type="button"
                role="tab"
                aria-selected={selectedTableId === table.id}
                class="tab-chip"
                class:active={selectedTableId === table.id}
                onclick={() => handleSelectTable(table.id)}
              >
                {table.label}
              </button>
            {/each}
          </div>

          <!-- KDS Kitchen Status Banner -->
          <div class="kds-status-bar" class:paid={isPaid}>
            <div class="kds-indicator">
              <span class="kds-dot" aria-hidden="true"></span>
              <span class="kds-label">
                {#if isPaid}
                  Mesa cerrada · Pedido despachado ✓
                {:else}
                  Cocina: En preparación ✓
                {/if}
              </span>
            </div>
            <span class="kds-ticket">Comanda #CMD-084</span>
          </div>

          <!-- Order Items List -->
          <div class="order-scroll-area">
            <p class="section-micro-title">Consumo de comanda</p>
            <ul class="order-items-list">
              {#each activeTable.items as item (item.id)}
                <li class="item-card">
                  <div class="item-main">
                    <span class="item-qty">{item.qty}x</span>
                    <div class="item-info">
                      <span class="item-name">{item.name}</span>
                      {#if item.note}
                        <span class="item-note">Nota: {item.note}</span>
                      {/if}
                    </div>
                  </div>
                  <span class="item-amount tabular-nums">S/ {formatCents(item.amount_cents)}</span>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Split Bill Selector -->
          <div class="split-card">
            <div class="split-header">
              <span class="split-title">División de cuenta</span>
              {#if splitMode === 'split2'}
                <span class="split-badge">2 partes iguales</span>
              {/if}
            </div>
            <div class="split-controls" role="group" aria-label="Modo de pago de la cuenta">
              <button
                type="button"
                class="split-toggle-btn"
                class:active={splitMode === 'full'}
                onclick={() => (splitMode = 'full')}
              >
                Cuenta completa
              </button>
              <button
                type="button"
                class="split-toggle-btn"
                class:active={splitMode === 'split2'}
                onclick={() => (splitMode = 'split2')}
              >
                Dividir entre 2 (S/ {formatCents(split_cents)} c/u)
              </button>
            </div>
          </div>

          <!-- Totals Breakdown -->
          <div class="total-summary-card">
            <div class="tax-row">
              <span>Op. Gravada: S/ {formatCents(gravada_cents)}</span>
              <span>I.G.V. (18%): S/ {formatCents(igv_cents)}</span>
            </div>
            <div class="main-total-row">
              <span class="main-total-label">
                {splitMode === 'split2' ? 'COBRAR 1/2 CUENTA' : 'TOTAL COMANDA'}
              </span>
              <span class="main-total-amount tabular-nums">
                <span class="cur">S/</span>
                {formatCents(splitMode === 'split2' ? split_cents : total_cents)}
              </span>
            </div>
            {#if splitMode === 'split2'}
              <p class="split-hint">
                Cobro por comensal: 2 pagos de S/ {formatCents(split_cents)} con comprobante individual.
              </p>
            {/if}
          </div>

          <!-- Action Button -->
          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              class:paid={isPaid}
              data-testid="restaurant-charge-btn"
              onclick={handleCharge}
              disabled={isCharging}
            >
              {#if isCharging}
                <span class="btn-spinner" aria-hidden="true"></span>
                <span>Procesando pago de mesa…</span>
              {:else if isPaid}
                <span>Mesa cobrada y liberada ✓</span>
              {:else if splitMode === 'split2'}
                <span>Cobrar fracción S/ {formatCents(split_cents)}</span>
              {:else}
                <span>Cobrar Mesa S/ {formatCents(total_cents)}</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 2: KDS COCINA -->
      {:else if activeTab === 'kds'}
        <div class="tab-view-content" data-testid="restaurant-view-kds">
          <div class="kds-header-bar">
            <span class="kds-title-tag">Pantalla KDS Cocina</span>
            <span class="kds-live-count">3 Pedidos activos</span>
          </div>

          <div class="kds-tickets-scroll">
            <!-- Ticket 1: CMD-084 -->
            <div class="kds-card" class:ready={kds084Ready}>
              <div class="kds-card-top">
                <strong class="kds-code">#CMD-084 · Mesa 04</strong>
                <span class="kds-timer">8 min</span>
              </div>
              <ul class="kds-items">
                <li>1x Ceviche clásico</li>
                <li>1x Lomo saltado</li>
              </ul>
              <div class="kds-card-footer">
                <span class="kds-state-pill" class:ready={kds084Ready}>
                  {kds084Ready ? 'Listo para servir ✓' : 'En preparación'}
                </span>
                <button
                  type="button"
                  class="kds-action-btn"
                  class:done={kds084Ready}
                  onclick={() => (kds084Ready = !kds084Ready)}
                >
                  {kds084Ready ? 'Listo para servir ✓' : 'Marcar: Listo para servir ✓'}
                </button>
              </div>
            </div>

            <!-- Ticket 2: CMD-085 -->
            <div class="kds-card">
              <div class="kds-card-top">
                <strong class="kds-code">#CMD-085 · Mesa 08</strong>
                <span class="kds-timer">2 min</span>
              </div>
              <ul class="kds-items">
                <li>2x Menú criollo</li>
              </ul>
              <div class="kds-card-footer">
                <span class="kds-state-pill queue">En cola</span>
                <span class="kds-hint">Tiempo: 2 min</span>
              </div>
            </div>

            <!-- Ticket 3: CMD-082 -->
            <div class="kds-card served">
              <div class="kds-card-top">
                <strong class="kds-code">#CMD-082 · Mesa 12</strong>
                <span class="kds-timer served">Servido ✓</span>
              </div>
              <ul class="kds-items">
                <li>1x Tiradito</li>
              </ul>
              <div class="kds-card-footer">
                <span class="kds-state-pill served">Servido ✓</span>
                <span class="kds-hint">Comanda despachada</span>
              </div>
            </div>
          </div>

          <div class="kds-footer-summary">
            <span>Sincronización continua de cocina y salón sin papel</span>
          </div>
        </div>

      <!-- VISTA 3: MAPA SALÓN -->
      {:else if activeTab === 'mapa'}
        <div class="tab-view-content" data-testid="restaurant-view-mapa">
          <div class="mapa-header-bar">
            <span class="mapa-title-tag">Plano del Salón Principal</span>
            <span class="mapa-live-stat">5 Mesas activas</span>
          </div>

          <!-- Mesas Grid -->
          <div class="salon-grid" role="group" aria-label="Plano de mesas del restaurante">
            {#each salonTables as t (t.id)}
              <button
                type="button"
                class="salon-table-card tone-{t.tone}"
                class:active={selectedSalonTableId === t.id}
                onclick={() => (selectedSalonTableId = t.id)}
              >
                <div class="st-top">
                  <strong class="st-code">{t.code}</strong>
                  <span class="st-dot" aria-hidden="true"></span>
                </div>
                <span class="st-status">
                  {#if t.code === 'M-01'}
                    M-01 (Libre)
                  {:else if t.code === 'M-02'}
                    M-02 (Ocupada · S/ 65.00)
                  {:else if t.code === 'M-03'}
                    M-03 (Libre)
                  {:else if t.code === 'M-04'}
                    M-04 (Por cobrar · S/ 96.00)
                  {:else if t.code === 'M-05'}
                    M-05 (Reservada)
                  {:else}
                    {t.code} ({t.status})
                  {/if}
                </span>
              </button>
            {/each}
          </div>

          <!-- Selected Table Info Card -->
          <div class="selected-table-detail">
            <div class="std-header">
              <span class="std-table-name">Detalle: {selectedSalonTable.code}</span>
              <span class="std-badge tone-{selectedSalonTable.tone}">{selectedSalonTable.status}</span>
            </div>
            <div class="std-row">
              <span class="std-label">Mozo asignado:</span>
              <strong class="std-val">Mozo: {selectedSalonTable.waiter}</strong>
            </div>
            {#if selectedSalonTable.amount_cents}
              <div class="std-row">
                <span class="std-label">Consumo acumulado:</span>
                <strong class="std-amount tabular-nums">S/ {formatCents(selectedSalonTable.amount_cents)}</strong>
              </div>
            {/if}
            {#if selectedSalonTable.notes}
              <div class="std-row">
                <span class="std-label">Notas:</span>
                <span class="std-note">{selectedSalonTable.notes}</span>
              </div>
            {/if}
          </div>

          <div class="action-footer">
            <button
              type="button"
              class="charge-btn"
              onclick={() => {
                if (selectedSalonTable.code === 'M-04') {
                  selectedTableId = 'm04';
                  activeTab = 'comanda';
                } else if (selectedSalonTable.code === 'M-08' || selectedSalonTable.code === 'M-02') {
                  selectedTableId = 'm08';
                  activeTab = 'comanda';
                } else {
                  selectedTableId = 'm04';
                  activeTab = 'comanda';
                }
              }}
            >
              <span>Abrir Comanda de {selectedSalonTable.code}</span>
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
    justify-content: space-between;
    height: 100%;
    gap: 0.35rem;
    padding: 0.1rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* Mock Navigation Tabs */
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
    font-size: 0.64rem;
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
    justify-content: space-between;
    flex: 1;
    min-height: 0;
    gap: 0.35rem;
  }

  /* Table selector tabs */
  .table-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .table-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab-chip {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 32px;
  }

  .tab-chip:hover {
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .tab-chip.active {
    background: rgba(229, 169, 59, 0.2);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  /* KDS Status Bar */
  .kds-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(46, 158, 116, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.25);
    border-radius: 8px;
    padding: 0.3rem 0.6rem;
    font-size: 0.66rem;
    flex-shrink: 0;
  }

  .kds-status-bar.paid {
    background: rgba(52, 211, 153, 0.2);
    border-color: rgba(52, 211, 153, 0.4);
  }

  .kds-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .kds-dot {
    width: 6px;
    height: 6px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 6px #34d399;
  }

  .kds-label {
    font-family: var(--font-sans);
    font-weight: 700;
    color: #6ee7b7;
  }

  .kds-ticket {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: rgba(243, 239, 230, 0.6);
  }

  /* Order items */
  .order-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 0;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .order-items-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 125px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-right: 0.15rem;
  }

  .order-items-list::-webkit-scrollbar {
    width: 4px;
  }

  .order-items-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .item-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .item-qty {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.72rem;
    color: var(--amber-bright);
    min-width: 1.4rem;
  }

  .item-info {
    display: flex;
    flex-direction: column;
  }

  .item-name {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--paper);
  }

  .item-note {
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.5);
    font-style: italic;
  }

  .item-amount {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--paper);
  }

  /* Split card */
  .split-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .split-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .split-title {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.6);
  }

  .split-badge {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    background: rgba(229, 169, 59, 0.15);
    color: var(--amber-bright);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
  }

  .split-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .split-toggle-btn {
    background: rgba(243, 239, 230, 0.05);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-sans);
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.3rem 0.2rem;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 32px;
    text-align: center;
  }

  .split-toggle-btn.active {
    background: rgba(229, 169, 59, 0.22);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  /* Totals Breakdown */
  .total-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.4rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .tax-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .main-total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 0.1rem;
    border-top: 1px solid rgba(243, 239, 230, 0.1);
  }

  .main-total-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--paper);
  }

  .main-total-amount {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .main-total-amount .cur {
    font-size: 0.85rem;
  }

  .split-hint {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.54rem;
    color: #6ee7b7;
    text-align: center;
  }

  /* Action button */
  .action-footer {
    margin-top: 0.1rem;
    flex-shrink: 0;
  }

  .charge-btn {
    width: 100%;
    min-height: 44px;
    background: linear-gradient(180deg, var(--amber-bright) 0%, var(--amber) 100%);
    color: var(--ink);
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    box-shadow: 0 4px 14px rgba(217, 154, 61, 0.35);
  }

  .charge-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(238, 183, 101, 0.45);
  }

  .charge-btn.paid {
    background: #0f6b4c;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(15, 107, 76, 0.35);
  }

  .charge-btn:disabled {
    opacity: 0.85;
    cursor: wait;
  }

  .btn-spinner {
    width: 13px;
    height: 13px;
    border: 2px solid rgba(20, 22, 28, 0.3);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* KDS VIEW SPECIFICS */
  .kds-header-bar, .mapa-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0.1rem;
    flex-shrink: 0;
  }

  .kds-title-tag, .mapa-title-tag {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--amber-bright);
  }

  .kds-live-count, .mapa-live-stat {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .kds-tickets-scroll {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 380px;
    overflow-y: auto;
    padding-right: 0.15rem;
    flex: 1;
  }

  .kds-tickets-scroll::-webkit-scrollbar {
    width: 4px;
  }

  .kds-tickets-scroll::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .kds-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-left: 3.5px solid var(--amber);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    transition: all 0.2s ease;
  }

  .kds-card.ready {
    border-left-color: #34d399;
    background: #101815;
  }

  .kds-card.served {
    border-left-color: rgba(243, 239, 230, 0.3);
    opacity: 0.8;
  }

  .kds-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .kds-code {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--paper);
  }

  .kds-timer {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
  }

  .kds-timer.served {
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.15);
  }

  .kds-items {
    list-style: disc inside;
    margin: 0;
    padding: 0;
    font-size: 0.68rem;
    color: rgba(243, 239, 230, 0.85);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .kds-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.25rem;
    border-top: 1px dashed rgba(243, 239, 230, 0.08);
  }

  .kds-state-pill {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .kds-state-pill.ready, .kds-state-pill.served {
    color: #34d399;
  }

  .kds-state-pill.queue {
    color: rgba(243, 239, 230, 0.6);
  }

  .kds-action-btn {
    background: rgba(52, 211, 153, 0.18);
    border: 1px solid rgba(52, 211, 153, 0.35);
    color: #34d399;
    font-family: var(--font-sans);
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 32px;
  }

  .kds-action-btn:hover {
    background: rgba(52, 211, 153, 0.28);
  }

  .kds-action-btn.done {
    background: #0f6b4c;
    color: #ffffff;
  }

  .kds-hint {
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .kds-footer-summary {
    background: #10131a;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    flex-shrink: 0;
  }

  /* MAPA SALÓN VIEW SPECIFICS */
  .salon-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
    max-height: 250px;
    overflow-y: auto;
    padding-right: 0.15rem;
    flex: 1;
  }

  .salon-grid::-webkit-scrollbar {
    width: 4px;
  }

  .salon-grid::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .salon-table-card {
    background: #141820;
    border: 1.5px solid rgba(243, 239, 230, 0.1);
    border-radius: 8px;
    padding: 0.45rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 48px;
  }

  .salon-table-card:hover {
    border-color: rgba(229, 169, 59, 0.4);
    background: #181d26;
  }

  .salon-table-card.active {
    border-color: var(--amber);
    background: rgba(229, 169, 59, 0.15);
    box-shadow: 0 0 10px rgba(229, 169, 59, 0.2);
  }

  .salon-table-card.tone-free .st-dot {
    background: #34d399;
    box-shadow: 0 0 6px #34d399;
  }

  .salon-table-card.tone-occupied .st-dot {
    background: #38bdf8;
    box-shadow: 0 0 6px #38bdf8;
  }

  .salon-table-card.tone-checkout .st-dot {
    background: var(--amber-bright);
    box-shadow: 0 0 6px var(--amber-bright);
  }

  .salon-table-card.tone-reserved .st-dot {
    background: #c084fc;
    box-shadow: 0 0 6px #c084fc;
  }

  .st-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .st-code {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--paper);
  }

  .st-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .st-status {
    font-size: 0.6rem;
    color: rgba(243, 239, 230, 0.75);
    line-height: 1.2;
  }

  .selected-table-detail {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .std-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.15rem;
  }

  .std-table-name {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .std-badge {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    padding: 0.05rem 0.35rem;
    border-radius: 4px;
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .std-badge.tone-checkout {
    background: rgba(229, 169, 59, 0.2);
    color: var(--amber-bright);
  }

  .std-badge.tone-occupied {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  .std-badge.tone-free {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .std-badge.tone-reserved {
    background: rgba(192, 132, 252, 0.2);
    color: #c084fc;
  }

  .std-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
  }

  .std-label {
    color: rgba(243, 239, 230, 0.6);
  }

  .std-val {
    color: var(--paper);
    font-weight: 600;
  }

  .std-amount {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .std-note {
    font-size: 0.58rem;
    color: #c084fc;
    font-style: italic;
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
