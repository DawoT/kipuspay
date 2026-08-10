<script lang="ts">
  import { isSalesCommissionsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const commissionsOn = isSalesCommissionsEnabled();
  let sellerId = $state('u-demo');
  let ratePercent = $state(5);
  let rateAmountCents = $state<number | null>(null);
  let periodStartIso = $state(new Date().toISOString().slice(0, 10));
  let periodEndIso = $state(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  let payoutId = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function upsertRate() {
    message = '';
    const res = await fetch(`${apiBase()}/api/commissions/rates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        sellerId,
        ratePercent,
        rateAmountCents,
        branchId: 'b-demo',
      }),
    });
    const json = (await res.json()) as { rateId?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Tasa guardada · ID ${json.rateId}` : (json.error ?? `Error ${res.status}`);
  }

  async function createPayout() {
    message = '';
    const res = await fetch(`${apiBase()}/api/commissions/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ sellerId, periodStartIso, periodEndIso, branchId: 'b-demo' }),
    });
    const json = (await res.json()) as { payoutId?: string; totalCents?: number; error?: string };
    messageOk = res.ok;
    message = res.ok
      ? `Payout creado OPEN · ID ${json.payoutId}`
      : (json.error ?? `Error ${res.status}`);
  }

  async function payPayout() {
    message = '';
    const res = await fetch(`${apiBase()}/api/commissions/payouts/${payoutId}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ payoutId, branchId: 'b-demo' }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `PAID · ${json.status}` : (json.error ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Comisiones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-commissions">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="percent" size={12} /> Ventas · Comisiones</p>
      <h1 class="page-title">Comisiones de vendedor</h1>
      <p class="page-lede">Tasas y payouts — sin nómina. Los montos son fijados exclusivamente por el servidor.</p>
    </div>
  </div>

  {#if message}
    <div class="status-alert {messageOk ? 'info' : 'danger'}" aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </div>
  {/if}

  {#if !commissionsOn}
    <div class="feature-off-banner" data-testid="admin-commissions-off">
      <Icon name="info" size={18} />
      <span><code>PUBLIC_FEATURE_SALES_COMMISSIONS</code> desactivado.</span>
    </div>
  {:else}
    <div class="comm-layout">
      <!-- Tasas -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Tasa de comisión</h2>
          <span class="section-tag">Configuración</span>
        </div>
        <div class="field-group">
          <label for="seller-input">Vendedor</label>
          <input id="seller-input" bind:value={sellerId} data-testid="comm-seller" />
        </div>
        <div class="field-group">
          <label for="rate-pct-input">Porcentaje (%)</label>
          <input id="rate-pct-input" type="number" bind:value={ratePercent} data-testid="comm-rate" min="0" max="100" step="0.1" />
        </div>
        <div class="field-group">
          <label for="rate-amt-input">Monto fijo (cents, opcional)</label>
          <input
            id="rate-amt-input"
            type="number"
            value={rateAmountCents ?? ''}
            data-testid="comm-amount"
            placeholder="Dejar vacío para no aplicar"
            oninput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              rateAmountCents = v === '' ? null : Number(v);
            }}
          />
        </div>
        <button type="button" class="primary" data-testid="comm-upsert-rate" onclick={upsertRate}>
          <Icon name="check" size={14} />
          Guardar tasa
        </button>
      </section>

      <!-- Payout -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Gestión de payout</h2>
          <span class="section-tag">Liquidación</span>
        </div>
        <div class="field-group">
          <label for="payout-start">Período inicio</label>
          <input id="payout-start" type="date" bind:value={periodStartIso} data-testid="comm-period-start" />
        </div>
        <div class="field-group">
          <label for="payout-end">Período fin</label>
          <input id="payout-end" type="date" bind:value={periodEndIso} data-testid="comm-period-end" />
        </div>
        <button type="button" class="primary" data-testid="comm-create-payout" onclick={createPayout}>
          <Icon name="plus" size={14} />
          Crear payout OPEN
        </button>

        <div class="separator"></div>

        <div class="field-group">
          <label for="payout-id-input">Payout ID</label>
          <input id="payout-id-input" bind:value={payoutId} data-testid="comm-payout-id" placeholder="ID del payout creado" />
        </div>
        <button type="button" class="success" data-testid="comm-pay" onclick={payPayout} disabled={!payoutId}>
          <Icon name="check" size={14} />
          Marcar como PAID
        </button>
      </section>
    </div>
  {/if}
</div>

<style>
  .comm-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.875rem;
  }

  .separator {
    border-top: 1px solid var(--border-subtle);
    margin: 0.875rem 0;
  }

  @media (max-width: 600px) {
    .comm-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
