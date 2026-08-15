<script lang="ts">
  import { onMount } from 'svelte';
  import { isShiftHandoffEnabled } from '$lib/features';
  import { defaultTenantSession, readTenantSession, type PosTenantSession } from '$lib/tenant/session';
  import { issueShiftPin, transferShift, type ShiftTransferResult } from '$lib/cash/shift-handoff';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  const shiftOn = isShiftHandoffEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let sessionId = $state('');
  let outgoingUserId = $state('');
  let step = $state<'idle' | 'pin-shown' | 'done'>('idle');
  let issuedPin = $state('');
  let pinExpiresAt = $state('');
  let pinInput = $state('');
  let interimCountCents = $state<number | null>(null);
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
    const parsed = interimCountCents;
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
      <StatusMessage tone="warning" data-testid="handoff-feature-off">
        <Icon name="alert" size={20} />
        <div>
          <strong>El cambio de turno está desactivado</strong>
          <p>Contacta a tu proveedor para activarlo.</p>
        </div>
      </StatusMessage>
    {:else}
      <Field label="ID de Sesión de Caja" id="handoff-session-id">
        <Input id="handoff-session-id" bind:value={sessionId} data-testid="handoff-session-id" placeholder="Sesión de caja" />
      </Field>
      <Field label="Operador que entrega el turno" id="handoff-outgoing">
        <Input id="handoff-outgoing" bind:value={outgoingUserId} data-testid="handoff-outgoing" placeholder="u-saliente" />
      </Field>

      <Button
        variant="primary"
        size="full"
        data-testid="handoff-generate-pin"
        onclick={onGeneratePin}
        icon="lock"
      >
        Generar PIN de transferencia
      </Button>

      {#if step === 'pin-shown'}
        <div class="pin-reveal-card" data-testid="handoff-pin-reveal">
          <span class="pin-label">PIN de un solo uso (expira {pinExpiresAt})</span>
          <span class="pin-value tabular-nums">{issuedPin}</span>
        </div>
      {/if}

      <Field label="PIN del saliente (teclea el operador entrante)" id="handoff-pin-input">
        <Input
          id="handoff-pin-input"
          bind:value={pinInput}
          data-testid="handoff-pin-input"
          inputmode="numeric"
          placeholder="6 dígitos"
        />
      </Field>
      <Field label="Conteo intermedio de efectivo (opcional, según política)" id="handoff-interim">
        <MoneyInput
          id="handoff-interim"
          bind:value={interimCountCents}
          data-testid="handoff-interim"
          min={0}
          placeholder="Importe del conteo"
        />
      </Field>

      <Button
        variant="primary"
        size="full"
        data-testid="handoff-transfer"
        onclick={onTransfer}
      >
        Transferir turno
      </Button>

      {#if status || resultMsg || transferResult}
        <div class="result-revelation-card">
          {#if status}
            <Badge variant={status === 'transferido' ? 'success' : 'danger'}>
              {status}
            </Badge>
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
    padding: var(--inset-shell);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
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
    background: rgba(20, 22, 28, 0.8);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-md);
    padding: var(--inset-card);
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

  @media (max-width: 900px) {
    .card-header-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .pin-reveal-card {
      flex-wrap: wrap;
    }
  }
</style>
