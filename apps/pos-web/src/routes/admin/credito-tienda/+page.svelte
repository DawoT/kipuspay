<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const creditOn = isLedgerStoreCreditEnabled();
  let customerId = $state('c-demo');
  let amountCents = $state(100);
  let adjustSign = $state<'CREDIT' | 'DEBIT'>('CREDIT');
  let authorizedByUserId = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';

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
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !creditOn}
    <div class="feature-off-banner" data-testid="admin-store-credit-off">
      <Icon name="info" size={18} />
      <span>El crédito de tienda no está activo para este negocio.</span>
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
          <label for="credit-amount">Monto</label>
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
          <Button variant="primary" icon="check" data-testid="sc-adjust" onclick={adjust}>
          Aplicar ajuste
        </Button>
          <Button variant="danger" icon="clock" data-testid="sc-expire" onclick={expire}>
          Expirar crédito
        </Button>
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








  @media (max-width: 600px) {
    .credit-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
