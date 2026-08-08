<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesInstallmentsEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const installmentsOn = isSalesInstallmentsEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let installmentId = $state('');
  let message = $state('');
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
    if (!res.ok) {
      message = json.error ?? json.code ?? `Error ${res.status}`;
      return;
    }
    lastPaymentId = json.paymentId ?? '';
    message = `Pago ${lastPaymentId} · CxC −S/ ${formatCents(json.appliedToArCents ?? 0)} · interés S/ ${formatCents(json.interestCents ?? 0)}`;
  }
</script>

<section data-testid="caja-cuotas">
  <h1>Cuotas / pago en partes</h1>
  <p class="lede">
    Solo Supervisor+ cobra cuotas. El servidor aplica el principal a CxC; el interés no reduce el AR.
  </p>
  {#if !installmentsOn}
    <p data-testid="caja-cuotas-off">PUBLIC_FEATURE_SALES_INSTALLMENTS desactivado.</p>
  {:else}
    <p data-testid="caja-cuotas-tenant">Tenant {session.tenantId}</p>
    <label>
      ID cuota
      <input bind:value={installmentId} data-testid="caja-cuotas-id" />
    </label>
    <button type="button" data-testid="caja-cuotas-pay" onclick={() => void payInstallment()}
      >Cobrar cuota</button
    >
    {#if message}
      <p data-testid="caja-cuotas-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  section {
    max-width: 28rem;
    padding: 1.25rem;
  }
  .lede {
    color: #444;
    margin-bottom: 1rem;
  }
  label {
    display: block;
    margin-bottom: 0.75rem;
  }
  input {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
  }
</style>
