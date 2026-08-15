<script lang="ts">
  
  import { initTenantBranchId, initCashSessionContext } from '$lib/admin/cash-session';
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
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Modal from '$lib/ui/Modal.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import {
    createCashMovement,
    mintCashAuthzToken,
    reprintSale,
    type CashMovementType,
    type MovementInput,
  } from '$lib/cash/cash-movement';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const MOVEMENT_LABELS: Readonly<Record<CashMovementType, string>> = {
    DEPOSIT_VALUES: 'Ingreso de recaudación',
    CHANGE_FUND_IN: 'Entrada de fondo (cambio)',
    CHANGE_FUND_OUT: 'Salida de fondo (cambio)',
    SUPPLIER_PAYMENT: 'Pago a proveedor',
    ADJUSTMENT: 'Ajuste de caja',
    SALE_REFUND: 'Reembolso de venta',
    LAYAWAY_DEPOSIT: 'Depósito de apartado',
    LAYAWAY_REFUND: 'Devolución de apartado',
  };
  const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as CashMovementType[];

  const blindOn = isCashBlindZEnabled();
  const printOn = isHardwarePrintFallbackEnabled() || isClientOffloadingEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let sessionId = $state(initCashSessionContext().sessionId);
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

  let movementType = $state<CashMovementType>('CHANGE_FUND_IN');
  let movementAmountCents = $state<number | null>(null);
  let movementBranchId = $state(initTenantBranchId());
  let movementRef = $state('');
  let movementReason = $state('');
  let movementStatus = $state('');
  let movementMsg = $state('');
  let authzOpen = $state(false);
  let authzPin = $state('');
  let authzMsg = $state('');
  let reprintSaleId = $state('');
  let reprintBranchId = $state(initTenantBranchId());
  let reprintReason = $state('');
  let reprintMsg = $state('');
  let reprintOk = $state(false);
  let pendingMovement: MovementInput | null = null;

  function buildMovementInput(): MovementInput {
    return {
      apiBase: resolveApiBase(localStorage),
      authorization: resolveApiAuth(localStorage).authorization ?? '',
      branchId: movementBranchId.trim() || initTenantBranchId(),
      sessionId: sessionId || initCashSessionContext().sessionId,
      movementType,
      amountCents: movementAmountCents ?? 0,
      counterpartyRef: movementRef.trim() || null,
      reason: movementReason.trim() || null,
    };
  }

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
      resultMsg = `Impresiones pendientes (${outboxPending}). Reimprime o resuelve los tickets antes del cierre Z.`;
      return;
    }
    const apiBase = resolveApiBase(localStorage);
    const auth = resolveApiAuth(localStorage).authorization ?? '';
    const res = await submitBlindClose(apiBase, auth, {
      sessionId: sessionId || initCashSessionContext().sessionId,
      countLines,
      differenceReason: reason.trim() || null,
      differenceThresholdCents: 0,
      outboxPendingCount: outboxPending,
    });
    if (!res.ok) {
      status = 'error';
      resultMsg =
        res.code === 'PRINT_OUTBOX_BLOCK'
          ? `Bloqueado por impresiones pendientes (${res.pendingCount ?? '?'})`
          : res.message;
      return;
    }
    status = 'cerrado';
    revealedExpected = res.expectedTotalCents ?? null;
    revealedDiff = res.differenceAmountCents ?? null;
    resultMsg = res.message;
  }

  async function onRegisterMovement() {
    movementStatus = 'enviando';
    movementMsg = '';
    const amountCents = movementAmountCents ?? 0;
    if (amountCents <= 0) {
      movementStatus = 'error';
      movementMsg = 'Ingresa un monto mayor a cero.';
      return;
    }
    pendingMovement = buildMovementInput();
    const res = await createCashMovement(pendingMovement);
    if (!res.ok && res.code === 'AUTH_TOKEN_REQUIRED') {
      authzPin = '';
      authzMsg = '';
      authzOpen = true;
      movementStatus = 'esperando-authz';
      movementMsg = 'Este movimiento supera el umbral de la política. Pide el PIN del supervisor.';
      return;
    }
    if (!res.ok) {
      movementStatus = 'error';
      movementMsg = res.message;
      return;
    }
    movementStatus = 'ok';
    movementMsg = 'Movimiento registrado en la caja.';
    movementAmountCents = null;
    movementRef = '';
    movementReason = '';
  }

  async function onAuthorize() {
    authzMsg = '';
    const input = pendingMovement;
    if (!input) {
      authzOpen = false;
      return;
    }
    if (!authzPin.trim()) {
      authzMsg = 'Teclea el PIN del supervisor.';
      return;
    }
    const mint = await mintCashAuthzToken({
      apiBase: input.apiBase,
      authorization: input.authorization,
      pin: authzPin.trim(),
    });
    if (!mint.ok) {
      authzMsg = mint.message;
      return;
    }
    authzOpen = false;
    const retry = await createCashMovement({ ...input, authorizationTokenHash: mint.tokenHash });
    if (!retry.ok) {
      movementStatus = 'error';
      movementMsg = retry.message;
      return;
    }
    movementStatus = 'ok';
    movementMsg = 'Movimiento registrado con autorización de supervisor.';
    movementAmountCents = null;
    movementRef = '';
    movementReason = '';
  }

  async function onReprint() {
    reprintMsg = '';
    reprintOk = false;
    if (!reprintSaleId.trim() || !reprintBranchId.trim()) {
      reprintMsg = 'Ingresa el ID de la venta y la sucursal.';
      return;
    }
    const res = await reprintSale({
      apiBase: resolveApiBase(localStorage),
      authorization: resolveApiAuth(localStorage).authorization ?? '',
      saleId: reprintSaleId.trim(),
      branchId: reprintBranchId.trim(),
      reason: reprintReason.trim() || null,
    });
    if (!res.ok) {
      reprintMsg = res.message;
      return;
    }
    reprintOk = true;
    reprintMsg = `Reimpresión registrada con sello ${res.watermarkLabel}.`;
    reprintSaleId = '';
    reprintReason = '';
  }
