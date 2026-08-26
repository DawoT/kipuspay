<script lang="ts">
  import PhoneMockFrame from './PhoneMockFrame.svelte';
  import { formatCents } from '$lib/brand/money';

  interface HourlyPoint {
    readonly hour: string;
    readonly amountCents: number;
  }

  interface StoreData {
    readonly id: string;
    readonly name: string;
    readonly revenueCents: number;
    readonly transactions: number;
    readonly growthPercent: number;
    readonly syncState: 'online' | 'synced' | 'pending';
    readonly cashCents: number;
    readonly digitalCents: number;
    readonly cardCents: number;
    readonly hourlySales: readonly HourlyPoint[];
    readonly recentSale: {
      readonly time: string;
      readonly doc: string;
      readonly amountCents: number;
      readonly method: string;
    };
  }

  const stores: readonly StoreData[] = [
    {
      id: 'all',
      name: 'Todos los locales',
      revenueCents: 485050,
      transactions: 142,
      growthPercent: 18.4,
      syncState: 'online',
      cashCents: 169750,
      digitalCents: 252250,
      cardCents: 63050,
      hourlySales: [
        { hour: '09:00', amountCents: 24500 },
        { hour: '11:00', amountCents: 58000 },
        { hour: '13:00', amountCents: 125000 },
        { hour: '15:00', amountCents: 72000 },
        { hour: '17:00', amountCents: 89550 },
        { hour: '19:00', amountCents: 116000 },
      ],
      recentSale: {
        time: 'Hace 1 min',
        doc: 'B001-00342',
        amountCents: 4850,
        method: 'Yape / Plin',
      },
    },
    {
      id: 'centro',
      name: 'Local Centro',
      revenueCents: 214000,
      transactions: 64,
      growthPercent: 14.2,
      syncState: 'online',
      cashCents: 74900,
      digitalCents: 111280,
      cardCents: 27820,
      hourlySales: [
        { hour: '09:00', amountCents: 11000 },
        { hour: '11:00', amountCents: 26000 },
        { hour: '13:00', amountCents: 59000 },
        { hour: '15:00', amountCents: 31000 },
        { hour: '17:00', amountCents: 39000 },
        { hour: '19:00', amountCents: 48000 },
      ],
      recentSale: {
        time: 'Hace 1 min',
        doc: 'B001-00342',
        amountCents: 4850,
        method: 'Yape',
      },
    },
    {
      id: 'san-isidro',
      name: 'Local San Isidro',
      revenueCents: 163050,
      transactions: 48,
      growthPercent: 22.8,
      syncState: 'online',
      cashCents: 48915,
      digitalCents: 89680,
      cardCents: 24455,
      hourlySales: [
        { hour: '09:00', amountCents: 8500 },
        { hour: '11:00', amountCents: 19500 },
        { hour: '13:00', amountCents: 42050 },
        { hour: '15:00', amountCents: 24500 },
        { hour: '17:00', amountCents: 31500 },
        { hour: '19:00', amountCents: 37000 },
      ],
      recentSale: {
        time: 'Hace 3 min',
        doc: 'B002-00189',
        amountCents: 3200,
        method: 'Tarjeta',
      },
    },
    {
      id: 'miraflores',
      name: 'Local Miraflores',
      revenueCents: 108000,
      transactions: 30,
      growthPercent: 12.5,
      syncState: 'synced',
      cashCents: 45935,
      digitalCents: 51290,
      cardCents: 10775,
      hourlySales: [
        { hour: '09:00', amountCents: 5000 },
        { hour: '11:00', amountCents: 12500 },
        { hour: '13:00', amountCents: 23950 },
        { hour: '15:00', amountCents: 16500 },
        { hour: '17:00', amountCents: 19050 },
        { hour: '19:00', amountCents: 31000 },
      ],
      recentSale: {
        time: 'Hace 8 min',
        doc: 'B003-00094',
        amountCents: 1550,
        method: 'Efectivo',
      },
    },
  ];

  let selectedStoreId = $state<string>('all');
  let selectedHour = $state<string | null>(null);
  const currentStore = $derived(
    stores.find((s) => s.id === selectedStoreId) ?? stores[0],
  );
  const maxHourlyCents = $derived(
    Math.max(...currentStore.hourlySales.map((h) => h.amountCents), 1),
  );

  let viewMode = $state<'interactive' | 'photo'>('interactive');
</script>

