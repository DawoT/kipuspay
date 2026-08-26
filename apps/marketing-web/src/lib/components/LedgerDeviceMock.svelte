<script lang="ts">
  import PhoneMockFrame from './PhoneMockFrame.svelte';
  import { formatCents } from '$lib/brand/money';

  interface AccountingEntry {
    readonly id: string;
    readonly time: string;
    readonly title: string;
    readonly amount_cents: number;
    readonly status: string;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'light' }: Props = $props();

  const totals = {
    cash_cents: 145000,
    digital_cents: 182000,
    card_cents: 98000,
    total_cents: 445000,
  };

  const entries: readonly AccountingEntry[] = [
    {
      id: 'e1',
      time: '08:00',
      title: 'Apertura de caja',
      amount_cents: 20000,
      status: 'Cuadrado ✓',
    },
    {
      id: 'e2',
      time: '13:30',
      title: 'Corte de turno mañana',
      amount_cents: 164000,
      status: 'Registrado ✓',
    },
    {
      id: 'e3',
      time: '17:45',
      title: 'Arqueo parcial turno tarde',
      amount_cents: 185000,
      status: 'Registrado ✓',
    },
    {
      id: 'e4',
      time: '21:00',
      title: 'Cierre Z y conciliación',
      amount_cents: 445000,
      status: 'Conciliado sol a sol ✓',
    },
  ];

  let isVerifying = $state(false);
  let isVerified = $state(false);

  function verifyBalance() {
    if (isVerifying) return;
    if (isVerified) {
      isVerified = false;
      return;
    }
    isVerifying = true;
    setTimeout(() => {
      isVerifying = false;
      isVerified = true;
    }, 600);
  }
</script>

