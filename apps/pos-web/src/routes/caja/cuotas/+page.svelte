<script lang="ts">
  import { onMount } from 'svelte';
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { formatCents } from '$lib/cents';
  import { isSalesInstallmentsEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { salesErrorCopy } from '$lib/ui/ops-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { apiFetch } from '$lib/auth/api-client';

  const installmentsOn = isSalesInstallmentsEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let installmentId = $state('');
  let message = $state('');
  let messageOk = $state(false);
  let lastPaymentId = $state('');

  let saleId = $state('');
  let installmentCount = $state(2);
  let installmentPrincipalCents = $state<number | null>(10000);
  let downPaymentCents = $state<number | null>(0);

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function createPlan() {
    message = '';
    const count = Math.max(1, Math.min(24, Number(installmentCount) || 1));
    const principal = installmentPrincipalCents ?? 0;
    if (principal < 1) {
      message = 'Indica el monto de cada cuota.';
      messageOk = false;
      return;
    }
    const items = Array.from({ length: count }, (_, index) => ({
      installmentNumber: index + 1,
      principalCents: principal,
      interestCents: 0,
    }));
    const res = await apiFetch('/api/sales/installments', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        saleId,
        branchId: tenantBranchId(localStorage),
        downPaymentCents: downPaymentCents ?? 0,
        items,
      }),
    });
    const json = (await res.json()) as { planId?: string; error?: string; code?: string };
    messageOk = res.ok;
    message = res.ok ? `Plan creado · ${json.planId ?? 'ok'}` : salesErrorCopy(json.error ?? json.code);
  }

  async function payInstallment() {
    message = '';
    const res = await apiFetch('/api/sales/installments/pay', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installmentId,
        branchId: tenantBranchId(localStorage),
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
        paymentMethod: 'cash',
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const json = (await res.json()) as {
      paymentId?: string;
      appliedToArCents?: number;
      interestCents?: number;
      error?: string;
      code?: string;
    };
    messageOk = res.ok;
    if (!res.ok) {
      message = salesErrorCopy(json.error ?? json.code);
      return;
    }
    lastPaymentId = json.paymentId ?? '';
    message = `Pago registrado · deuda −S/ ${formatCents(json.appliedToArCents ?? 0)} · interés S/ ${formatCents(json.interestCents ?? 0)}`;
  }
</script>

<svelte:head><title>Cuotas · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-cuotas">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="calendar" size={12} /> Ventas · Cuotas</p>
      <h1 class="page-title">Pago de cuotas</h1>
      <p class="page-lede">Solo un supervisor o dueño cobra cuotas. El capital baja la deuda; el interés no.</p>
    </div>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="caja-cuotas-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !installmentsOn}
    <div class="feature-off-banner" data-testid="caja-cuotas-off">
      <Icon name="info" size={18} />
      <span>Las cuotas no están activas para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-cuotas-tenant">Tienda: {session.tradeName}</p>

    <div class="workbench-2col">
    <div class="ledger-card cuotas-card">
      <CardHeader title="Crear plan de cuotas">
        <span class="section-tag">Supervisor+</span>
      </CardHeader>
      <Field label="ID de venta" id="cuota-sale">
        <Input id="cuota-sale" bind:value={saleId} data-testid="caja-cuotas-sale" placeholder="ID de la venta" />
      </Field>
      <Field label="Cuota inicial" id="cuota-down">
        <MoneyInput id="cuota-down" bind:value={downPaymentCents} data-testid="caja-cuotas-down" />
      </Field>
      <Field label="Número de cuotas" id="cuota-count">
        <Input id="cuota-count" type="number" bind:value={installmentCount} data-testid="caja-cuotas-count" />
      </Field>
      <Field label="Monto de cada cuota" id="cuota-items">
        <MoneyInput id="cuota-items" bind:value={installmentPrincipalCents} data-testid="caja-cuotas-items" />
      </Field>
      <Button
        variant="secondary"
        data-testid="caja-cuotas-create"
        onclick={() => void createPlan()}
        disabled={!saleId}
        icon="plus"
      >
        Crear plan
      </Button>
    </div>

    <div class="ledger-card cuotas-card">
      <CardHeader title="Cobrar cuota">
        <span class="section-tag">Terminal</span>
      </CardHeader>
      <Field label="ID de cuota" id="cuota-id">
        <Input id="cuota-id" bind:value={installmentId} data-testid="caja-cuotas-id" placeholder="ID de la cuota a cobrar" />
      </Field>
      <Button
        variant="primary"
        data-testid="caja-cuotas-pay"
        onclick={() => void payInstallment()}
        disabled={!installmentId}
        icon="dollar"
      >
        Cobrar cuota
      </Button>
    </div>
    </div>
  {/if}
</div>

<style>
  .cuotas-card {
    padding: var(--inset-card);
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
</style>
