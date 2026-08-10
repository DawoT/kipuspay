<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';

  const creditOn = isLedgerStoreCreditEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let customerDoc = $state('20100000000');
  let customerName = $state('Cliente vale');
  let amountCents = $state(11800);
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function issueVale() {
    message = '';
    const res = await fetch(`${apiBase()}/api/pos/offline-sale`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        offlineSaleId: crypto.randomUUID(),
        branchId: 'b-demo',
        cashRegisterSessionId: 's-demo',
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
        series: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV01' : 'B001',
        clientDocumentType: '6',
        clientDocumentNumber: customerDoc,
        clientName: customerName,
        storeCreditIssue: true,
        items: [{ productId: 'p1', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm-cash', amountCents }],
      }),
    });
    const json = (await res.json()) as {
      saleId?: string;
      authoritativeTotalAmount?: number;
      error?: string;
      code?: string;
    };
    messageOk = res.ok;
    if (!res.ok) {
      message = json.error ?? json.code ?? `Error ${res.status}`;
      return;
    }
    message = `Venta vale ${json.saleId ?? ''} · S/ ${formatCents(json.authoritativeTotalAmount ?? amountCents)} (doc+cupo)`;
  }
</script>

<svelte:head><title>Vale / Gift card · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-vale">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="gift" size={12} /> Caja · Crédito de tienda</p>
      <h1 class="page-title">Vale / Gift card</h1>
      <p class="page-lede">La venta del vale se registra como comprobante con cupo. El saldo lo impone el servidor.</p>
    </div>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite" data-testid="caja-vale-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !creditOn}
    <div class="feature-off-banner" data-testid="caja-vale-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_LEDGER_STORE_CREDIT</code> desactivado.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-vale-tenant">Tenant {session.tenantId}</p>

    <div class="glass-card vale-card">
      <div class="card-header">
        <h2>Emitir vale de consumo</h2>
        <span class="badge badge-success">Crédito tienda</span>
      </div>
      <div class="field-group">
        <label for="vale-doc">RUC / DNI cliente</label>
        <input id="vale-doc" bind:value={customerDoc} data-testid="caja-vale-customer" />
      </div>
      <div class="field-group">
        <label for="vale-name">Nombre o razón social</label>
        <input id="vale-name" bind:value={customerName} data-testid="caja-vale-name" />
      </div>
      <div class="field-group">
        <label for="vale-amount">Monto del vale (céntimos)</label>
        <input id="vale-amount" type="number" bind:value={amountCents} data-testid="caja-vale-amount" />
      </div>
      <button type="button" class="primary" data-testid="caja-vale-issue" onclick={issueVale}>
        <Icon name="gift" size={14} />
        Emitir vale
      </button>
    </div>
  {/if}
</div>

<style>
  .vale-card {
    padding: 1.25rem;
    max-width: 30rem;
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
