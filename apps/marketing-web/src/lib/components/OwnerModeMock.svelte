<script lang="ts">
  import { formatCents } from '$lib/brand/money';

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
      recentSale: {
        time: 'Hace 3 min',
        doc: 'B002-00189',
        amountCents: 3200,
        method: 'Tarjeta',
      },
    },
    {
      id: 'norte',
      name: 'Local Norte',
      revenueCents: 108000,
      transactions: 30,
      growthPercent: 11.5,
      syncState: 'synced',
      cashCents: 45935,
      digitalCents: 51290,
      cardCents: 10775,
      recentSale: {
        time: 'Hace 8 min',
        doc: 'B003-00094',
        amountCents: 1550,
        method: 'Efectivo',
      },
    },
  ];

  let selectedStoreId = $state<string>('all');
  const currentStore = $derived(
    stores.find((s) => s.id === selectedStoreId) ?? stores[0],
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
    <div class="smartphone-frame" aria-label="Smartphone mostrando la aplicación Modo Dueño">
      <div class="phone-notch" aria-hidden="true">
        <span class="notch-camera"></span>
        <span class="notch-speaker"></span>
      </div>

      <div class="phone-status-bar" aria-hidden="true">
        <span class="phone-time">09:41</span>
        <div class="status-icons">
          <span class="icon-signal">●●●●</span>
          <span class="icon-wifi">WiFi</span>
          <span class="icon-battery">100%</span>
        </div>
      </div>

      <div class="phone-app-header">
        <div class="app-brand">
          <span class="brand-knot" aria-hidden="true">◆</span>
          <span class="brand-title">Modo Dueño · KipusPay</span>
        </div>
        <div class="sync-indicator">
          <span class="pulse-dot" aria-hidden="true"></span>
          <span class="sync-text">Cajas en línea</span>
        </div>
      </div>

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

      <div class="phone-home-indicator" aria-hidden="true"></div>
    </div>
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
    width: 100%;
    max-width: 420px;
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
    margin-bottom: 1.5rem;
  }

  .switch-btn {
    background: transparent;
    border: none;
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0.4rem 0.9rem;
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

  .smartphone-frame {
    width: 100%;
    background: #0d0f12;
    border: 3px solid #2d333b;
    border-radius: 36px;
    box-shadow:
      0 20px 40px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.05);
    padding: 1.25rem 1.25rem 1rem 1.25rem;
    color: var(--paper);
    position: relative;
    overflow: hidden;
  }

  .phone-notch {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .notch-speaker {
    width: 44px;
    height: 4px;
    background: #22272e;
    border-radius: 2px;
  }

  .notch-camera {
    width: 8px;
    height: 8px;
    background: #1c2128;
    border-radius: 50%;
  }

  .phone-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: rgba(243, 239, 230, 0.6);
    margin-bottom: 1rem;
    padding: 0 0.25rem;
  }

  .status-icons {
    display: flex;
    gap: 0.4rem;
    font-size: 0.65rem;
  }

  .phone-app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(243, 239, 230, 0.08);
  }

  .app-brand {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .brand-knot {
    color: var(--amber-bright);
    font-size: 0.85rem;
  }

  .brand-title {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .sync-indicator {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    background: #34d399;
    border-radius: 50%;
    box-shadow: 0 0 6px #34d399;
  }

  .sync-text {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: #6ee7b7;
  }

  .store-tabs {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
    scrollbar-width: none;
  }

  .store-tabs::-webkit-scrollbar {
    display: none;
  }

  .store-tab-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.1);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    white-space: nowrap;
    cursor: pointer;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .store-tab-btn.active {
    background: rgba(229, 169, 59, 0.2);
    border-color: var(--amber-bright);
    color: var(--paper);
    font-weight: 600;
  }

  .revenue-hero-card {
    background: linear-gradient(180deg, #181d24 0%, #12151a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 12px;
    padding: 1.1rem;
    margin-bottom: 1rem;
    text-align: center;
  }

  .card-eyebrow {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
    margin-bottom: 0.4rem;
  }

  .card-amount {
    font-family: var(--font-mono);
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--paper);
    margin-bottom: 0.5rem;
  }

  .currency {
    color: var(--amber-bright);
    font-size: 1.2rem;
  }

  .growth-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(52, 211, 153, 0.12);
    color: #6ee7b7;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
  }

  .tx-count {
    color: rgba(243, 239, 230, 0.6);
  }

  .payment-breakdown-card,
  .recent-activity-card {
    background: #14181f;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.85rem;
    margin-bottom: 0.85rem;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin-bottom: 0.6rem;
  }

  .breakdown-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .method-name {
    color: rgba(243, 239, 230, 0.8);
  }

  .method-amount {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--paper);
  }

  .activity-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .activity-info {
    display: flex;
    flex-direction: column;
  }

  .activity-info strong {
    color: var(--paper);
    font-family: var(--font-mono);
    font-size: 0.82rem;
  }

  .activity-info span {
    font-size: 0.7rem;
    color: rgba(243, 239, 230, 0.6);
  }

  .activity-amount {
    font-family: var(--font-mono);
    font-weight: 700;
    color: #6ee7b7;
  }

  .phone-home-indicator {
    width: 120px;
    height: 4px;
    background: rgba(243, 239, 230, 0.3);
    border-radius: 2px;
    margin: 0.75rem auto 0 auto;
  }

  .photo-mockup-wrap {
    width: 100%;
    text-align: center;
  }

  .photo-mockup-img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    border: 1px solid var(--line);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    display: block;
  }

  .photo-caption {
    font-size: 0.82rem;
    color: rgba(243, 239, 230, 0.7);
    margin-top: 0.75rem;
    line-height: 1.4;
  }

  /* ── Crossfade suave entre simulación y foto ──────────────── */
  .smartphone-frame,
  .photo-mockup-wrap {
    animation: mockCrossfade 250ms ease both;
  }

  @keyframes mockCrossfade {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .smartphone-frame,
    .photo-mockup-wrap {
      animation: none;
    }
  }
</style>
