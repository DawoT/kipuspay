<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isCashBlindZEnabled,
    isClientOffloadingEnabled,
    isHardwarePrintFallbackEnabled,
  } from '$lib/features';
  import {
    PEN_DENOMS,
    submitBlindClose,
    sumLocalCount,
    type DenominationLine,
  } from '$lib/cash/blind-close';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { createBrowserPrintIdb, PrintOutboxStore } from '$lib/print/print-outbox-store';
  import { createPrinterTransport } from '$lib/print/printer-transport';

  const blindOn = isCashBlindZEnabled();
  const printOn = isHardwarePrintFallbackEnabled() || isClientOffloadingEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let sessionId = $state('s-demo');
  let qtyByDenom = $state<Record<number, number>>(
    Object.fromEntries(PEN_DENOMS.map((d) => [d, 0])),
  );
  let reason = $state('');
  let status = $state('');
  let resultMsg = $state('');
  let revealedExpected = $state<number | null>(null);
  let revealedDiff = $state<number | null>(null);
  let outboxPending = $state(0);
  let preflightAdapters = $state<string[]>([]);

  const countLines = $derived(
    PEN_DENOMS.filter((d) => (qtyByDenom[d] ?? 0) > 0).map(
      (d): DenominationLine => ({
        denominationCents: d,
        quantity: qtyByDenom[d] ?? 0,
      }),
    ),
  );
  const countedLocal = $derived(sumLocalCount(countLines));

  /** Adaptador de browser IndexedDB (persistencia real entre F5/pestañas). */
  const printIdb = createBrowserPrintIdb();
  const printOutbox = new PrintOutboxStore(printIdb);

  onMount(() => {
    session = readTenantSession(sessionStorage);
    void refreshOutbox();
    if (printOn) {
      void createPrinterTransport().preflight().then((a) => {
        preflightAdapters = [...a];
      });
    }
  });

  async function refreshOutbox() {
    outboxPending = await printOutbox.pendingCount();
  }

  async function onConfirmClose() {
    status = 'enviando';
    resultMsg = '';
    revealedExpected = null;
    revealedDiff = null;
    await refreshOutbox();
    if (outboxPending > 0) {
      status = 'bloqueado';
      resultMsg = `Print outbox pendiente (${outboxPending}). Reimprime o resuelve tickets antes del cierre Z.`;
      return;
    }
    const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await submitBlindClose(apiBase || 'https://api.kipuspay.local', auth, {
      sessionId,
      countLines,
      differenceReason: reason.trim() || null,
      differenceThresholdCents: 0,
      outboxPendingCount: outboxPending,
    });
    if (!res.ok) {
      status = 'error';
      resultMsg =
        res.code === 'PRINT_OUTBOX_BLOCK'
          ? `Bloqueado por print outbox (${res.pendingCount ?? '?'})`
          : res.message;
      return;
    }
    status = 'cerrado';
    revealedExpected = res.expectedTotalCents ?? null;
    revealedDiff = res.differenceAmountCents ?? null;
    resultMsg = res.message;
  }
</script>

