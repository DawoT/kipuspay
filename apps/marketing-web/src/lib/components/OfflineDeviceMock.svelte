<script lang="ts">
  import PhoneMockFrame from './PhoneMockFrame.svelte';
  import { formatCents, sumCents } from '$lib/brand/money';

  interface OfflineTicket {
    readonly id: string;
    readonly doc: string;
    readonly time: string;
    readonly method: string;
    readonly amount_cents: number;
  }

  interface Props {
    theme?: 'light' | 'dark';
  }

  let { theme = 'dark' }: Props = $props();

  const tickets: readonly OfflineTicket[] = [
    { id: 't1', doc: 'B001-0089', time: '11:42', method: 'Yape', amount_cents: 3850 },
    { id: 't2', doc: 'B001-0090', time: '11:44', method: 'Efectivo', amount_cents: 1500 },
    { id: 't3', doc: 'B001-0091', time: '11:45', method: 'Tarjeta', amount_cents: 6200 },
  ];

  const total_queue_cents = $derived(sumCents(tickets.map((t) => t.amount_cents)));

  let isReconnecting = $state(false);
  let isSynced = $state(false);

  function simulateReconnect() {
    if (isReconnecting) return;
    if (isSynced) {
      isSynced = false;
      return;
    }
    isReconnecting = true;
    setTimeout(() => {
      isReconnecting = false;
      isSynced = true;
    }, 700);
  }
</script>

