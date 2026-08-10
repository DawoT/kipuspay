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

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
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
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite" data-testid="layaway-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !layawayOn}
    <div class="feature-off-banner" data-testid="caja-layaway-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_SALES_LAYAWAY</code> desactivado.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-layaway-tenant">Tenant {session.tenantId}</p>

    <div class="layaway-layout">
      <!-- Crear -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Nuevo apartado</h2>
          <span class="section-tag">Crear</span>
        </div>
        <div class="field-group">
          <label for="lay-product">Producto</label>
          <input id="lay-product" bind:value={productId} data-testid="layaway-product" />
        </div>
        <div class="field-group">
          <label for="lay-qty">Cantidad (microunidades)</label>
          <input id="lay-qty" type="number" bind:value={enteredMicrounits} data-testid="layaway-qty" />
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="lay-due">Vence</label>
            <input id="lay-due" type="date" bind:value={dueDate} data-testid="layaway-due" />
          </div>
          <div class="field-group">
            <label for="lay-initial">Abono inicial (cents)</label>
            <input id="lay-initial" type="number" bind:value={initialAmountCents} data-testid="layaway-initial" />
          </div>
        </div>
        <button type="button" class="primary" data-testid="layaway-create" onclick={() => void createLayaway()}>
          <Icon name="plus" size={14} />
          Crear apartado
        </button>
      </section>

      <!-- Gestionar -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Gestionar</h2>
          <span class="section-tag">Acciones</span>
        </div>
        <div class="field-group">
          <label for="lay-id">ID apartado</label>
          <input id="lay-id" bind:value={depositId} data-testid="layaway-id" placeholder="ID creado arriba" />
        </div>
        <div class="field-group">
          <label for="lay-extra">Abono extra (cents)</label>
          <input id="lay-extra" type="number" bind:value={extraAmountCents} data-testid="layaway-extra" />
        </div>
        <button type="button" class="primary" data-testid="layaway-deposit" onclick={() => void deposit()} disabled={!depositId}>
          <Icon name="dollar" size={14} />
          Abonar
        </button>

        <div class="separator"></div>

        <div class="field-group">
          <label for="lay-series">Serie al convertir</label>
          <input id="lay-series" bind:value={series} data-testid="layaway-series" />
        </div>
        <button type="button" class="success" data-testid="layaway-convert" onclick={() => void convert()} disabled={!depositId}>
          <Icon name="receipt" size={14} />
          Convertir a venta
        </button>

        <div class="separator"></div>

        <div class="field-group">
          <label for="lay-reason">Motivo cancelación</label>
          <input id="lay-reason" bind:value={reason} data-testid="layaway-reason" placeholder="Opcional" />
        </div>
        <button type="button" class="secondary danger-sec" data-testid="layaway-cancel" onclick={() => void cancel()} disabled={!depositId}>
          <Icon name="x" size={14} />
          Cancelar
        </button>
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
  .section-pad { padding: 1.25rem; }
  .field-group { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.875rem; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .separator { border-top: 1px solid var(--border-subtle); margin: 0.875rem 0; }
  .tenant-line { font-size: 0.8125rem; color: var(--text-dim); font-family: var(--font-mono); }
  .danger-sec { border-color: rgba(217, 106, 60, 0.35); color: var(--rose-red); }
  .danger-sec:hover { background: rgba(217, 106, 60, 0.1); border-color: var(--rose-red); }
  @media (max-width: 600px) { .layaway-layout { grid-template-columns: 1fr; } .two-col { grid-template-columns: 1fr; } }
</style>
