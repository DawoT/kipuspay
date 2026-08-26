<script lang="ts">
  import { formatCents } from '$lib/brand/money';

  interface AccountingEntry {
    readonly id: string;
    readonly time: string;
    readonly title: string;
    readonly amount_cents: number;
    readonly status: string;
  }

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

<div class="ledger-mock-container" data-testid="ledger-device-mock" data-theme="light">
  <div class="tablet-frame" aria-label="Panel digital de arqueo de caja y cierre diario">
    <div class="quipu-cord-strip" aria-hidden="true">
      <span class="cord-knot"></span>
      <span class="cord-fiber"></span>
      <span class="cord-knot"></span>
    </div>

    <header class="tablet-header">
      <div class="header-main">
        <span class="header-badge">Libro Diario Digital</span>
        <h3 class="header-title">Cierre y Arqueo Diario · Local Principal · Turno Completo</h3>
      </div>
      <div class="live-status">
        <span class="status-dot" class:verified={isVerified} aria-hidden="true">●</span>
        <span class="status-label">{isVerified ? 'Conciliado' : 'Auditado'}</span>
      </div>
    </header>

    <div class="totals-grid" role="region" aria-label="Totales por medio de pago">
      <div class="total-card cash">
        <span class="card-label">Efectivo</span>
        <span class="card-amount tabular-nums">S/ {formatCents(totals.cash_cents)}</span>
      </div>
      <div class="total-card digital">
        <span class="card-label">Billeteras digitales</span>
        <span class="card-amount tabular-nums">S/ {formatCents(totals.digital_cents)}</span>
      </div>
      <div class="total-card card">
        <span class="card-label">Tarjetas</span>
        <span class="card-amount tabular-nums">S/ {formatCents(totals.card_cents)}</span>
      </div>
      <div class="total-card sum">
        <span class="card-label">Total consolidado</span>
        <span class="card-amount sum-amount tabular-nums">S/ {formatCents(totals.total_cents)}</span>
      </div>
    </div>

    <div class="records-section">
      <div class="records-header">
        <span class="records-title">Registros contables del día</span>
        <span class="records-count">4 movimientos</span>
      </div>
      <ul class="records-list" aria-label="Lista de registros contables">
        {#each entries as entry (entry.id)}
          <li class="record-item" class:verified={isVerified}>
            <div class="record-info">
              <span class="record-time">{entry.time}</span>
              <strong class="record-name">{entry.title}</strong>
            </div>
            <div class="record-meta">
              <span class="record-amount tabular-nums">S/ {formatCents(entry.amount_cents)}</span>
              <span class="record-badge" class:reconciled={entry.id === 'e4'}>
                {entry.status}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </div>

    {#if isVerified}
      <div class="verification-banner" role="status">
        <span class="banner-icon" aria-hidden="true">✓</span>
        <div class="banner-text">
          <strong>Caja 100% cuadrada sin diferencias</strong>
          <span>Todos los cobros coinciden exactamente con los comprobantes y medios de pago.</span>
        </div>
      </div>
    {/if}

    <div class="action-footer">
      <button
        type="button"
        class="verify-btn"
        class:verified={isVerified}
        onclick={verifyBalance}
        disabled={isVerifying}
        aria-label="Verificar balance y cuadre de caja"
      >
        {#if isVerifying}
          <span class="btn-spinner" aria-hidden="true"></span> Verificando balance…
        {:else if isVerified}
          Caja 100% cuadrada sin diferencias (Reiniciar)
        {:else}
          Verificar balance
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .ledger-mock-container {
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }

  .tablet-frame {
    background: #ffffff;
    border: 1px solid rgba(26, 29, 35, 0.12);
    border-radius: 16px;
    box-shadow:
      0 24px 50px -12px rgba(0, 0, 0, 0.5),
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    padding: 1rem 1.15rem 1.1rem 1.15rem;
    color: var(--ink);
    position: relative;
    overflow: hidden;
  }

  .quipu-cord-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 0.75rem;
  }

  .cord-knot {
    width: 7px;
    height: 7px;
    background: var(--amber, #d99a3d);
    border-radius: 50%;
  }

  .cord-fiber {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, var(--amber) 0%, rgba(217, 154, 61, 0.2) 100%);
  }

  .tablet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(26, 29, 35, 0.08);
    margin-bottom: 0.85rem;
  }

  .header-badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted-ink);
    margin-bottom: 0.2rem;
  }

  .header-title {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.88rem;
    font-weight: 700;
    line-height: 1.35;
    color: var(--ink);
  }

  .live-status {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #f1f5f9;
    padding: 0.2rem 0.55rem;
    border-radius: 12px;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  .status-dot {
    color: var(--amber);
    font-size: 0.7rem;
  }

  .status-dot.verified {
    color: var(--sello);
  }

  .status-label {
    color: var(--ink);
    font-weight: 600;
  }

  .totals-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
    margin-bottom: 0.85rem;
  }

  .total-card {
    background: #f8fafc;
    border: 1px solid rgba(26, 29, 35, 0.08);
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .total-card.sum {
    grid-column: span 2;
    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
    border-color: rgba(26, 29, 35, 0.15);
  }

  .card-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-ink);
  }

  .card-amount {
    font-family: var(--font-mono);
    font-size: 0.96rem;
    font-weight: 700;
    color: var(--ink);
  }

  .sum-amount {
    font-size: 1.18rem;
    color: var(--ink);
  }

  .records-section {
    margin-bottom: 0.85rem;
  }

  .records-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.45rem;
  }

  .records-title {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted-ink);
  }

  .records-count {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--muted-ink);
  }

  .records-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 190px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(26, 29, 35, 0.2) transparent;
  }

  .records-list::-webkit-scrollbar {
    width: 4px;
  }

  .records-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .records-list::-webkit-scrollbar-thumb {
    background: rgba(26, 29, 35, 0.2);
    border-radius: 4px;
  }

  .record-item {
    background: #ffffff;
    border: 1px solid rgba(26, 29, 35, 0.08);
    border-radius: 6px;
    padding: 0.45rem 0.65rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .record-item.verified {
    border-color: rgba(15, 107, 76, 0.2);
    background: #fbfdfc;
  }

  .record-info {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }

  .record-time {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--muted-ink);
  }

  .record-name {
    font-size: 0.78rem;
    color: var(--ink);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .record-meta {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .record-amount {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ink);
  }

  .record-badge {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--sello);
    background: rgba(15, 107, 76, 0.08);
    padding: 0.12rem 0.4rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .record-badge.reconciled {
    background: rgba(15, 107, 76, 0.15);
    color: var(--sello);
    font-weight: 700;
  }

  .verification-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    background: #eef8f3;
    border: 1px solid rgba(15, 107, 76, 0.25);
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.85rem;
    animation: bannerFadeIn 0.3s ease-out;
  }

  @keyframes bannerFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .banner-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--sello);
    color: #ffffff;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .banner-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .banner-text strong {
    font-size: 0.78rem;
    color: var(--sello);
  }

  .banner-text span {
    font-size: 0.7rem;
    color: rgba(26, 29, 35, 0.78);
    line-height: 1.35;
  }

  .action-footer {
    display: flex;
    flex-direction: column;
  }

  .verify-btn {
    width: 100%;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    background: var(--ink);
    color: #ffffff;
    border: 1px solid var(--ink);
    border-radius: 6px;
    font-family: var(--font-body);
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .verify-btn:hover:not(:disabled) {
    background: #000000;
    color: var(--amber-bright);
    transform: translateY(-1px);
  }

  .verify-btn.verified {
    background: var(--sello);
    border-color: var(--sello);
    color: #ffffff;
  }

  .verify-btn.verified:hover:not(:disabled) {
    background: #15805d;
    color: #ffffff;
  }

  .verify-btn:disabled {
    opacity: 0.85;
    cursor: wait;
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
    .verification-banner {
      animation: none;
    }
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
