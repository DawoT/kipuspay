<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesLayawayEnabled } from '$lib/features';
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
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

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
  let messageOk = $state(false);

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';
  const headers = () => ({ 'content-type': 'application/json', authorization: auth() });

  onMount(() => { session = readTenantSession(sessionStorage); });

  async function createLayaway() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({
        branchId: 'b-demo', cashRegisterSessionId: 's-demo', dueDateIso: dueDate,
        initialAmountCents, paymentMethod: 'cash',
        items: [{ productId, enteredQuantityMicrounits: enteredMicrounits }],
      }),
    });
    const json = (await res.json()) as { depositId?: string; snapshotTotalCents?: number; emitsFiscalDocument?: boolean; error?: string };
    messageOk = res.ok;
    if (!res.ok) { message = json.error ?? `Error ${res.status}`; return; }
    depositId = json.depositId ?? '';
    message = `Apartado ${depositId} · snapshot S/ ${formatCents(json.snapshotTotalCents ?? 0)} · CPE=${json.emitsFiscalDocument}`;
  }

  async function deposit() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/deposit`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ depositId, cashRegisterSessionId: 's-demo', paymentMethod: 'cash', amountCents: extraAmountCents }),
    });
    const json = (await res.json()) as { balanceAfterCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Abono OK · saldo S/ ${formatCents(json.balanceAfterCents ?? 0)}` : (json.error ?? `Error ${res.status}`);
  }

  async function convert() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/convert`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ depositId, cashRegisterSessionId: 's-demo', series, documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03' }),
    });
    const json = (await res.json()) as { saleId?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Convertido a venta ${json.saleId}` : (json.error ?? `Error ${res.status}`);
  }

  async function cancel() {
    message = '';
    const res = await fetch(`${apiBase()}/api/sales/layaways/cancel`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ depositId, cashRegisterSessionId: 's-demo', reason }),
    });
    const json = (await res.json()) as { refundCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Cancelado · reembolso S/ ${formatCents(json.refundCents ?? 0)}` : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Apartados · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-apartado">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="gift" size={12} /> Ventas · Apartados</p>
      <h1 class="page-title">Apartado</h1>
      <p class="page-lede">Reserva mercadería y cobra adelantos. El comprobante nace solo al convertir a venta.</p>
    </div>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="layaway-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !layawayOn}
    <div class="feature-off-banner" data-testid="caja-layaway-off">
      <Icon name="info" size={18} />
      <span>Los apartados no están activos para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-layaway-tenant">Tienda: {session.tradeName}</p>

    <div class="layaway-layout">
      <!-- Crear -->
      <section class="glass-card section-pad">
        <CardHeader title="Nuevo apartado">
          <span class="section-tag">Crear</span>
        </CardHeader>
        <Field label="Producto" id="lay-product">
          <Input id="lay-product" bind:value={productId} data-testid="layaway-product" />
        </Field>
        <Field label="Cantidad" id="lay-qty">
          <input id="lay-qty" type="number" bind:value={enteredMicrounits} data-testid="layaway-qty" />
        </Field>
        <div class="two-col">
          <Field label="Vence" id="lay-due">
            <input id="lay-due" type="date" bind:value={dueDate} data-testid="layaway-due" />
          </Field>
          <Field label="Abono inicial" id="lay-initial">
            <MoneyInput id="lay-initial" bind:value={initialAmountCents} data-testid="layaway-initial" min={1} />
          </Field>
        </div>
        <Button
          variant="primary"
          data-testid="layaway-create"
          onclick={() => void createLayaway()}
          icon="plus"
        >
          Crear apartado
        </Button>
      </section>

      <!-- Gestionar -->
      <section class="glass-card section-pad">
        <CardHeader title="Gestionar">
          <span class="section-tag">Acciones</span>
        </CardHeader>
        <Field label="ID apartado" id="lay-id">
          <Input id="lay-id" bind:value={depositId} data-testid="layaway-id" placeholder="ID creado arriba" />
        </Field>
        <Field label="Abono extra" id="lay-extra">
          <MoneyInput id="lay-extra" bind:value={extraAmountCents} data-testid="layaway-extra" min={1} />
        </Field>
        <Button
          variant="primary"
          data-testid="layaway-deposit"
          onclick={() => void deposit()}
          disabled={!depositId}
          icon="dollar"
        >
          Abonar
        </Button>

        <div class="separator"></div>

        <Field label="Serie al convertir" id="lay-series">
          <Input id="lay-series" bind:value={series} data-testid="layaway-series" />
        </Field>
        <Button
          variant="success"
          data-testid="layaway-convert"
          onclick={() => void convert()}
          disabled={!depositId}
          icon="receipt"
        >
          Convertir a venta
        </Button>

        <div class="separator"></div>

        <Field label="Motivo cancelación" id="lay-reason">
          <Input id="lay-reason" bind:value={reason} data-testid="layaway-reason" placeholder="Opcional" />
        </Field>
        <Button
          variant="danger"
          data-testid="layaway-cancel"
          onclick={() => void cancel()}
          disabled={!depositId}
          icon="x"
        >
          Cancelar
        </Button>
      </section>
    </div>
  {/if}
</div>

<style>
  .layaway-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }
  .separator { border-top: 1px solid var(--border-subtle); margin: 0.875rem 0; }
  .tenant-line { font-size: 0.8125rem; color: var(--text-dim); font-family: var(--font-mono); }
  @media (max-width: 600px) { .layaway-layout { grid-template-columns: 1fr; }  }
</style>
