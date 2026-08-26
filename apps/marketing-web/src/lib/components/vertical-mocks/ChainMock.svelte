<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents } from '$lib/brand/money';

  type ChainTab = 'ventas' | 'transferencias' | 'ranking';

  interface BranchData {
    readonly id: string;
    readonly name: string;
    readonly revenue_cents: number;
    readonly txCount: number;
    readonly status: string;
    readonly growthText: string;
    readonly metaDailyCents: number;
    readonly metaPercent: number;
    readonly rank: number;
    readonly isWinner?: boolean;
  }

  interface TransferRequest {
    readonly id: string;
    readonly code: string;
    readonly from: string;
    readonly to: string;
    readonly items: string;
    readonly statusText: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  let activeTab = $state<ChainTab>('ventas');

  const branches: readonly BranchData[] = [
    {
      id: 'all',
      name: 'Todas las sedes',
      revenue_cents: 1245000,
      txCount: 384,
      status: '3 locales en línea',
      growthText: '+18.6% vs ayer',
      metaDailyCents: 1270000,
      metaPercent: 98,
      rank: 0,
    },
    {
      id: 'miraflores',
      name: 'Sede Miraflores',
      revenue_cents: 512000,
      txCount: 162,
      status: 'Caja 1 y 2 activas',
      growthText: '+21.4% vs ayer',
      metaDailyCents: 474000,
      metaPercent: 108,
      rank: 1,
      isWinner: true,
    },
    {
      id: 'san-isidro',
      name: 'Sede San Isidro',
      revenue_cents: 428000,
      txCount: 130,
      status: 'Caja 1 activa',
      growthText: '+14.2% vs ayer',
      metaDailyCents: 450000,
      metaPercent: 95,
      rank: 2,
    },
    {
      id: 'surco',
      name: 'Sede Surco',
      revenue_cents: 305000,
      txCount: 92,
      status: 'Caja 1 activa',
      growthText: '+16.8% vs ayer',
      metaDailyCents: 346000,
      metaPercent: 88,
      rank: 3,
    },
  ];

  let selectedBranchId = $state<string>('all');
  let isTransferring = $state(false);
  let isAuthorized = $state(false);

  // Transferencias state
  let isDespachando = $state(false);
  let transferDespachada = $state(false);

  // Ranking state
  let rankingReportExported = $state(false);

  const currentBranch = $derived(
    branches.find((b) => b.id === selectedBranchId) ?? branches[0],
  );

  const rankingBranches = $derived(
    branches.filter((b) => b.id !== 'all').sort((a, b) => a.rank - b.rank),
  );

  function handleTransfer() {
    if (isTransferring) return;
    if (isAuthorized) {
      isAuthorized = false;
      return;
    }
    isTransferring = true;
    setTimeout(() => {
      isTransferring = false;
      isAuthorized = true;
    }, 600);
  }

  function handleDespacharMercaderia() {
    if (isDespachando) return;
    if (transferDespachada) {
      transferDespachada = false;
      return;
    }
    isDespachando = true;
    setTimeout(() => {
      isDespachando = false;
      transferDespachada = true;
    }, 600);
  }

  function handleExportRanking() {
    rankingReportExported = true;
    setTimeout(() => {
      rankingReportExported = false;
    }, 2000);
  }
</script>

<div class="vertical-mock-container" data-testid="chain-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Modo Dueño Cadenas · KipusPay"
    statusBadge={activeTab === 'ventas'
      ? '3 Locales en vivo'
      : activeTab === 'transferencias'
        ? 'Stock Multi-Sede'
        : 'Ranking Metas 98%'}
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de Modo Dueño para cadenas, transferencias y ranking de locales"
  >
    <div class="mock-screen">
      <!-- Main Mode Tabs -->
      <div class="mock-nav-tabs" role="tablist" aria-label="Módulos de cadenas">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ventas'}
          class="mock-nav-tab"
          class:active={activeTab === 'ventas'}
          onclick={() => (activeTab = 'ventas')}
        >
          [Ventas Sedes]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'transferencias'}
          class="mock-nav-tab"
          class:active={activeTab === 'transferencias'}
          onclick={() => (activeTab = 'transferencias')}
        >
          [Transferencias]
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ranking'}
          class="mock-nav-tab"
          class:active={activeTab === 'ranking'}
          onclick={() => (activeTab = 'ranking')}
        >
          [Ranking Locales]
        </button>
      </div>

      <!-- VISTA 1: VENTAS SEDES -->
      {#if activeTab === 'ventas'}
        <div class="tab-view-content" data-testid="chain-view-ventas">
          <!-- Store Tabs Selector -->
          <div class="branch-tabs" role="tablist" aria-label="Seleccionar sede de la cadena">
            {#each branches as branch (branch.id)}
              <button
                type="button"
                role="tab"
                aria-selected={selectedBranchId === branch.id}
                class="branch-tab-btn"
                class:active={selectedBranchId === branch.id}
                onclick={() => (selectedBranchId = branch.id)}
              >
                {branch.name}
              </button>
            {/each}
          </div>

          <!-- Consolidated Revenue Hero -->
          <div class="revenue-hero-card">
            <div class="hero-top-row">
              <span class="hero-label">{currentBranch.name} · Ventas de hoy</span>
              <span class="live-tag">EN VIVO</span>
            </div>
            <p class="hero-amount tabular-nums">
              <span class="currency">S/</span>
              {formatCents(currentBranch.revenue_cents)}
            </p>
            <div class="hero-sub-stats">
              <span class="growth-text">{currentBranch.growthText}</span>
              <span class="tx-badge">{currentBranch.txCount} ventas · {currentBranch.status}</span>
            </div>
          </div>

          <!-- Multi-branch Summary Cards -->
          <div class="branches-breakdown-card">
            <p class="section-micro-title">Consolidado por sucursal</p>
            <div class="branch-rows-list">
              <div class="branch-row">
                <span class="b-name">Sede Miraflores</span>
                <span class="b-val tabular-nums">S/ {formatCents(512000)}</span>
              </div>
              <div class="branch-row">
                <span class="b-name">Sede San Isidro</span>
                <span class="b-val tabular-nums">S/ {formatCents(428000)}</span>
              </div>
              <div class="branch-row">
                <span class="b-name">Sede Surco</span>
                <span class="b-val tabular-nums">S/ {formatCents(305000)}</span>
              </div>
            </div>
          </div>

          <!-- Stock Transfer Module between stores -->
          <div class="transfer-module-card" class:authorized={isAuthorized}>
            <div class="transfer-header">
              <div class="transfer-id-box">
                <span class="transfer-icon" aria-hidden="true">⇄</span>
                <span class="transfer-code">Transferencia #TR-882: Central → Miraflores</span>
              </div>
              <span class="transfer-status-tag" class:ok={isAuthorized}>
                {isAuthorized ? 'AUTORIZADA' : 'PENDIENTE'}
              </span>
            </div>
            <div class="transfer-details">
              <strong class="transfer-items">25 unidades de Bebidas 500ml transferidas</strong>
              <span class="transfer-note">
                {#if isAuthorized}
                  ✓ Stock descontado de Central y recibido en Miraflores
                {:else}
                  En espera de aprobación del dueño para sincronizar stock
                {/if}
              </span>
            </div>
          </div>

          <!-- Action Button -->
          <div class="action-footer">
            <button
              type="button"
              class="transfer-btn"
              class:authorized={isAuthorized}
              data-testid="chain-transfer-btn"
              onclick={handleTransfer}
              disabled={isTransferring}
            >
              {#if isTransferring}
                <span class="btn-spinner" aria-hidden="true"></span>
                <span>Sincronizando inventario entre sedes…</span>
              {:else if isAuthorized}
                <span>Transferencia autorizada y sincronizada ✓</span>
              {:else}
                <span>Autorizar Transferencia #TR-882</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 2: TRANSFERENCIAS -->
      {:else if activeTab === 'transferencias'}
        <div class="tab-view-content" data-testid="chain-view-transferencias">
          <div class="xfer-header-bar">
            <span class="xfer-title-tag">Despacho y Recepción de Stock</span>
            <span class="xfer-live-count">2 En tránsito</span>
          </div>

          <div class="transfers-scroll-list">
            <!-- Solicitud 1: TR-882 -->
            <div class="xfer-ticket-card" class:done={transferDespachada}>
              <div class="xtc-top">
                <strong class="xtc-code">Solicitud #TR-882</strong>
                <span class="xtc-badge" class:done={transferDespachada}>
                  {transferDespachada ? 'DESPACHADA ✓' : 'PENDIENTE'}
                </span>
              </div>
              <div class="xtc-route">
                <span class="xtc-node">Sede Central</span>
                <span class="xtc-arrow" aria-hidden="true">→</span>
                <span class="xtc-node dest">Miraflores</span>
              </div>
              <p class="xtc-detail">25 unid. Bebidas</p>
              <span class="xtc-sub">
                {transferDespachada ? '✓ Mercadería despachada y en camino' : 'Listo para preparar despacho en almacén'}
              </span>
            </div>

            <!-- Solicitud 2: TR-883 -->
            <div class="xfer-ticket-card">
              <div class="xtc-top">
                <strong class="xtc-code">Solicitud #TR-883</strong>
                <span class="xtc-badge transit">EN TRÁNSITO</span>
              </div>
              <div class="xtc-route">
                <span class="xtc-node">Sede San Isidro</span>
                <span class="xtc-arrow" aria-hidden="true">→</span>
                <span class="xtc-node dest">Surco</span>
              </div>
              <p class="xtc-detail">10 unid. Insumos</p>
              <span class="xtc-sub">Conductor en ruta · Entrega estimada: 15 min</span>
            </div>
          </div>

          <div class="xfer-summary-card">
            <span>✓ Control total de mermas e ingresos entre almacén central y sucursales</span>
          </div>

          <!-- Action Button for Transfers -->
          <div class="action-footer">
            <button
              type="button"
              class="transfer-btn"
              class:authorized={transferDespachada}
              onclick={handleDespacharMercaderia}
              disabled={isDespachando}
            >
              {#if isDespachando}
                <span class="btn-spinner" aria-hidden="true"></span>
                <span>Procesando despacho de mercadería…</span>
              {:else if transferDespachada}
                <span>Mercadería despachada y sincronizada ✓</span>
              {:else}
                <span>Aprobar y despachar mercadería</span>
              {/if}
            </button>
          </div>
        </div>

      <!-- VISTA 3: RANKING LOCALES -->
      {:else if activeTab === 'ranking'}
        <div class="tab-view-content" data-testid="chain-view-ranking">
          <!-- Consolidated Hero Banner -->
          <div class="ranking-global-card">
            <div class="rg-top">
              <span class="rg-label">Total consolidado: S/ 12,450.00</span>
              <span class="rg-meta-tag">98% meta global</span>
            </div>
            <div class="rg-progress-bar">
              <div class="rg-progress-fill" style="width: 98%;"></div>
            </div>
            <div class="rg-sub-row">
              <span>Recaudación acumulada hoy</span>
              <strong class="tabular-nums">S/ {formatCents(1245000)}</strong>
            </div>
          </div>

          <!-- Ranking List -->
          <div class="ranking-scroll-list">
            <p class="section-micro-title">Tablero de metas y cumplimiento</p>
            <div class="ranking-cards">
              <!-- 1° Miraflores -->
              <div class="rank-item-card winner">
                <div class="ric-top">
                  <strong class="ric-name">1° Miraflores</strong>
                  <span class="ric-amount tabular-nums">S/ {formatCents(512000)}</span>
                </div>
                <div class="ric-meta-row">
                  <span class="ric-badge win">108% de la meta diaria 🏆</span>
                  <span class="ric-meta-cents">Meta: S/ 4,740.00</span>
                </div>
              </div>

              <!-- 2° San Isidro -->
              <div class="rank-item-card">
                <div class="ric-top">
                  <strong class="ric-name">2° San Isidro</strong>
                  <span class="ric-amount tabular-nums">S/ {formatCents(428000)}</span>
                </div>
                <div class="ric-meta-row">
                  <span class="ric-badge amber">95% de la meta diaria</span>
                  <span class="ric-meta-cents">Meta: S/ 4,500.00</span>
                </div>
              </div>

              <!-- 3° Surco -->
              <div class="rank-item-card">
                <div class="ric-top">
                  <strong class="ric-name">3° Surco</strong>
                  <span class="ric-amount tabular-nums">S/ {formatCents(305000)}</span>
                </div>
                <div class="ric-meta-row">
                  <span class="ric-badge">88% de la meta diaria</span>
                  <span class="ric-meta-cents">Meta: S/ 3,460.00</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Button for Ranking -->
          <div class="action-footer">
            <button
              type="button"
              class="transfer-btn"
              class:authorized={rankingReportExported}
              onclick={handleExportRanking}
            >
              {#if rankingReportExported}
                <span>Reporte de metas enviado al Modo Dueño ✓</span>
              {:else}
                <span>Exportar reporte de rendimiento diario</span>
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
    justify-content: space-between;
    height: 100%;
    gap: 0.35rem;
    padding: 0.1rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* Main Navigation Tabs */
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

  /* Branch Tabs */
  .branch-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .branch-tabs::-webkit-scrollbar {
    display: none;
  }

  .branch-tab-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 32px;
  }

  .branch-tab-btn:hover {
    background: rgba(243, 239, 230, 0.1);
    color: var(--paper);
  }

  .branch-tab-btn.active {
    background: rgba(229, 169, 59, 0.2);
    border-color: var(--amber);
    color: var(--amber-bright);
    font-weight: 700;
  }

  /* Hero Revenue Card */
  .revenue-hero-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.28);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    flex-shrink: 0;
  }

  .hero-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 0.1rem;
  }

  .hero-label {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
  }

  .live-tag {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    font-weight: 700;
    color: #34d399;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .hero-amount {
    font-family: var(--font-mono);
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--paper);
    margin: 0.05rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .hero-amount .currency {
    font-size: 0.95rem;
    color: var(--amber-bright);
  }

  .hero-sub-stats {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.58rem;
  }

  .growth-text {
    color: #6ee7b7;
    font-weight: 700;
  }

  .tx-badge {
    color: rgba(243, 239, 230, 0.6);
  }

  /* Branches Breakdown */
  .branches-breakdown-card {
    background: #12151c;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 7px;
    padding: 0.35rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .branch-rows-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.1rem;
    max-height: 80px;
    overflow-y: auto;
    padding-right: 0.15rem;
  }

  .branch-rows-list::-webkit-scrollbar {
    width: 4px;
  }

  .branch-rows-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .branch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.68rem;
  }

  .b-name {
    color: rgba(243, 239, 230, 0.75);
  }

  .b-val {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--paper);
  }

  /* Transfer Module */
  .transfer-module-card {
    background: #141820;
    border: 1px solid rgba(229, 169, 59, 0.2);
    border-radius: 7px;
    padding: 0.4rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    transition: all 0.3s ease;
    flex-shrink: 0;
  }

  .transfer-module-card.authorized {
    border-color: rgba(52, 211, 153, 0.35);
    background: #101915;
  }

  .transfer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .transfer-id-box {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .transfer-icon {
    font-size: 0.75rem;
    color: var(--amber-bright);
  }

  .transfer-code {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--paper);
  }

  .transfer-status-tag {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    font-weight: 700;
    background: rgba(229, 169, 59, 0.15);
    color: var(--amber-bright);
    padding: 0.08rem 0.3rem;
    border-radius: 3px;
  }

  .transfer-status-tag.ok {
    background: rgba(46, 158, 116, 0.2);
    color: #34d399;
  }

  .transfer-details {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .transfer-items {
    font-size: 0.68rem;
    color: var(--paper);
  }

  .transfer-note {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .transfer-module-card.authorized .transfer-note {
    color: #6ee7b7;
    font-family: var(--font-mono);
  }

  /* Action Button */
  .action-footer {
    margin-top: 0.1rem;
    flex-shrink: 0;
  }

  .transfer-btn {
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

  .transfer-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(238, 183, 101, 0.45);
  }

  .transfer-btn.authorized {
    background: #0f6b4c;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(15, 107, 76, 0.35);
  }

  .transfer-btn:disabled {
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

  /* TRANSFERENCIAS VIEW SPECIFICS */
  .xfer-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.2rem 0.1rem;
    flex-shrink: 0;
  }

  .xfer-title-tag {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--amber-bright);
  }

  .xfer-live-count {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(52, 211, 153, 0.25);
  }

  .transfers-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    max-height: 280px;
    overflow-y: auto;
  }

  .xfer-ticket-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.1);
    border-left: 3.5px solid var(--amber);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    transition: all 0.2s ease;
  }

  .xfer-ticket-card.done {
    border-left-color: #34d399;
    background: #101915;
  }

  .xtc-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .xtc-code {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--paper);
  }

  .xtc-badge {
    font-family: var(--font-mono);
    font-size: 0.54rem;
    font-weight: 700;
    color: var(--amber-bright);
    background: rgba(229, 169, 59, 0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
  }

  .xtc-badge.transit {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
  }

  .xtc-badge.done {
    color: #34d399;
    background: rgba(52, 211, 153, 0.15);
  }

  .xtc-route {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-mono);
    font-size: 0.64rem;
  }

  .xtc-node {
    color: rgba(243, 239, 230, 0.7);
  }

  .xtc-node.dest {
    color: var(--amber-bright);
    font-weight: 700;
  }

  .xtc-arrow {
    color: rgba(243, 239, 230, 0.4);
  }

  .xtc-detail {
    margin: 0;
    font-size: 0.7rem;
    color: var(--paper);
    font-weight: 600;
  }

  .xtc-sub {
    font-size: 0.56rem;
    color: rgba(243, 239, 230, 0.5);
  }

  .xfer-summary-card {
    background: #10131a;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.56rem;
    color: #6ee7b7;
    flex-shrink: 0;
  }

  /* RANKING LOCALES VIEW SPECIFICS */
  .ranking-global-card {
    background: linear-gradient(180deg, #161b24 0%, #10131a 100%);
    border: 1px solid rgba(229, 169, 59, 0.25);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .rg-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .rg-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--paper);
  }

  .rg-meta-tag {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    color: #6ee7b7;
    background: rgba(46, 158, 116, 0.18);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }

  .rg-progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(243, 239, 230, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .rg-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--amber) 0%, #34d399 100%);
    border-radius: 3px;
  }

  .rg-sub-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.58rem;
    color: rgba(243, 239, 230, 0.6);
    font-family: var(--font-mono);
  }

  .ranking-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    max-height: 250px;
    overflow-y: auto;
  }

  .ranking-cards {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .rank-item-card {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .rank-item-card.winner {
    border-color: rgba(229, 169, 59, 0.35);
    background: #171922;
  }

  .ric-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .ric-name {
    font-size: 0.72rem;
    color: var(--paper);
  }

  .ric-amount {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .ric-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.56rem;
  }

  .ric-badge {
    color: rgba(243, 239, 230, 0.6);
  }

  .ric-badge.win {
    color: #6ee7b7;
    font-weight: 700;
  }

  .ric-badge.amber {
    color: var(--amber-bright);
    font-weight: 600;
  }

  .ric-meta-cents {
    color: rgba(243, 239, 230, 0.45);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-spinner {
      animation: none;
    }
    .transfer-btn {
      transition: none;
    }
    .transfer-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