<div class="owner-mockup-container" data-testid="owner-mode-mock">
  <div class="view-switch" role="group" aria-label="Modo de visualización del Modo Dueño">
    <button
      type="button"
      class="switch-btn"
      class:active={viewMode === 'interactive'}
      onclick={() => (viewMode = 'interactive')}
    >
      Simulación en vivo
    </button>
    <button
      type="button"
      class="switch-btn"
      class:active={viewMode === 'photo'}
      onclick={() => (viewMode = 'photo')}
    >
      Fotografía del dispositivo
    </button>
  </div>

  {#if viewMode === 'interactive'}
    <PhoneMockFrame
      theme="dark"
      title="Modo Dueño · KipusPay"
      statusBadge="Cajas en línea · EN VIVO"
      statusTone="live"
      ariaLabel="Smartphone mostrando la aplicación Modo Dueño"
    >
      <div class="owner-screen">
        <div class="store-tabs" role="tablist" aria-label="Seleccionar local">
          {#each stores as st (st.id)}
            <button
              type="button"
              role="tab"
              aria-selected={selectedStoreId === st.id}
              class="store-tab-btn"
              class:active={selectedStoreId === st.id}
              onclick={() => (selectedStoreId = st.id)}
            >
              {st.name}
            </button>
          {/each}
        </div>

        <div class="revenue-hero-card">
          <p class="card-eyebrow">Ventas totales de hoy</p>
          <p class="card-amount tabular-nums">
            <span class="currency">S/</span>
            {formatCents(currentStore.revenueCents)}
          </p>
          <div class="growth-badge">
            <span class="growth-arrow" aria-hidden="true">↑</span>
            <span class="growth-text">+{currentStore.growthPercent}% vs ayer</span>
            <span class="tx-count">({currentStore.transactions} ventas)</span>
          </div>
        </div>

        <div class="hourly-rhythm-card">
          <div class="rhythm-header">
            <p class="section-micro-title">Ritmo de ventas por hora</p>
            <span class="rhythm-selected-amount tabular-nums">
              {#if selectedHour}
                {selectedHour}: S/ {formatCents(currentStore.hourlySales.find((h) => h.hour === selectedHour)?.amountCents ?? 0)}
              {:else}
                09:00 – 19:00
              {/if}
            </span>
          </div>
          <div class="hourly-chart" role="region" aria-label="Gráfico de ventas por hora">
            {#each currentStore.hourlySales as slot (slot.hour)}
              {@const heightPct = Math.max(16, Math.round((slot.amountCents / maxHourlyCents) * 100))}
              <button
                type="button"
                class="hourly-bar-btn"
                class:selected={selectedHour === slot.hour}
                onmouseenter={() => (selectedHour = slot.hour)}
                onmouseleave={() => (selectedHour = null)}
                onfocus={() => (selectedHour = slot.hour)}
                onblur={() => (selectedHour = null)}
                onclick={() => (selectedHour = selectedHour === slot.hour ? null : slot.hour)}
                aria-label={`Hora ${slot.hour}: S/ ${formatCents(slot.amountCents)}`}
              >
                <div class="bar-fill-track">
                  <div class="bar-fill" style="height: {heightPct}%;"></div>
                </div>
                <span class="bar-time">{slot.hour}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="payment-breakdown-card">
          <p class="section-micro-title">Desglose por medio de pago</p>
          <div class="breakdown-list">
            <div class="breakdown-row">
              <span class="method-name">Yape / Plin</span>
              <span class="method-amount tabular-nums">S/ {formatCents(currentStore.digitalCents)}</span>
            </div>
            <div class="breakdown-row">
              <span class="method-name">Efectivo en caja</span>
              <span class="method-amount tabular-nums">S/ {formatCents(currentStore.cashCents)}</span>
            </div>
            <div class="breakdown-row">
              <span class="method-name">Tarjetas de débito/crédito</span>
              <span class="method-amount tabular-nums">S/ {formatCents(currentStore.cardCents)}</span>
            </div>
          </div>
        </div>

        <div class="recent-activity-card">
          <p class="section-micro-title">Última venta registrada</p>
          <div class="activity-row">
            <div class="activity-info">
              <strong>{currentStore.recentSale.doc}</strong>
              <span>{currentStore.recentSale.method} · {currentStore.recentSale.time}</span>
            </div>
            <span class="activity-amount tabular-nums">
              +S/ {formatCents(currentStore.recentSale.amountCents)}
            </span>
          </div>
        </div>
      </div>
    </PhoneMockFrame>
  {:else}
    <div class="photo-mockup-wrap">
      <img
        src="/media/mockup-modo-dueno.jpg"
        alt="Mockup fotorealista en perspectiva de smartphone con la interfaz del Modo Dueño de KipusPay"
        class="photo-mockup-img"
        width="1000"
        height="667"
        loading="lazy"
      />
      <p class="photo-caption">
        Modo Dueño: métricas consolidadas de ventas, medios de pago y arqueo de turnos en tiempo real.
      </p>
    </div>
  {/if}
</div>

<style>
  .owner-mockup-container {
    width: 380px;
    max-width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .view-switch {
    display: inline-flex;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 3px;
    margin-bottom: 0.85rem;
  }

  .switch-btn {
    background: transparent;
    border: none;
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0.35rem 0.85rem;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .switch-btn.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 600;
  }

  .owner-screen {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    height: 100%;
    justify-content: space-between;
    overflow-y: auto;
    padding-right: 0.15rem;
  }

  .owner-screen::-webkit-scrollbar {
    width: 4px;
  }

  .owner-screen::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .store-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }

  .store-tabs::-webkit-scrollbar {
    display: none;
  }

  .store-tab-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
  }

  .store-tab-btn:hover {
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .store-tab-btn.active {
    background: rgba(229, 169, 59, 0.18);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 600;
  }

  .revenue-hero-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.3);
    border-radius: 10px;
    padding: 0.65rem 0.8rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .card-eyebrow {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
    margin: 0 0 0.15rem 0;
  }

  .card-amount {
    font-family: var(--font-mono);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--paper);
    margin: 0.05rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .card-amount .currency {
    font-size: 1rem;
    color: var(--amber-bright);
  }

  .growth-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(46, 158, 116, 0.15);
    border: 1px solid rgba(46, 158, 116, 0.3);
    color: #6ee7b7;
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 12px;
    margin-top: 0.25rem;
  }

  .tx-count {
    color: rgba(243, 239, 230, 0.6);
    font-weight: 400;
    margin-left: 0.2rem;
  }

  .hourly-rhythm-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
  }

  .rhythm-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.4rem;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .rhythm-selected-amount {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--amber-bright);
    font-weight: 600;
  }

  .hourly-chart {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.35rem;
    align-items: end;
    height: 52px;
    padding-top: 0.2rem;
  }

  .hourly-bar-btn {
    background: transparent;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    height: 100%;
    cursor: pointer;
    min-height: 44px;
  }

  .bar-fill-track {
    flex: 1;
    width: 100%;
    max-width: 14px;
    background: rgba(243, 239, 230, 0.06);
    border-radius: 3px;
    display: flex;
    align-items: end;
    overflow: hidden;
  }

  .bar-fill {
    width: 100%;
    background: var(--amber);
    border-radius: 3px 3px 0 0;
    transition: all 0.2s ease;
  }

  .hourly-bar-btn:hover .bar-fill,
  .hourly-bar-btn.selected .bar-fill {
    background: var(--amber-bright);
    box-shadow: 0 0 8px rgba(229, 169, 59, 0.5);
  }

  .bar-time {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .payment-breakdown-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
  }

  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-top: 0.35rem;
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
  }

  .method-name {
    color: rgba(243, 239, 230, 0.75);
  }

  .method-amount {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--paper);
  }

  .recent-activity-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
  }

  .activity-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.35rem;
  }

  .activity-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .activity-info strong {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--paper);
  }

  .activity-info span {
    font-size: 0.64rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .activity-amount {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: #6ee7b7;
  }

  .photo-mockup-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: mockCrossfade 250ms ease both;
  }

  .photo-mockup-img {
    width: 100%;
    max-width: 380px;
    height: auto;
    border-radius: 24px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }

  .photo-caption {
    font-size: 0.78rem;
    color: rgba(26, 29, 35, 0.7);
    text-align: center;
    margin-top: 0.65rem;
  }

  /* Invariants and accessibility */
  .smartphone-frame {
    border: 3.5px solid #333842;
    box-shadow:
      0 25px 60px -12px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    animation: mockCrossfade 250ms ease both;
  }

  @keyframes mockCrossfade {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .pulse-dot-live {
    width: 6px;
    height: 6px;
    background: #34d399;
    border-radius: 50%;
  }

  @keyframes livePulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.35); opacity: 0.45; }
  }

  @media (prefers-reduced-motion: reduce) {
    .smartphone-frame,
    .photo-mockup-wrap {
      animation: none;
    }
    .pulse-dot-live {
      animation: none;
    }
  }
</style>