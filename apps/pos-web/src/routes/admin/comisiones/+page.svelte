<script lang="ts">
  import { formatCents } from '$lib/cents';
  import { isSalesCommissionsEnabled } from '$lib/features';

  const commissionsOn = isSalesCommissionsEnabled();
  let sellerId = $state('u-seller');
  let ratePercent = $state(5);
  let rateAmountCents = $state<number | null>(null);
  let periodStartIso = $state('2026-08-01');
  let periodEndIso = $state('2026-08-31');
  let payoutId = $state('');
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function upsertRate() {
    message = '';
    const res = await fetch(`${apiBase()}/api/admin/commissions/rates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        sellerId,
        branchId: 'b-demo',
        ratePercent,
        rateAmountCents,
      }),
    });
    const json = (await res.json()) as { rateId?: string; error?: string };
    message = res.ok ? `RATE ${json.rateId}` : (json.error ?? `Error ${res.status}`);
  }

  async function createPayout() {
    message = '';
    const res = await fetch(`${apiBase()}/api/admin/commissions/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        sellerId,
        branchId: 'b-demo',
        periodStartIso,
        periodEndIso,
      }),
    });
    const json = (await res.json()) as {
      payoutId?: string;
      grossCents?: number;
      error?: string;
    };
    if (res.ok && json.payoutId) payoutId = json.payoutId;
    message = res.ok
      ? `PAYOUT OPEN ${json.payoutId} · ${formatCents(json.grossCents ?? 0)}`
      : (json.error ?? `Error ${res.status}`);
  }

  async function payPayout() {
    message = '';
    const res = await fetch(`${apiBase()}/api/admin/commissions/payouts/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ payoutId, branchId: 'b-demo' }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    message = res.ok ? `PAID ${json.status}` : (json.error ?? `Error ${res.status}`);
  }
</script>

<section data-testid="admin-commissions">
  <h1>Comisiones de vendedor</h1>
  {#if !commissionsOn}
    <p data-testid="admin-commissions-off">PUBLIC_FEATURE_SALES_COMMISSIONS desactivado.</p>
  {:else}
    <p>Tasas y payouts — sin nómina. Montos impuestos por el servidor.</p>
    <label>
      Vendedor
      <input bind:value={sellerId} data-testid="comm-seller" />
    </label>
    <label>
      % tasa
      <input type="number" bind:value={ratePercent} data-testid="comm-rate" />
    </label>
    <label>
      Monto fijo (cents, opcional)
      <input
        type="number"
        value={rateAmountCents ?? ''}
        data-testid="comm-amount"
        oninput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          rateAmountCents = v === '' ? null : Number(v);
        }}
      />
    </label>
    <button type="button" data-testid="comm-upsert-rate" onclick={upsertRate}>Guardar tasa</button>
    <label>
      Periodo inicio
      <input bind:value={periodStartIso} data-testid="comm-period-start" />
    </label>
    <label>
      Periodo fin
      <input bind:value={periodEndIso} data-testid="comm-period-end" />
    </label>
    <button type="button" data-testid="comm-create-payout" onclick={createPayout}>
      Crear payout OPEN
    </button>
    <label>
      Payout id
      <input bind:value={payoutId} data-testid="comm-payout-id" />
    </label>
    <button type="button" data-testid="comm-pay" onclick={payPayout}>Marcar PAID</button>
    {#if message}
      <p data-testid="comm-message">{message}</p>
    {/if}
  {/if}
</section>
