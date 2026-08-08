<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const creditOn = isLedgerStoreCreditEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let customerDoc = $state('20100000000');
  let customerName = $state('Cliente vale');
  let amountCents = $state(11800);
  let message = $state('');

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
    if (!res.ok) {
      message = json.error ?? json.code ?? `Error ${res.status}`;
      return;
    }
    message = `Venta vale ${json.saleId ?? ''} · S/ ${formatCents(json.authoritativeTotalAmount ?? amountCents)} (doc+cupo)`;
  }
</script>

<section data-testid="caja-vale">
  <h1>Vale / gift card</h1>
  <p class="lede">
    La venta del vale se registra como venta (doc + cupo). El saldo lo impone el servidor.
  </p>
  {#if !creditOn}
    <p data-testid="caja-vale-off">PUBLIC_FEATURE_LEDGER_STORE_CREDIT desactivado.</p>
  {:else}
    <p data-testid="caja-vale-tenant">Tenant {session.tenantId}</p>
    <label>
      Documento cliente
      <input bind:value={customerDoc} data-testid="caja-vale-customer" />
    </label>
    <label>
      Nombre
      <input bind:value={customerName} data-testid="caja-vale-name" />
    </label>
    <label>
      Monto (cents)
      <input type="number" bind:value={amountCents} data-testid="caja-vale-amount" />
    </label>
    <button type="button" data-testid="caja-vale-issue" onclick={issueVale}>Emitir vale</button>
    {#if message}
      <p data-testid="caja-vale-msg">{message}</p>
    {/if}
  {/if}
</section>