</script>

<svelte:head><title>Cierre Z · Caja · KipusPay</title></svelte:head>

<div class="caja-page-container">
  <section class="glass-panel caja-card" data-testid="caja-blind-z">
    <div class="card-header-bar">
      <div>
        <Badge variant="indigo">Control Operativo</Badge>
        <h1 class="page-title">Cierre Z Ciego</h1>
      </div>
      <Button variant="secondary" href="/caja/devolucion" data-testid="caja-link-devolucion">
        <Icon name="arrow-right" size={16} />
        Devolución
      </Button>
    </div>

    <p class="lede-text">
      Ingresa el conteo físico de efectivo por denominación. El sistema calcula lo esperado únicamente al confirmar el arqueo.
    </p>

    {#if !blindOn}
      <StatusMessage tone="warning" data-testid="caja-feature-off">
        <Icon name="alert" size={20} />
        <div>
          <strong>El cierre de caja está desactivado</strong>
          <p>Contacta a tu proveedor para activarlo.</p>
        </div>
      </StatusMessage>
    {:else}
      {#if printOn}
        <div class="preflight-status-card">
          <div class="status-item" data-testid="caja-print-preflight">
            <span class="item-label">Estado de la impresora:</span>
            <span class="item-val">
              {preflightAdapters.length ? preflightAdapters.join(' → ') : 'Detectando hardware…'}
            </span>
          </div>
          <div class="status-item" data-testid="caja-print-pending">
            <span class="item-label">Pendientes de imprimir:</span>
            <Badge variant={outboxPending > 0 ? 'warning' : 'success'}>
              {outboxPending} tickets
            </Badge>
          </div>
        </div>
      {/if}

      <Field label="ID de Sesión de Caja" id="session-id-input" class="session-group">
        <Input
          id="session-id-input"
          bind:value={sessionId}
          data-testid="caja-session-id"
          placeholder="Sesión de caja"
        />
      </Field>

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
                <span class="denom-icon"><Icon name="dollar" size={18} /></span>
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
          <span class="tenant-tag">Tienda: {session.tradeName}</span>
        </div>
        <span class="counted-amount tabular-nums">
          S/ {formatCents(countedLocal)}
        </span>
      </div>

      <Field label="Motivo de diferencia (si aplica)" id="diff-reason-input">
        <Input
          id="diff-reason-input"
          bind:value={reason}
          data-testid="caja-diff-reason"
          placeholder="Ej. Faltante justificado por cambio de billete..."
        />
      </Field>

      <Button
        variant="primary"
        size="full"
        data-testid="caja-confirm-z"
        onclick={onConfirmClose}
        icon="lock"
      >
        Confirmar Cierre Z
      </Button>

      <!-- Status & Revelation Area -->
      {#if status || resultMsg || revealedExpected !== null || revealedDiff !== null}
        <div class="result-revelation-card">
          {#if status}
            <div class="result-header">
              <Badge variant={status === 'cerrado' ? 'success' : status === 'enviando' ? 'warning' : 'danger'}>
                {status}
              </Badge>
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

  <section class="glass-panel caja-card" data-testid="caja-movements">
    <div class="card-header-bar">
      <div>
        <Badge variant="indigo">Control Operativo</Badge>
        <h2 class="page-title">Movimientos de caja</h2>
      </div>
    </div>
    <p class="lede-text">
      Registra ingresos o salidas de efectivo. Los movimientos sobre el umbral de la política requieren el PIN del supervisor.
    </p>
    <div class="movement-grid">
      <Field label="Tipo de movimiento" id="movement-type-input">
        <select id="movement-type-input" bind:value={movementType} data-testid="movement-type" class="denom-qty-input">
          {#each MOVEMENT_TYPES as type}
            <option value={type}>{MOVEMENT_LABELS[type]}</option>
          {/each}
        </select>
      </Field>
      <Field label="Monto (S/)" id="movement-amount-input">
        <MoneyInput id="movement-amount-input" bind:value={movementAmountCents} data-testid="movement-amount" min={1} />
      </Field>
      <Field label="Sucursal" id="movement-branch-input">
        <Input id="movement-branch-input" bind:value={movementBranchId} data-testid="movement-branch" placeholder="Sucursal" />
      </Field>
      <Field label="Referencia (opcional)" id="movement-ref-input">
        <Input id="movement-ref-input" bind:value={movementRef} data-testid="movement-ref" placeholder="Ej. Proveedor A, factura F001-1" />
      </Field>
    </div>
    <Field label="Razón (opcional)" id="movement-reason-input">
      <Input id="movement-reason-input" bind:value={movementReason} data-testid="movement-reason" placeholder="Ej. Cambio para la caja" />
    </Field>
    <Button variant="primary" size="full" data-testid="movement-register" onclick={onRegisterMovement} icon="plus">
      Registrar movimiento
    </Button>
    {#if movementMsg}
      <StatusMessage tone={movementStatus === 'error' ? 'danger' : 'info'} data-testid="movement-msg">
        {movementMsg}
      </StatusMessage>
    {/if}
  </section>

  <section class="glass-panel caja-card" data-testid="caja-reprints">
    <div class="card-header-bar">
      <div>
        <Badge variant="indigo">Control Operativo</Badge>
        <h2 class="page-title">Reimpresión de ticket</h2>
      </div>
    </div>
    <p class="lede-text">
      Reimprime un ticket ya vendido. La copia lleva el sello obligatorio COPIA y queda registrada en la auditoría.
    </p>
    <div class="movement-grid">
      <Field label="ID de venta" id="reprint-sale-input">
        <Input id="reprint-sale-input" bind:value={reprintSaleId} data-testid="reprint-sale-id" placeholder="ID de la venta" />
      </Field>
      <Field label="Sucursal" id="reprint-branch-input">
        <Input id="reprint-branch-input" bind:value={reprintBranchId} data-testid="reprint-branch" placeholder="Sucursal" />
      </Field>
    </div>
    <Field label="Motivo (opcional)" id="reprint-reason-input">
      <Input id="reprint-reason-input" bind:value={reprintReason} data-testid="reprint-reason" placeholder="Ej. El cliente pidió copia" />
    </Field>
    <Button variant="primary" size="full" data-testid="reprint-submit" onclick={onReprint} icon="printer">
      Reimprimir con sello COPIA
    </Button>
    {#if reprintMsg}
      <StatusMessage tone={reprintOk ? 'info' : 'danger'} data-testid="reprint-msg">
        {reprintMsg}
      </StatusMessage>
    {/if}
  </section>

  <Modal
    open={authzOpen}
    title="Autorización de supervisor"
    confirmText="Autorizar"
    confirmTestid="authz-confirm"
    onConfirm={onAuthorize}
    onCancel={() => (authzOpen = false)}
  >
    <p class="quick-hint">
      Este movimiento supera el umbral de la política de caja. El supervisor autoriza con su PIN.
    </p>
    <Field label="PIN del supervisor">
      <Input
        data-testid="authz-pin"
        bind:value={authzPin}
        type="password"
        autocomplete="off"
        placeholder="PIN de 4 dígitos"
      />
    </Field>
    {#if authzMsg}
      <p class="quick-error" role="alert" data-testid="authz-error">{authzMsg}</p>
    {/if}
  </Modal>
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



  .lede-text {
    color: var(--text-muted);
    font-size: 0.9375rem;
    line-height: 1.5;
  }



  .preflight-status-card {
    background: rgba(20, 22, 28, 0.6);
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

  /* Denominations Grid */
  .denom-grid-container {
    background: rgba(20, 22, 28, 0.4);
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



  .result-revelation-card {
    background: rgba(20, 22, 28, 0.8);
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
