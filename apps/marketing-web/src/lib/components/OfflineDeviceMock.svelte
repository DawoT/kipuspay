<script lang="ts">
  import { formatCents, sumCents } from '$lib/brand/money';

  interface OfflineTicket {
    readonly id: string;
    readonly doc: string;
    readonly time: string;
    readonly method: string;
    readonly amount_cents: number;
  }

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

<div class="offline-device-container" data-testid="offline-device-mock" data-theme="dark">
  <div class="smartphone-frame" aria-label="Smartphone OLED mostrando operación continua sin internet">
    <div class="phone-notch" aria-hidden="true">
      <span class="notch-island">
        <span class="island-camera"></span>
        <span class="island-mic"></span>
      </span>
    </div>

    <div class="phone-status-bar" aria-hidden="true">
      <span class="phone-time">11:45</span>
      <div class="status-indicators">
        <span class="network-badge" class:online={isSynced}>
          {#if isSynced}
            <span class="dot-online"></span> En línea
          {:else}
            <span class="dot-offline"></span> Sin conexión
          {/if}
        </span>
        <span class="battery-icon">100%</span>
      </div>
    </div>

    <header class="device-header">
      <div class="operation-mode">
        <span class="mode-pulse" class:synced={isSynced} aria-hidden="true">●</span>
        <span class="mode-text">Operación continua activa · Modo Mostrador</span>
      </div>
    </header>

    <div class="queue-summary-card" class:synced={isSynced}>
      <div class="summary-meta">
        <span class="summary-label">
          {isSynced ? 'Cola sincronizada' : 'Ventas en espera'}
        </span>
        <span class="summary-total tabular-nums">
          S/ {formatCents(total_queue_cents)}
        </span>
      </div>
      <p class="summary-count">
        {#if isSynced}
          3 comprobantes sincronizados con éxito ✓
        {:else}
          3 comprobantes emitidos en cola local
        {/if}
      </p>
    </div>

    <div class="tickets-scroll-area">
      <p class="scroll-micro-title">Comprobantes emitidos en este turno</p>
      <ul class="tickets-list" aria-label="Lista de comprobantes emitidos">
        {#each tickets as ticket (ticket.id)}
          <li class="ticket-item" class:synced={isSynced}>
            <div class="ticket-row-top">
              <div class="ticket-main-info">
                <span class="ticket-doc">{ticket.doc}</span>
                <span class="ticket-time">{ticket.time}</span>
              </div>
              <span class="ticket-amount tabular-nums">
                S/ {formatCents(ticket.amount_cents)}
              </span>
            </div>
            <div class="ticket-row-bottom">
              <span class="ticket-method">{ticket.method}</span>
              <span class="ticket-status" class:synced={isSynced}>
                {#if isSynced}
                  Sincronizado con éxito ✓
                {:else}
                  Guardado en memoria local
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
        aria-label="Simular reconexión de internet y sincronización"
      >
        {#if isReconnecting}
          <span class="btn-spinner" aria-hidden="true"></span> Sincronizando comprobantes…
        {:else if isSynced}
          Sincronizado con éxito ✓ (Reiniciar)
        {:else}
          Simular reconexión
        {/if}
      </button>
      <p class="reconnect-hint">
        {#if isSynced}
          Todo respaldado en la nube automáticamente sin duplicados.
        {:else}
          Al volver la señal, la sincronización se completa sola.
        {/if}
      </p>
    </div>

    <div class="phone-home-bar" aria-hidden="true"></div>
  </div>
</div>

<style>
  .offline-device-container {
    width: 100%;
    max-width: 380px;
    margin: 0 auto;
  }

  .smartphone-frame {
    width: 100%;
    background: #0b0e14;
    border: 3.5px solid #232730;
    border-radius: 36px;
    box-shadow:
      0 28px 65px -12px rgba(0, 0, 0, 0.8),
      0 0 0 1px rgba(255, 255, 255, 0.08),
      inset 0 0 20px rgba(0, 0, 0, 0.6);
    padding: 0.85rem 1rem 0.75rem 1rem;
    color: var(--paper);
    position: relative;
    overflow: hidden;
  }

  .phone-notch {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.4rem;
  }

  .notch-island {
    width: 90px;
    height: 18px;
    background: #14171f;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 8px;
    gap: 6px;
  }

  .island-camera {
    width: 8px;
    height: 8px;
    background: #07090c;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .island-mic {
    width: 4px;
    height: 4px;
    background: #07090c;
    border-radius: 50%;
  }

  .phone-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(243, 239, 230, 0.7);
    margin-bottom: 0.65rem;
    padding: 0 0.25rem;
  }

  .status-indicators {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .network-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: rgba(217, 106, 60, 0.2);
    color: var(--alerta-bright, #d96a3c);
    padding: 0.12rem 0.45rem;
    border-radius: 12px;
    font-size: 0.64rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }

  .network-badge.online {
    background: rgba(46, 158, 116, 0.2);
    color: #6ee7b7;
  }

  .dot-offline {
    width: 5px;
    height: 5px;
    background: var(--alerta-bright, #d96a3c);
    border-radius: 50%;
  }

  .dot-online {
    width: 5px;
    height: 5px;
    background: #34d399;
    border-radius: 50%;
  }

  .device-header {
    border-bottom: 1px solid rgba(243, 239, 230, 0.08);
    padding-bottom: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .operation-mode {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }

  .mode-pulse {
    color: var(--amber-bright);
    font-size: 0.75rem;
    animation: modeBlink 2s infinite ease-in-out;
  }

  .mode-pulse.synced {
    color: #34d399;
    animation: none;
  }

  @keyframes modeBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }

  .mode-text {
    font-weight: 600;
    color: var(--paper);
    letter-spacing: 0.02em;
  }

  .queue-summary-card {
    background: linear-gradient(180deg, #161b24 0%, #11141b 100%);
    border: 1px solid rgba(229, 169, 59, 0.28);
    border-radius: 10px;
    padding: 0.7rem 0.85rem;
    margin-bottom: 0.75rem;
    transition: border-color 0.3s ease, background 0.3s ease;
  }

  .queue-summary-card.synced {
    border-color: rgba(52, 211, 153, 0.35);
    background: linear-gradient(180deg, #12211c 0%, #0e1714 100%);
  }

  .summary-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.2rem;
  }

  .summary-label {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
  }

  .summary-total {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .queue-summary-card.synced .summary-total {
    color: #6ee7b7;
  }

  .summary-count {
    margin: 0;
    font-size: 0.8rem;
    color: var(--paper);
    font-weight: 500;
  }

  .tickets-scroll-area {
    margin-bottom: 0.75rem;
  }

  .scroll-micro-title {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.5);
    margin: 0 0 0.4rem 0;
  }

  .tickets-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 190px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(243, 239, 230, 0.2) transparent;
  }

  .tickets-list::-webkit-scrollbar {
    width: 4px;
  }

  .tickets-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .tickets-list::-webkit-scrollbar-thumb {
    background: rgba(243, 239, 230, 0.2);
    border-radius: 4px;
  }

  .ticket-item {
    background: #141820;
    border: 1px solid rgba(243, 239, 230, 0.08);
    border-radius: 8px;
    padding: 0.55rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    transition: border-color 0.25s ease, background 0.25s ease;
  }

  .ticket-item.synced {
    border-color: rgba(52, 211, 153, 0.2);
    background: #121916;
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
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--paper);
  }

  .ticket-time {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: rgba(243, 239, 230, 0.55);
  }

  .ticket-amount {
    font-family: var(--font-mono);
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--paper);
  }

  .ticket-row-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.7rem;
  }

  .ticket-method {
    color: rgba(243, 239, 230, 0.65);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-size: 0.64rem;
  }

  .ticket-status {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--amber-bright);
    font-weight: 600;
    transition: color 0.25s ease;
  }

  .ticket-status.synced {
    color: #6ee7b7;
  }

  .reconnect-action-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
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
    font-family: var(--font-body);
    font-size: 0.88rem;
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

  .reconnect-btn.synced:hover:not(:disabled) {
    background: #15805d;
    box-shadow: 0 6px 16px rgba(46, 158, 116, 0.45);
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
    font-size: 0.64rem;
    color: rgba(243, 239, 230, 0.55);
    line-height: 1.35;
  }

  .phone-home-bar {
    width: 100px;
    height: 3.5px;
    background: rgba(243, 239, 230, 0.3);
    border-radius: 2px;
    margin: 0.6rem auto 0 auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .mode-pulse,
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
