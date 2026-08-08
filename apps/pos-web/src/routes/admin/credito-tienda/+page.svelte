<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isLedgerStoreCreditEnabled } from '$lib/features';

  const creditOn = isLedgerStoreCreditEnabled();
  let customerId = $state('c-demo');
  let amountCents = $state(100);
  let adjustSign = $state<'CREDIT' | 'DEBIT'>('CREDIT');
  let authorizedByUserId = $state('');
  let message = $state('');

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
    message = res.ok
      ? `EXPIRADO · saldo ${formatCents(json.nextBalanceCents ?? 0)}`
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
    message = res.ok
      ? `ADJUST ${adjustSign} · saldo ${formatCents(json.nextBalanceCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }
</script>

<section data-testid="admin-store-credit">
  <h1>Crédito de tienda</h1>
  {#if !creditOn}
    <p data-testid="admin-store-credit-off">PUBLIC_FEATURE_LEDGER_STORE_CREDIT desactivado.</p>
  {:else}
    <label>
      Cliente
      <input bind:value={customerId} data-testid="sc-customer" />
    </label>
    <label>
      Monto (cents)
      <input type="number" bind:value={amountCents} data-testid="sc-amount" />
    </label>
    <label>
      Signo
      <select bind:value={adjustSign} data-testid="sc-sign">
        <option value="CREDIT">CREDIT</option>
        <option value="DEBIT">DEBIT</option>
      </select>
    </label>
    <label>
      Autorizado por
      <input bind:value={authorizedByUserId} data-testid="sc-authz" />
    </label>
    <button type="button" data-testid="sc-adjust" onclick={adjust}>Ajustar</button>
    <button type="button" data-testid="sc-expire" onclick={expire}>Expirar</button>
    {#if message}
      <p data-testid="sc-message">{message}</p>
    {/if}
  {/if}
</section>
