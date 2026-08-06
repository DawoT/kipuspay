<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isPaymentsCardAcquirerEnabled,
    isPaymentsQrWalletsEnabled,
    isPosCheckoutEnabled,
  } from '$lib/features';

  /** Copy normativa §5.4 edge 2B (misma cadena que MANUAL_CAPTURE_AMBER_COPY). */
  const MANUAL_CAPTURE_AMBER_COPY =
    'Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto';

  const checkoutOn = isPosCheckoutEnabled();
  const walletsOn = isPaymentsQrWalletsEnabled();
  const cardsOn = isPaymentsCardAcquirerEnabled();

  let methodCode = $state('cash');
  /** M4: fuente de verdad = navigator.onLine (nunca inventar online). */
  let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
  let paymentMethodId = $state('pm-cash');
  let captureId = $state('');
  let message = $state('');
  let amber = $state('');

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
</script>

<section class="caja-cobro" data-testid="caja-cobro-local">
  <h1>Cobro local</h1>
  <p class="lede">
    Efectivo, Yape/Plin/MP QR o tarjeta Culqi/Niubiz (Sprint 22). Montos los impone el servidor.
  </p>

  {#if !checkoutOn && !walletsOn && !cardsOn}
    <p data-testid="caja-cobro-off">Activa flags de cobro / wallets / tarjeta.</p>
  {:else}
    <label>
      Método
      <select bind:value={methodCode} data-testid="caja-cobro-method">
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
    </label>
    <label>
      payment_method_id
      <input bind:value={paymentMethodId} data-testid="caja-cobro-pm-id" />
    </label>
    <label class="online">
      <input type="checkbox" checked={online} disabled data-testid="caja-cobro-online" />
      En línea (detectado por el navegador)
    </label>

    {#if amber}
      <p class="amber" data-testid="caja-cobro-amber" role="alert">{amber}</p>
    {/if}

    <button type="button" data-testid="caja-cobro-charge" onclick={chargeOnline}>
      Cobrar
    </button>

    {#if captureId}
      <p data-testid="caja-cobro-capture">QR / captura: {captureId} (PENDING→CAPTURED)</p>
    {/if}
    {#if message}
      <p data-testid="caja-cobro-msg">{message}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-cobro {
    max-width: 36rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .lede {
    color: #445;
    margin-bottom: 1.25rem;
  }
  label {
    display: block;
    margin: 0.75rem 0;
  }
  input,
  select {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
  }
  .online input {
    display: inline;
    width: auto;
  }
  .amber {
    background: #fff3cd;
    color: #664d03;
    border: 1px solid #ffecb5;
    padding: 0.75rem 1rem;
    margin: 1rem 0;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.45rem 0.85rem;
  }
</style>
