<script lang="ts">
  import PhoneMockFrame from '../PhoneMockFrame.svelte';
  import { formatCents } from '$lib/brand/money';

  interface BranchData {
    readonly id: string;
    readonly name: string;
    readonly revenue_cents: number;
    readonly txCount: number;
    readonly status: string;
    readonly growthText: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  const branches: readonly BranchData[] = [
    {
      id: 'all',
      name: 'Todas las sedes',
      revenue_cents: 1245000,
      txCount: 384,
      status: '3 locales en línea',
      growthText: '+18.6% vs ayer',
    },
    {
      id: 'miraflores',
      name: 'Sede Miraflores',
      revenue_cents: 512000,
      txCount: 162,
      status: 'Caja 1 y 2 activas',
      growthText: '+21.4% vs ayer',
    },
    {
      id: 'san-isidro',
      name: 'Sede San Isidro',
      revenue_cents: 428000,
      txCount: 130,
      status: 'Caja 1 activa',
      growthText: '+14.2% vs ayer',
    },
    {
      id: 'surco',
      name: 'Sede Surco',
      revenue_cents: 305000,
      txCount: 92,
      status: 'Caja 1 activa',
      growthText: '+16.8% vs ayer',
    },
  ];

  let selectedBranchId = $state<string>('all');
  let isTransferring = $state(false);
  let isAuthorized = $state(false);

  const currentBranch = $derived(
    branches.find((b) => b.id === selectedBranchId) ?? branches[0],
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
</script>

<div class="vertical-mock-container" data-testid="chain-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Modo Dueño Cadenas · KipusPay"
    statusBadge="3 Locales en vivo"
    statusTone="live"
    ariaLabel="Smartphone mostrando interfaz interactiva de Modo Dueño para cadenas y transferencias multi-local"
  >
    <div class="mock-screen">
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
    gap: 0.45rem;
    padding: 0.15rem 0.05rem;
    font-family: var(--font-sans);
  }

  /* Branch Tabs */
  .branch-tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;
  }

  .branch-tabs::-webkit-scrollbar {
    display: none;
  }

  .branch-tab-btn {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
    color: rgba(243, 239, 230, 0.7);
    font-family: var(--font-mono);
    font-size: 0.64rem;
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
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
    border-radius: 10px;
    padding: 0.55rem 0.8rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .hero-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 0.15rem;
  }

  .hero-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
  }

  .live-tag {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    color: #34d399;
    background: rgba(46, 158, 116, 0.15);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }

  .hero-amount {
    font-family: var(--font-mono);
    font-size: 1.45rem;
    font-weight: 800;
    color: var(--paper);
    margin: 0.1rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .hero-amount .currency {
    font-size: 1rem;
    color: var(--amber-bright);
  }

  .hero-sub-stats {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.6rem;
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
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.55);
    margin: 0;
  }

  .branch-rows-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.15rem;
    max-height: 95px;
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
    font-size: 0.72rem;
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
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: all 0.3s ease;
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
    gap: 0.35rem;
  }

  .transfer-icon {
    font-size: 0.8rem;
    color: var(--amber-bright);
  }

  .transfer-code {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    color: var(--paper);
  }

  .transfer-status-tag {
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    background: rgba(229, 169, 59, 0.15);
    color: var(--amber-bright);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .transfer-status-tag.ok {
    background: rgba(46, 158, 116, 0.2);
    color: #34d399;
  }

  .transfer-details {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .transfer-items {
    font-size: 0.74rem;
    color: var(--paper);
  }

  .transfer-note {
    font-size: 0.6rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .transfer-module-card.authorized .transfer-note {
    color: #6ee7b7;
    font-family: var(--font-mono);
  }

  /* Action Button */
  .action-footer {
    margin-top: 0.15rem;
  }

  .transfer-btn {
    width: 100%;
    min-height: 44px;
    background: linear-gradient(180deg, var(--amber-bright) 0%, var(--amber) 100%);
    color: var(--ink);
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.85rem;
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