<div class="ledger-device-container" data-testid="ledger-device-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    title="Control Diario · KipusPay"
    statusBadge={isVerified ? 'Caja cuadrada · 100%' : 'Turno cerrado · Pendiente'}
    statusTone={isVerified ? 'live' : 'sync'}
    ariaLabel="Smartphone mostrando conciliación y arqueo de caja"
  >
    <div class="ledger-screen">
      <div class="total-balance-card">
        <span class="balance-label">Total conciliado del día</span>
        <span class="balance-amount">S/ {formatCents(totals.total_cents)}</span>
        <span class="balance-sub">Sin diferencias registradas sol a sol</span>
      </div>

      <div class="breakdown-grid">
        <div class="breakdown-cell">
          <span class="cell-label">Efectivo</span>
          <span class="cell-val">S/ {formatCents(totals.cash_cents)}</span>
        </div>
        <div class="breakdown-cell">
          <span class="cell-label">Yape / Plin</span>
          <span class="cell-val">S/ {formatCents(totals.digital_cents)}</span>
        </div>
        <div class="breakdown-cell">
          <span class="cell-label">Tarjetas</span>
          <span class="cell-val">S/ {formatCents(totals.card_cents)}</span>
        </div>
      </div>

      <div class="records-scroll-area">
        <p class="scroll-micro-title">Historial cronológico de caja</p>
        <ul class="records-list">
          {#each entries as entry (entry.id)}
            <li class="record-item">
              <div class="record-header">
                <span class="record-time">{entry.time}</span>
                <span class="record-status">{entry.status}</span>
              </div>
              <div class="record-body">
                <span class="record-title">{entry.title}</span>
                <span class="record-amount">S/ {formatCents(entry.amount_cents)}</span>
              </div>
            </li>
          {/each}
        </ul>
      </div>

      <div class="verify-action-wrap">
        {#if isVerified}
          <div class="verification-banner">
            <span class="verify-icon" aria-hidden="true">✓</span>
            <div class="verify-text">
              <strong>Caja 100% cuadrada sin diferencias</strong>
              <span>Arqueo físico concilia exactamente con el total digital.</span>
            </div>
          </div>
        {/if}

        <button
          type="button"
          class="verify-btn"
          class:active={isVerified}
          onclick={verifyBalance}
          disabled={isVerifying}
        >
          {#if isVerifying}
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Verificando conciliación…</span>
          {:else if isVerified}
            <span>✓ Balance verificado (clic para reiniciar)</span>
          {:else}
            <span>Verificar balance de caja</span>
          {/if}
        </button>
      </div>
    </div>
  </PhoneMockFrame>
</div>

<style>
  .ledger-device-container {
    width: 380px;
    max-width: 100%;
    margin: 0 auto;
  }

  .ledger-screen {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    gap: 0.55rem;
    padding: 0.2rem 0;
    font-family: var(--font-sans);
  }

  .total-balance-card {
    background: #14161c;
    color: #ffffff;
    border-radius: 10px;
    padding: 0.65rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .theme-dark .total-balance-card {
    background: rgba(243, 239, 230, 0.06);
    border: 1px solid rgba(243, 239, 230, 0.12);
  }

  .balance-label {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.7);
  }

  .balance-amount {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--amber-bright);
  }

  .balance-sub {
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }

  .breakdown-cell {
    background: #f8fafc;
    border: 1px solid rgba(20, 22, 28, 0.08);
    border-radius: 6px;
    padding: 0.35rem 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .theme-dark .breakdown-cell {
    background: rgba(243, 239, 230, 0.04);
    border-color: rgba(243, 239, 230, 0.08);
  }

  .cell-label {
    font-family: var(--font-mono);
    font-size: 0.58rem;
    color: rgba(20, 22, 28, 0.6);
    text-transform: uppercase;
  }

  .theme-dark .cell-label {
    color: rgba(243, 239, 230, 0.6);
  }

  .cell-val {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ink);
  }

  .theme-dark .cell-val {
    color: var(--paper);
  }

  .records-scroll-area {
    margin-bottom: 0.15rem;
  }

  .scroll-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(20, 22, 28, 0.5);
    margin: 0 0 0.35rem 0;
  }

  .theme-dark .scroll-micro-title {
    color: rgba(243, 239, 230, 0.5);
  }

  .records-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 190px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-right: 0.2rem;
  }

  .records-list::-webkit-scrollbar {
    width: 4px;
  }

  .records-list::-webkit-scrollbar-thumb {
    background: rgba(20, 22, 28, 0.2);
    border-radius: 4px;
  }

  .theme-dark .records-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
  }

  .record-item {
    background: #ffffff;
    border: 1px solid rgba(20, 22, 28, 0.08);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .theme-dark .record-item {
    background: #141820;
    border-color: rgba(243, 239, 230, 0.08);
  }

  .record-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .record-time {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: rgba(20, 22, 28, 0.55);
  }

  .theme-dark .record-time {
    color: rgba(243, 239, 230, 0.55);
  }

  .record-status {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: #059669;
    font-weight: 600;
  }

  .theme-dark .record-status {
    color: #34d399;
  }

  .record-body {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .record-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--ink);
  }

  .theme-dark .record-title {
    color: var(--paper);
  }

  .record-amount {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink);
  }

  .theme-dark .record-amount {
    color: var(--paper);
  }

  .verify-action-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.2rem;
  }

  .verification-banner {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
  }

  .theme-dark .verification-banner {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .verify-icon {
    font-size: 0.85rem;
    color: #059669;
    font-weight: bold;
  }

  .verify-text {
    display: flex;
    flex-direction: column;
  }

  .verify-text strong {
    font-size: 0.72rem;
    color: #065f46;
  }

  .theme-dark .verify-text strong {
    color: #34d399;
  }

  .verify-text span {
    font-size: 0.62rem;
    color: #047857;
  }

  .theme-dark .verify-text span {
    color: #a7f3d0;
  }

  .verify-btn {
    width: 100%;
    min-height: 44px;
    background: #14161c;
    color: #ffffff;
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
  }

  .theme-dark .verify-btn {
    background: var(--amber);
    color: var(--ink);
  }

  .verify-btn:hover:not(:disabled) {
    background: #262a36;
    transform: translateY(-1px);
  }

  .theme-dark .verify-btn:hover:not(:disabled) {
    background: var(--amber-bright);
    box-shadow: 0 4px 16px rgba(217, 154, 61, 0.4);
  }

  .verify-btn.active {
    background: #059669;
    color: #ffffff;
  }

  .btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
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
    .verify-btn {
      transition: none;
    }
    .verify-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>