<div class="caja-page-container">
  <section class="glass-panel caja-card" data-testid="caja-blind-z">
    <div class="card-header-bar">
      <div>
        <span class="badge badge-indigo">Control Operativo</span>
        <h1 class="page-title">Cierre Z Ciego</h1>
      </div>
      <a href="/caja/devolucion" class="btn btn-secondary nav-link-btn" data-testid="caja-link-devolucion">
        ↩️ Devolución
      </a>
    </div>

    <p class="lede-text">
      Ingresa el conteo físico de efectivo por denominación. El sistema calcula lo esperado únicamente al confirmar el arqueo.
    </p>

    {#if !blindOn}
      <div class="banner-box off-banner" data-testid="caja-feature-off">
        <span class="banner-icon">⚠️</span>
        <div>
          <strong>FEATURE_CASH_BLIND_Z desactivado</strong>
          <p>Activa el flag operacional para cerrar caja en producción.</p>
        </div>
      </div>
    {:else}
      {#if printOn}
        <div class="preflight-status-card">
          <div class="status-item" data-testid="caja-print-preflight">
            <span class="item-label">Pre-flight Impresora:</span>
            <span class="item-val">
              {preflightAdapters.length ? preflightAdapters.join(' → ') : 'Detectando hardware…'}
            </span>
          </div>
          <div class="status-item" data-testid="caja-print-pending">
            <span class="item-label">Outbox Pendiente:</span>
            <span class="badge" class:badge-warning={outboxPending > 0} class:badge-success={outboxPending === 0}>
              {outboxPending} tickets
            </span>
          </div>
        </div>
      {/if}

      <div class="form-group session-group">
        <label for="session-id-input">ID de Sesión de Caja</label>
        <input
          id="session-id-input"
          bind:value={sessionId}
          data-testid="caja-session-id"
          placeholder="s-demo"
        />
      </div>

      <!-- Denominations Grid -->
      <div class="denom-grid-container">
        <div class="grid-header">
          <span>Denominación (PEN)</span>
          <span>Cantidad de Billetes / Monedas</span>
        </div>
        <div class="denom-rows-list">
          {#each PEN_DENOMS as d}
            <div class="denom-row-card">
              <div class="denom-label">
                <span class="denom-icon">{d >= 1000 ? '💵' : '🪙'}</span>
                <span class="denom-amount tabular-nums">S/ {formatCents(d)}</span>
              </div>
              <div class="denom-input-wrapper">
                <input
                  type="number"
                  min="0"
                  bind:value={qtyByDenom[d]}
                  data-testid={`caja-denom-${d}`}
                  placeholder="0"
                  class="denom-qty-input tabular-nums"
                />
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Total Counter Box -->
      <div class="counter-total-box">
        <div class="total-info">
          <span class="total-title">TOTAL ARQUEO LOCAL</span>
          <span class="tenant-tag">Tenant: {session.tenantId}</span>
        </div>
        <span class="counted-amount tabular-nums">
          S/ {formatCents(countedLocal)}
        </span>
      </div>

      <div class="form-group">
        <label for="diff-reason-input">Motivo de diferencia (si aplica)</label>
        <input
          id="diff-reason-input"
          bind:value={reason}
          data-testid="caja-diff-reason"
          placeholder="Ej. Faltante justificado por cambio de billete..."
        />
      </div>

      <button
        type="button"
        class="primary confirm-z-btn"
        data-testid="caja-confirm-z"
        onclick={onConfirmClose}
      >
        🔒 Confirmar Cierre Z
      </button>

      <!-- Status & Revelation Area -->
      {#if status || resultMsg || revealedExpected !== null || revealedDiff !== null}
        <div class="result-revelation-card">
          {#if status}
            <div class="result-header">
              <span class="badge" class:badge-warning={status === 'enviando'} class:badge-success={status === 'cerrado'} class:badge-danger={status === 'error' || status === 'bloqueado'}>
                {status}
              </span>
              <span data-testid="caja-z-status" class="status-name">{status}</span>
            </div>
          {/if}

          {#if resultMsg}
            <p data-testid="caja-z-msg" class="result-msg">{resultMsg}</p>
          {/if}

          {#if revealedExpected !== null}
            <div class="revelation-row" data-testid="caja-z-expected">
              <span>Esperado por Sistema:</span>
              <strong class="tabular-nums">S/ {formatCents(revealedExpected)}</strong>
            </div>
          {/if}

          {#if revealedDiff !== null}
            <div class="revelation-row diff-row" data-testid="caja-z-diff">
              <span>Diferencia Registrada:</span>
              <strong class="tabular-nums" class:diff-negative={revealedDiff < 0} class:diff-zero={revealedDiff === 0}>
                S/ {formatCents(revealedDiff)}
              </strong>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .caja-page-container {
    max-width: 720px;
    margin: 0 auto;
  }

  .caja-card {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .page-title {
    font-size: 1.75rem;
    font-weight: 800;
    margin-top: 0.25rem;
  }

  .nav-link-btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  .lede-text {
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .off-banner {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 1rem;
    border-radius: var(--radius-md);
    display: flex;
    gap: 0.875rem;
    align-items: center;
    color: #fbbf24;
  }

  .preflight-status-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 0.875rem 1.125rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  .item-label {
    color: var(--text-muted);
    font-weight: 500;
  }
  .item-val {
    font-weight: 600;
    color: var(--text-main);
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  /* Denominations Grid */
  .denom-grid-container {
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .grid-header {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .denom-rows-list {
    display: flex;
    flex-direction: column;
  }

  .denom-row-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .denom-row-card:last-child {
    border-bottom: none;
  }

  .denom-label {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .denom-icon {
    font-size: 1.25rem;
  }
  .denom-amount {
    font-weight: 700;
    font-size: 1rem;
    color: var(--text-main);
  }

  .denom-qty-input {
    width: 120px;
    text-align: right;
    font-weight: 700;
  }

  .counter-total-box {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-title {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--emerald-green);

  }
  .tenant-tag {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .counted-amount {
    font-size: 2.25rem;
    font-weight: 800;
    color: var(--emerald-green);
    text-shadow: 0 0 16px rgba(16, 185, 129, 0.3);
  }

  .confirm-z-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1.125rem;
  }

  .result-revelation-card {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .status-name {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .result-msg {
    font-size: 0.9375rem;
    color: var(--text-main);
  }

  .revelation-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border-subtle);
    font-size: 0.9375rem;
  }

  .diff-negative {
    color: var(--rose-red);
  }
  .diff-zero {
    color: var(--emerald-green);
  }
</style>
