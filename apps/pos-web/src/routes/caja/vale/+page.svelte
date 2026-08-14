<script lang="ts">
  
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';
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
import { apiFetch } from '$lib/auth/api-client';

  const creditOn = isLedgerStoreCreditEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let customerDoc = $state('20100000000');
  let customerName = $state('Cliente vale');
  let amountCents = $state(11800);
  let message = $state('');
  let messageOk = $state(false);


  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function issueVale() {
    message = '';
    const res = await apiFetch('/api/pos/offline-sale', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        offlineSaleId: crypto.randomUUID(),
        branchId: tenantBranchId(localStorage),
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
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
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="caja-vale-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !creditOn}
    <div class="feature-off-banner" data-testid="caja-vale-off">
      <Icon name="info" size={18} />
      <span>Los vales de consumo no están activos para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-vale-tenant">Tienda: {session.tradeName}</p>

    <div class="glass-card vale-card">
      <CardHeader title="Emitir vale de consumo">
        <span class="badge badge-success">Crédito tienda</span>
      </CardHeader>
      <Field label="RUC / DNI cliente" id="vale-doc">
        <Input id="vale-doc" bind:value={customerDoc} data-testid="caja-vale-customer" />
      </Field>
      <Field label="Nombre o razón social" id="vale-name">
        <Input id="vale-name" bind:value={customerName} data-testid="caja-vale-name" />
      </Field>
      <Field label="Monto del vale" id="vale-amount">
        <Input id="vale-amount" type="number" bind:value={amountCents} data-testid="caja-vale-amount" />
      </Field>
      <Button
        variant="primary"
        data-testid="caja-vale-issue"
        onclick={issueVale}
        icon="gift"
      >
        Emitir vale
      </Button>
    </div>
  {/if}
</div>

<style>
  .vale-card {
    padding: 1.25rem;
    max-width: 30rem;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }
</style>
