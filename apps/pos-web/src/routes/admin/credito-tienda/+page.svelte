<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const creditOn = isLedgerStoreCreditEnabled();
  let customerId = $state('c-demo');
  let amountCents = $state(100);
  let adjustSign = $state<'CREDIT' | 'DEBIT'>('CREDIT');
  let authorizedByUserId = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function expire() {
    message = '';
    const res = await fetch(`${apiBase()}/api/ledger/store-credit/expire`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ customerId, branchId: 'b-demo' }),
    });
    const json = (await res.json()) as { nextBalanceCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok
      ? `Crédito expirado · saldo ${formatCents(json.nextBalanceCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }

  async function adjust() {
    message = '';
    const res = await fetch(`${apiBase()}/api/ledger/store-credit/adjust`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        customerId,
        branchId: 'b-demo',
        amountCents,
        adjustSign,
        authorizedByUserId: authorizedByUserId || null,
      }),
    });
    const json = (await res.json()) as { nextBalanceCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok
      ? `Ajuste ${adjustSign} aplicado · saldo ${formatCents(json.nextBalanceCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Crédito de tienda · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-store-credit">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="dollar" size={12} /> Ventas · Crédito tienda</p>
      <h1 class="page-title">Crédito de tienda</h1>
      <p class="page-lede">Gestión de saldo de crédito del cliente — ajustes, expiración y consulta.</p>
    </div>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !creditOn}
    <div class="feature-off-banner" data-testid="admin-store-credit-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_LEDGER_STORE_CREDIT</code> desactivado.</span>
    </div>
  {:else}
    <div class="credit-layout">
      <!-- Contexto -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Cliente</h2>
          <span class="section-tag">Identificación</span>
        </div>
        <div class="field-group">
          <label for="credit-customer">ID de cliente</label>
          <input id="credit-customer" bind:value={customerId} data-testid="sc-customer" />
        </div>
      </section>

      <!-- Ajuste -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Ajuste de saldo</h2>
          <span class="badge {adjustSign === 'CREDIT' ? 'badge-success' : 'badge-danger'}">
            {adjustSign}
          </span>
        </div>
        <div class="field-group">
          <label for="credit-amount">Monto (cents)</label>
          <input id="credit-amount" type="number" bind:value={amountCents} data-testid="sc-amount" min="1" />
        </div>
        <div class="field-group">
          <label for="credit-sign">Tipo de ajuste</label>
          <select id="credit-sign" bind:value={adjustSign} data-testid="sc-sign">
            <option value="CREDIT">CREDIT — Agregar saldo</option>
            <option value="DEBIT">DEBIT — Reducir saldo</option>
          </select>
        </div>
        <div class="field-group">
          <label for="credit-authz">Autorizado por (ID usuario)</label>
          <input id="credit-authz" bind:value={authorizedByUserId} data-testid="sc-authz" placeholder="Opcional" />
        </div>
        <div class="btn-row">
          <button type="button" class="primary" data-testid="sc-adjust" onclick={adjust}>
            <Icon name="check" size={14} />
            Aplicar ajuste
          </button>
          <button type="button" class="secondary danger-sec" data-testid="sc-expire" onclick={expire}>
            <Icon name="clock" size={14} />
            Expirar crédito
          </button>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .credit-layout {
    display: grid;
    grid-template-columns: minmax(240px, 0.6fr) 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad {
    padding: 1.25rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .btn-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .danger-sec {
    border-color: rgba(217, 106, 60, 0.35);
    color: var(--rose-red);
  }

  .danger-sec:hover {
    background: rgba(217, 106, 60, 0.1);
    border-color: var(--rose-red);
  }

  @media (max-width: 600px) {
    .credit-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
