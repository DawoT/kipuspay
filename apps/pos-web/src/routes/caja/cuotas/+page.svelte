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

  const installmentsOn = isSalesInstallmentsEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let installmentId = $state('');
  let message = $state('');
  let messageOk = $state(false);
  let lastPaymentId = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

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
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite" data-testid="caja-cuotas-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !installmentsOn}
    <div class="feature-off-banner" data-testid="caja-cuotas-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_SALES_INSTALLMENTS</code> desactivado.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-cuotas-tenant">Tenant {session.tenantId}</p>

    <div class="glass-card cuotas-card">
      <div class="card-header">
        <h2>Cobrar cuota</h2>
        <span class="section-tag">Terminal</span>
      </div>
      <div class="field-group">
        <label for="cuota-id">ID de cuota</label>
        <input id="cuota-id" bind:value={installmentId} data-testid="caja-cuotas-id" placeholder="ID de la cuota a cobrar" />
      </div>
      <button type="button" class="primary" data-testid="caja-cuotas-pay" onclick={() => void payInstallment()} disabled={!installmentId}>
        <Icon name="dollar" size={14} />
        Cobrar cuota
      </button>
    </div>
  {/if}
</div>

<style>
  .cuotas-card {
    padding: 1.25rem;
    max-width: 28rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
</style>
