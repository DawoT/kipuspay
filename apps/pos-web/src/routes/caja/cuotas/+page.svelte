<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesInstallmentsEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const installmentsOn = isSalesInstallmentsEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let installmentId = $state('');
  let message = $state('');
  let messageOk = $state(false);
  let lastPaymentId = $state('');

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function payInstallment() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/installments/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        installmentId,
        branchId: 'b-demo',
        cashRegisterSessionId: 's-demo',
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
      message = json.error ?? json.code ?? `Error ${res.status}`;
      return;
    }
    lastPaymentId = json.paymentId ?? '';
    message = `Pago ${lastPaymentId} · CxC −S/ ${formatCents(json.appliedToArCents ?? 0)} · interés S/ ${formatCents(json.interestCents ?? 0)}`;
  }
</script>

<svelte:head><title>Cuotas · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-cuotas">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="calendar" size={12} /> Ventas · Cuotas</p>
      <h1 class="page-title">Pago de cuotas</h1>
      <p class="page-lede">Solo Supervisor+ cobra cuotas. El principal va a CxC; el interés no reduce el AR.</p>
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

    <div class="glass-card cuotas-card">
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
  {/if}
</div>

<style>
  .cuotas-card {
    padding: 1.25rem;
    max-width: 28rem;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
</style>
