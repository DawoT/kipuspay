<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isLoyaltyPointsEnabled,
    isMessagingWhatsAppEnabled,
    isPaymentsCardAcquirerEnabled,
    isPaymentsQrWalletsEnabled,
    isPosCheckoutEnabled,
    isPricingPromotionsEnabled,
  } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  /** Copy normativa §5.4 edge 2B (misma cadena que MANUAL_CAPTURE_AMBER_COPY). */
  const MANUAL_CAPTURE_AMBER_COPY =
    'Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto';

  const checkoutOn = isPosCheckoutEnabled();
  const walletsOn = isPaymentsQrWalletsEnabled();
  const cardsOn = isPaymentsCardAcquirerEnabled();
  const whatsappOn = isMessagingWhatsAppEnabled();
  const loyaltyOn = isLoyaltyPointsEnabled();
  const promosOn = isPricingPromotionsEnabled();

  let methodCode = $state('cash');
  /** M4: fuente de verdad = navigator.onLine (nunca inventar online). */
  let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
  let paymentMethodId = $state('pm-cash');
  let captureId = $state('');
  let message = $state('');
  let amber = $state('');
  let promotionId = $state('');

  let customerId = $state('cust-demo');
  let saleIdempotencyKey = $state(`sale-${Date.now()}`);
  let loyaltyPoints = $state(10);
  let authzTokenHash = $state('');
  let waOptedIn = $state(true);
  let loyaltyMsg = $state('');
  let waMsg = $state('');

  onMount(() => {
    const apply = () => {
      online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    };
    apply();
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    return () => {
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
  });

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  function methodAllowed(): boolean {
    if (methodCode === 'cash' || methodCode === 'card_manual' || methodCode === 'credit') {
      return checkoutOn;
    }
    if (methodCode === 'yape' || methodCode === 'plin' || methodCode === 'mercadopago_qr') {
      return walletsOn;
    }
    if (methodCode === 'culqi' || methodCode === 'niubiz') return cardsOn;
    return false;
  }

  function captureStatusForEnqueue(): 'API' | 'MANUAL' | undefined {
    const electronic = ['yape', 'plin', 'mercadopago_qr', 'culqi', 'niubiz'].includes(methodCode);
    if (!electronic) return undefined;
    if (!online) {
      amber = MANUAL_CAPTURE_AMBER_COPY;
      return 'MANUAL';
    }
    amber = '';
    return 'API';
  }

  async function chargeOnline() {
    message = '';
    amber = '';
    if (!methodAllowed()) {
      message = 'Método desactivado por feature flag';
      return;
    }
    if (!online) {
      amber = MANUAL_CAPTURE_AMBER_COPY;
      message = `Cola offline con captureStatus=MANUAL · ${captureStatusForEnqueue()}`;
      return;
    }
    const res = await fetch(`${apiBase()}/api/payments/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        saleId: 'sale-demo',
        salePaymentId: 'sp-demo',
        paymentMethodId,
        amountCents: 1000,
        idempotencyKey: `demo-${Date.now()}`,
      }),
    });
    const json = (await res.json()) as {
      captureId?: string;
      status?: string;
      error?: string;
    };
    if (res.ok && json.captureId) captureId = json.captureId;
    message = res.ok ? `Captura ${json.captureId} · ${json.status}` : (json.error ?? 'error');
  }

  async function reserveLoyalty() {
    loyaltyMsg = '';
    if (!loyaltyOn) {
      loyaltyMsg = 'FEATURE_LOYALTY_POINTS off';
      return;
    }
    if (!online) {
      loyaltyMsg = 'Canje offline-originado deshabilitado — reserva solo en línea';
      return;
    }
    const res = await fetch(`${apiBase()}/api/loyalty/reserve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        customerId,
        saleIdempotencyKey,
        points: loyaltyPoints,
        discountAuthorizationTokenHash: authzTokenHash || undefined,
      }),
    });
    const json = (await res.json()) as { id?: string; status?: string; error?: string };
    loyaltyMsg = res.ok
      ? `Reserva ${json.id} · ${json.status} (authz ${authzTokenHash ? 'ok' : 'requerida al cobrar'})`
      : (json.error ?? 'error');
  }

  async function saveWhatsAppOptIn() {
    waMsg = '';
    if (!whatsappOn) {
      waMsg = 'FEATURE_MESSAGING_WHATSAPP off';
      return;
    }
    const res = await fetch(`${apiBase()}/api/messaging/opt-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ customerId, optedIn: waOptedIn }),
    });
    const json = (await res.json()) as { optedIn?: boolean; error?: string };
    waMsg = res.ok ? `Opt-in WhatsApp = ${json.optedIn}` : (json.error ?? 'error');
  }
</script>

<svelte:head><title>Cobro · Caja · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-cobro-local">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="credit-card" size={12} /> Caja · Cobro</p>
      <h1 class="page-title">Cobro local</h1>
      <p class="page-lede">Efectivo, Yape/Plin/MP QR o tarjeta Culqi/Niubiz. Montos los impone el servidor.</p>
    </div>
    <div class="connection-badge" class:offline={!online}>
      <Icon name={online ? 'wifi' : 'wifi-off'} size={14} />
      <span>{online ? 'En línea' : 'Sin conexión'}</span>
    </div>
  </div>

  {#if !checkoutOn && !walletsOn && !cardsOn}
    <div class="feature-off-banner" data-testid="caja-cobro-off">
      <Icon name="info" size={18} />
      <span>Activa flags de cobro / wallets / tarjeta para operar.</span>
    </div>
  {:else}
    {#if amber}
      <div class="status-alert warning" role="alert" data-testid="caja-cobro-amber">
        <Icon name="alert" size={16} />
        <span>{amber}</span>
      </div>
    {/if}
    {#if message}
      <div class="status-alert info" aria-live="polite" data-testid="caja-cobro-msg">
        <Icon name="check" size={16} />
        <span>{message}</span>
      </div>
    {/if}

    <div class="cobro-grid">
      <!-- Método de pago -->
      <div class="glass-card section-pad">
        <div class="card-header">
          <h2>Método de pago</h2>
          <Icon name="credit-card" size={16} />
        </div>
        <div class="field-group">
          <label for="cobro-method">Selecciona método</label>
          <select id="cobro-method" bind:value={methodCode} data-testid="caja-cobro-method">
            <option value="cash">Efectivo</option>
            {#if walletsOn}
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
              <option value="mercadopago_qr">Mercado Pago QR</option>
            {/if}
            {#if cardsOn}
              <option value="culqi">Culqi</option>
              <option value="niubiz">Niubiz</option>
            {/if}
            <option value="card_manual">Tarjeta manual</option>
          </select>
        </div>
        <div class="field-group">
          <label for="cobro-pmid">ID método de pago</label>
          <input id="cobro-pmid" bind:value={paymentMethodId} data-testid="caja-cobro-pm-id" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" checked={online} disabled data-testid="caja-cobro-online" />
          <span>En línea (detectado por el navegador)</span>
        </label>
        <button type="button" class="primary charge-btn" data-testid="caja-cobro-charge" onclick={chargeOnline}>
          <Icon name="credit-card" size={14} />
          Cobrar
        </button>
        {#if captureId}
          <div class="capture-box" data-testid="caja-cobro-capture">
            <Icon name="check" size={14} />
            <span class="capture-id">QR / captura: {captureId} (PENDING→CAPTURED)</span>
          </div>
        {/if}
      </div>

      <!-- Cliente, WhatsApp y Puntos -->
      {#if whatsappOn || loyaltyOn}
        <div class="glass-card section-pad">
          <div class="card-header">
            <h2>Cliente</h2>
            <Icon name="user" size={16} />
          </div>
          <div class="field-group">
            <label for="cobro-customer">ID Cliente</label>
            <input id="cobro-customer" bind:value={customerId} data-testid="caja-customer-id" />
          </div>
          {#if whatsappOn}
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={waOptedIn} data-testid="caja-wa-optin" />
              <span>Opt-in WhatsApp (comprobante)</span>
            </label>
            <button type="button" class="secondary" data-testid="caja-wa-save" onclick={saveWhatsAppOptIn}>
              Guardar opt-in
            </button>
            {#if waMsg}
              <p class="result-note" data-testid="caja-wa-msg">{waMsg}</p>
            {/if}
          {/if}

          {#if loyaltyOn}
            <div class="field-group" style="margin-top:1rem">
              <label for="cobro-loyalty-key">Sale idempotency key</label>
              <input id="cobro-loyalty-key" bind:value={saleIdempotencyKey} data-testid="caja-loyalty-key" />
            </div>
            <div class="two-col">
              <div class="field-group">
                <label for="cobro-loyalty-pts">Puntos a reservar</label>
                <input id="cobro-loyalty-pts" type="number" bind:value={loyaltyPoints} data-testid="caja-loyalty-points" />
              </div>
              <div class="field-group">
                <label for="cobro-loyalty-authz">Authz token hash (canje)</label>
                <input id="cobro-loyalty-authz" bind:value={authzTokenHash} data-testid="caja-loyalty-authz" />
              </div>
            </div>
            <button type="button" class="secondary" data-testid="caja-loyalty-reserve" onclick={reserveLoyalty}>
              Reservar puntos
            </button>
            {#if loyaltyMsg}
              <p class="result-note" data-testid="caja-loyalty-msg">{loyaltyMsg}</p>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- Promociones -->
      {#if promosOn}
        <div class="glass-card section-pad">
          <div class="card-header">
            <h2>Promoción</h2>
            <Icon name="percent" size={16} />
          </div>
          <div class="field-group">
            <label for="cobro-promo">ID de promoción</label>
            <input id="cobro-promo" bind:value={promotionId} data-testid="caja-promo-id" placeholder="p-demo" />
          </div>
          <p class="promo-hint" data-testid="caja-promo-hint">
            Se envía solo el ID en la venta offline; no se confía en el precio de pantalla.
            {#if promotionId.trim()}
              <strong> · Promo activa: {promotionId.trim()}</strong>
            {/if}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cobro-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad { padding: 1.25rem; }
  .field-group { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.875rem; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

  .charge-btn { width: 100%; margin-top: 0.25rem; }

  .connection-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 600;
    background: rgba(46, 158, 116, 0.12);
    border: 1px solid rgba(46, 158, 116, 0.3);
    color: var(--emerald-green);
  }
  .connection-badge.offline {
    background: rgba(217, 106, 60, 0.12);
    border-color: rgba(217, 106, 60, 0.3);
    color: var(--rose-red);
  }

  .capture-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(46, 158, 116, 0.1);
    border: 1px solid rgba(46, 158, 116, 0.3);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    color: var(--emerald-green);
  }

  .capture-id {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    cursor: pointer;
    margin-bottom: 0.75rem;
  }
  .checkbox-row input { width: auto; accent-color: var(--accent-primary); }

  .promo-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0;
  }

  .result-note {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  @media (max-width: 700px) {
    .cobro-grid { grid-template-columns: 1fr; }
    .two-col { grid-template-columns: 1fr; }
  }
</style>
