<script lang="ts">
  import { onMount } from 'svelte';
  import { isShiftHandoffEnabled } from '$lib/features';
  import { defaultTenantSession, readTenantSession, type PosTenantSession } from '$lib/tenant/session';
  import { issueShiftPin, transferShift, type ShiftTransferResult } from '$lib/cash/shift-handoff';
  import Icon from '$lib/ui/Icon.svelte';

  const shiftOn = isShiftHandoffEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let sessionId = $state('');
  let outgoingUserId = $state('');
  let step = $state<'idle' | 'pin-shown' | 'done'>('idle');
  let issuedPin = $state('');
  let pinExpiresAt = $state('');
  let pinInput = $state('');
  let interimCountCents = $state<string>('');
  let status = $state('');
  let resultMsg = $state('');
  let transferResult = $state<ShiftTransferResult | null>(null);

  onMount(() => {
    session = readTenantSession(sessionStorage);
    if (session.tenantId && session.tenantId !== 'demo') {
      sessionId = session.tenantId;
    }
  });

  async function onGeneratePin() {
    status = 'enviando';
    resultMsg = '';
    issuedPin = '';
    const res = await issueShiftPin(sessionId, outgoingUserId);
    if (!res.ok) {
      status = 'error';
      resultMsg = res.message;
      return;
    }
    step = 'pin-shown';
    issuedPin = res.pin;
    pinExpiresAt = new Date(res.expiresAtIso).toLocaleTimeString();
    status = 'pin';
    resultMsg = 'Muéstrale este PIN al cajero entrante una sola vez. Expira en 5 minutos.';
  }

  async function onTransfer() {
    status = 'enviando';
    resultMsg = '';
    const parsed = String(interimCountCents).trim() === '' ? null : Number(interimCountCents);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
      status = 'error';
      resultMsg = 'El conteo intermedio debe ser un entero mayor o igual a 0.';
      return;
    }
    const res = await transferShift(sessionId, outgoingUserId, pinInput, parsed);
    if (!res.ok) {
      status = 'error';
      resultMsg = res.message;
      return;
    }
    transferResult = res;
    step = 'done';
    status = 'transferido';
    resultMsg = `Turno transferido. La sesión sigue abierta.`;
  }
</script>

<svelte:head><title>Cambio de turno · Caja · KipusPay</title></svelte:head>

<div class="handoff-page-container">
  <section class="glass-panel handoff-card" data-testid="shift-handoff">
    <div class="card-header-bar">
      <div>
        <span class="badge badge-indigo">Handoff de Turno</span>
        <h1 class="page-title">Cambio de turno sin cierre Z</h1>
      </div>
      <a href="/caja" class="btn btn-secondary nav-link-btn">
        <Icon name="arrow-right" size={16} />
        Cierre Z
      </a>
    </div>

    <p class="lede-text">
      La sesión sigue abierta: se transfiere al siguiente operador con un PIN de un solo uso.
      El arqueo Z real queda para el cierre de la caja.
    </p>

    {#if !shiftOn}
      <div class="banner-box off-banner" data-testid="handoff-feature-off">
        <span class="banner-icon"><Icon name="alert" size={20} /></span>
        <div>
          <strong>FEATURE_SHIFT_HANDOFF desactivado</strong>
          <p>Activa el flag operacional para transferir turnos.</p>
        </div>
      </div>
    {:else}
      <div class="form-group">
        <label for="handoff-session-id">ID de Sesión de Caja</label>
        <input id="handoff-session-id" bind:value={sessionId} data-testid="handoff-session-id" placeholder="s-demo" />
      </div>
      <div class="form-group">
        <label for="handoff-outgoing">Operador saliente (userId)</label>
        <input id="handoff-outgoing" bind:value={outgoingUserId} data-testid="handoff-outgoing" placeholder="u-saliente" />
      </div>

      <button type="button" class="primary pin-btn" data-testid="handoff-generate-pin" onclick={onGeneratePin}>
        <Icon name="lock" size={16} />
        Generar PIN de transferencia
      </button>

      {#if step === 'pin-shown'}
        <div class="pin-reveal-card" data-testid="handoff-pin-reveal">
          <span class="pin-label">PIN de un solo uso (expira {pinExpiresAt})</span>
          <span class="pin-value tabular-nums">{issuedPin}</span>
        </div>
      {/if}

      <div class="form-group">
        <label for="handoff-pin-input">PIN del saliente (teclea el operador entrante)</label>
        <input
          id="handoff-pin-input"
          bind:value={pinInput}
          data-testid="handoff-pin-input"
          inputmode="numeric"
          placeholder="6 dígitos"
        />
      </div>
      <div class="form-group">
        <label for="handoff-interim">Conteo intermedio de efectivo (opcional, según política)</label>
        <input
          id="handoff-interim"
          bind:value={interimCountCents}
          data-testid="handoff-interim"
          inputmode="numeric"
          type="number"
          min="0"
          placeholder="En centavos (ej. 9500)"
        />
      </div>

      <button type="button" class="primary transfer-btn" data-testid="handoff-transfer" onclick={onTransfer}>
        Transferir turno
      </button>

      {#if status || resultMsg || transferResult}
        <div class="result-revelation-card">
          {#if status}
            <span class="badge" class:badge-success={status === 'transferido'} class:badge-danger={status === 'error'}>
              {status}
            </span>
          {/if}
          {#if resultMsg}
            <p data-testid="handoff-msg" class="result-msg">{resultMsg}</p>
          {/if}
          {#if transferResult?.ok}
            <div class="revelation-row" data-testid="handoff-diff">
              <span>Diferencia del conteo intermedio:</span>
              <strong class="tabular-nums">
                {transferResult.cashDiffCents === null ? '—' : `S/ ${transferResult.cashDiffCents}`}
              </strong>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .handoff-page-container {
    max-width: 640px;
    margin: 0 auto;
  }

  .handoff-card {
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
    font-size: 1.5rem;
    font-weight: 800;
    margin-top: 0.25rem;
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

  .pin-btn,
  .transfer-btn {
    width: 100%;
    padding: 0.875rem;
  }

  .pin-reveal-card {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
    padding: 1rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pin-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .pin-value {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: var(--emerald-green);
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

  .result-msg {
    font-size: 0.9375rem;
  }

  .revelation-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border-subtle);
  }
</style>