<div class="offline-device-container" data-testid="offline-device-mock" data-theme={theme}>
  <PhoneMockFrame
    {theme}
    time="11:45"
    title="Modo Mostrador · KipusPay"
    statusBadge={isSynced ? 'En línea · Sincronizado' : 'Sin conexión · Memoria local'}
    statusTone={isSynced ? 'live' : 'offline'}
    ariaLabel="Smartphone OLED mostrando operación continua sin internet"
  >
    <div class="offline-screen">
      <div class="queue-summary-card" class:synced={isSynced}>
        <div class="summary-meta">
          <span class="summary-label">
            {isSynced ? 'Cola sincronizada' : 'Ventas en espera'}
          </span>
          <span class="summary-total">S/ {formatCents(total_queue_cents)}</span>
        </div>
        <p class="summary-count">
          {#if isSynced}
            ✓ 3 comprobantes sincronizados con éxito
          {:else}
            3 ventas guardadas en memoria local del equipo
          {/if}
        </p>
      </div>

      <div class="tickets-scroll-area">
        <p class="scroll-micro-title">Comprobantes locales en cola</p>
        <ul class="tickets-list">
          {#each tickets as ticket (ticket.id)}
            <li class="ticket-item" class:synced={isSynced}>
              <div class="ticket-row-top">
                <div class="ticket-main-info">
                  <span class="ticket-doc">{ticket.doc}</span>
                  <span class="ticket-time">{ticket.time}</span>
                </div>
                <span class="ticket-amount">S/ {formatCents(ticket.amount_cents)}</span>
              </div>
              <div class="ticket-row-bottom">
                <span class="ticket-method">{ticket.method}</span>
                <span class="ticket-status" class:synced={isSynced}>
                  {#if isSynced}
                    Sincronizado con éxito ✓
                  {:else}
                    Guardado en memoria local · Listo para sincronizar
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </div>

      <div class="reconnect-action-wrap">
        <button
          type="button"
          class="reconnect-btn"
          class:synced={isSynced}
          onclick={simulateReconnect}
          disabled={isReconnecting}
        >
          {#if isReconnecting}
            <span class="btn-spinner" aria-hidden="true"></span>
            <span>Reconectando y sincronizando…</span>
          {:else if isSynced}
            <span>✓ Cola al día (clic para reiniciar simulación)</span>
          {:else}
            <span>Simular reconexión de red</span>
          {/if}
        </button>

        <p class="reconnect-hint">
          Tus ventas se protegen localmente sol a sol y se sincronizan solas en cuanto vuelve la señal.
        </p>
      </div>
    </div>
  </PhoneMockFrame>
</div>

<style>
  .offline-device-container {
    width: 100%;
    max-width: 380px;
    margin: 0 auto;
  }

  .offline-screen {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.2rem 0;
    font-family: var(--font-sans);
  }

  .queue-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #11141b 100%);
    border: 1px solid rgba(229, 169, 59, 0.28);
    border-radius: 10px;
    padding: 0.65rem 0.8rem;
    transition: all 0.3s ease;
  }

  .theme-light .queue-summary-card {
    background: #f8fafc;
    border-color: rgba(20, 22, 28, 0.12);
  }

  .queue-summary-card.synced {
    border-color: rgba(52, 211, 153, 0.35);
    background: linear-gradient(180deg, #12211c 0%, #0e1714 100%);
  }

  .theme-light .queue-summary-card.synced {
    background: #ecfdf5;
    border-color: #a7f3d0;
  }

  .summary-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.2rem;
  }

  .summary-label {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
  }

  .theme-light .summary-label {
    color: rgba(20, 22, 28, 0.65);
  }

  .summary-total {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .theme-light .summary-total {
    color: var(--ink);
  }

  .queue-summary-card.synced .summary-total {
    color: #6ee7b7;
  }

  .theme-light .queue-summary-card.synced .summary-total {
    color: #059669;
  }

  .summary-count {
    margin: 0;
    font-size: 0.76rem;
    color: var(--paper);
    font-weight: 500;
  }

  .theme-light .summary-count {
    color: var(--ink);
  }

  .tickets-scroll-area {
    margin-bottom: 0.2rem;
  }

  .scroll-micro-title {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.5);
    margin: 0 0 0.35rem 0;
  }

  .theme-light .scroll-micro-title {
    color: rgba(20, 22, 28, 0.5);
  }

  .tickets-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 190px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-right: 0.2rem;
  }

  .tickets-list::-webkit-scrollbar {
    width: 4px;
  }

  .tickets-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .theme-light .tickets-list::-webkit-scrollbar-thumb {
    background: rgba(20, 22, 28, 0.2);
  }

  .ticket-item {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.5rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    transition: all 0.25s ease;
  }

  .theme-light .ticket-item {
    background: #ffffff;
    border-color: rgba(20, 22, 28, 0.08);
  }

  .ticket-item.synced {
    border-color: rgba(52, 211, 153, 0.2);
    background: #121916;
  }

  .theme-light .ticket-item.synced {
    background: #f0fdf4;
    border-color: rgba(16, 185, 129, 0.25);
  }

  .ticket-row-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .ticket-main-info {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }

  .ticket-doc {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--paper);
  }

  .theme-light .ticket-doc {
    color: var(--ink);
  }

  .ticket-time {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .theme-light .ticket-time {
    color: rgba(20, 22, 28, 0.55);
  }

  .ticket-amount {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--paper);
  }

  .theme-light .ticket-amount {
    color: var(--ink);
  }

  .ticket-row-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.68rem;
  }

  .ticket-method {
    color: rgba(243, 239, 230, 0.65);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-size: 0.62rem;
  }

  .theme-light .ticket-method {
    color: rgba(20, 22, 28, 0.65);
    background: rgba(20, 22, 28, 0.05);
  }

  .ticket-status {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--amber-bright);
    font-weight: 600;
    transition: color 0.25s ease;
  }

  .theme-light .ticket-status {
    color: #8c5a14;
  }

  .ticket-status.synced {
    color: #6ee7b7;
  }

  .theme-light .ticket-status.synced {
    color: #059669;
  }

  .reconnect-action-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.3rem;
  }

  .reconnect-btn {
    width: 100%;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--amber);
    color: var(--ink);
    border: none;
    border-radius: 8px;
    font-family: var(--font-sans);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 4px 12px rgba(217, 154, 61, 0.3);
  }

  .reconnect-btn:hover:not(:disabled) {
    background: var(--amber-bright);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(238, 183, 101, 0.4);
  }

  .reconnect-btn.synced {
    background: #0f6b4c;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(15, 107, 76, 0.35);
  }

  .reconnect-btn:disabled {
    opacity: 0.85;
    cursor: wait;
  }

  .btn-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(20, 22, 28, 0.3);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .reconnect-hint {
    margin: 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: rgba(243, 239, 230, 0.55);
    line-height: 1.35;
  }

  .theme-light .reconnect-hint {
    color: rgba(20, 22, 28, 0.55);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-spinner {
      animation: none;
    }
    .reconnect-btn {
      transition: none;
    }
    .reconnect-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>