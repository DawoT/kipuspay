<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesLayawayEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const layawayOn = isSalesLayawayEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let productId = $state('p1');
  let enteredMicrounits = $state(1_000_000);
  let dueDate = $state('2026-08-20');
  let initialAmountCents = $state(500);
  let depositId = $state('');
  let extraAmountCents = $state(200);
  let series = $state('NV01');
  let reason = $state('');
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function createLayaway() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        branchId: 'b-demo',
        cashRegisterSessionId: 's-demo',
        dueDateIso: dueDate,
        initialAmountCents,
        paymentMethod: 'cash',
        items: [{ productId, enteredQuantityMicrounits: enteredMicrounits }],
      }),
    });
    const json = (await res.json()) as {
      depositId?: string;
      snapshotTotalCents?: number;
      emitsFiscalDocument?: boolean;
      error?: string;
    };
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      return;
    }
    depositId = json.depositId ?? '';
    message = `Apartado ${depositId} · snapshot S/ ${formatCents(json.snapshotTotalCents ?? 0)} · CPE=${json.emitsFiscalDocument}`;
  }

  async function deposit() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/deposit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        depositId,
        cashRegisterSessionId: 's-demo',
        paymentMethod: 'cash',
        amountCents: extraAmountCents,
      }),
    });
    const json = (await res.json()) as { balanceAfterCents?: number; error?: string };
    message = res.ok
      ? `Abono ok · saldo S/ ${formatCents(json.balanceAfterCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }

  async function convert() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/convert`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        depositId,
        cashRegisterSessionId: 's-demo',
        series,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
      }),
    });
    const json = (await res.json()) as { saleId?: string; error?: string };
    message = res.ok ? `Convertido a venta ${json.saleId}` : (json.error ?? `Error ${res.status}`);
  }

  async function cancel() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/cancel`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        depositId,
        cashRegisterSessionId: 's-demo',
        reason,
      }),
    });
    const json = (await res.json()) as { refundCents?: number; error?: string };
    message = res.ok
      ? `Cancelado · reembolso S/ ${formatCents(json.refundCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Apartados · KipusPay</title></svelte:head>

<section class="caja-layaway" data-testid="caja-apartado">
  <h1>Apartado</h1>
  <p class="lede">
    Reserva mercadería y cobra adelantos. El comprobante nace solo al convertir a venta.
  </p>

  {#if !layawayOn}
    <p class="off" data-testid="caja-layaway-off">
      PUBLIC_FEATURE_SALES_LAYAWAY desactivado. Activá el flag para apartados en caja.
    </p>
  {:else}
    <p data-testid="caja-layaway-tenant">Tenant {session.tenantId}</p>
    <label>
      Producto
      <input bind:value={productId} data-testid="layaway-product" />
    </label>
    <label>
      Cantidad (microunidades)
      <input type="number" bind:value={enteredMicrounits} data-testid="layaway-qty" />
    </label>
    <label>
      Vence
      <input bind:value={dueDate} data-testid="layaway-due" />
    </label>
    <label>
      Abono inicial (cents)
      <input type="number" bind:value={initialAmountCents} data-testid="layaway-initial" />
    </label>
    <button type="button" data-testid="layaway-create" onclick={() => void createLayaway()}
      >Crear apartado</button
    >

    <label>
      ID apartado
      <input bind:value={depositId} data-testid="layaway-id" />
    </label>
    <label>
      Abono extra (cents)
      <input type="number" bind:value={extraAmountCents} data-testid="layaway-extra" />
    </label>
    <button type="button" data-testid="layaway-deposit" onclick={() => void deposit()}>Abonar</button>
    <label>
      Serie al convertir
      <input bind:value={series} data-testid="layaway-series" />
    </label>
    <button type="button" data-testid="layaway-convert" onclick={() => void convert()}
      >Convertir a venta</button
    >
    <label>
      Motivo cancelación
      <input bind:value={reason} data-testid="layaway-reason" />
    </label>
    <button type="button" data-testid="layaway-cancel" onclick={() => void cancel()}>Cancelar</button>
    {#if message}
      <p data-testid="layaway-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-layaway {
    padding: 1.25rem;
    max-width: 32rem;
  }
  .lede,
  .off {
    color: #5b6773;
  }
  label {
    display: block;
    margin: 0.75rem 0;
  }
  input {
    width: 100%;
  }
  button {
    margin: 0.35rem 0.35rem 0.35rem 0;
  }
</style>
