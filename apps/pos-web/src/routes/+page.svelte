<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isInventorySerialsEnabled,
    isPosCheckoutEnabled,
    isPrintTemplatesEnabled,
    isSalesCommissionsEnabled,
    isVitrinaEnabled,
  } from '$lib/features';
  import { addOrBumpLine, cartTotalCents, type CartLine } from '$lib/pos-checkout/cart';
  import { chargeCartOffline } from '$lib/pos-checkout/charge';
  import {
    leaseScannedSerialLine,
    SerialCheckoutError,
  } from '$lib/pos-checkout/serial-client';
  import {
    createMemoryOfflineIdb,
    OfflineQueueStore,
  } from '$lib/offline-sync/offline-queue';
  import { OfflineCorrelativeStore } from '$lib/offline-correlative/reserve';
  import { publishVitrina } from '$lib/vitrina/channel';
  import { formalizationBannerMessage } from '@kipuspay/domain-fiscal-pe';
  import {
    buildTicketHtml,
    resolveLineWidth,
    type TicketData,
  } from '@kipuspay/print-templates';
  import {
    defaultTenantSession,
    markTenantFirstSale,
    readTenantSession,
    tenantFromSearchParams,
    ttfsMs,
    writeTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';

  const checkoutOn = isPosCheckoutEnabled();
  const commissionsOn = isSalesCommissionsEnabled();
  const serialsOn = isInventorySerialsEnabled();
  const demoProduct = {
    productId: 'p1',
    name: 'Producto demo',
    unitPriceCents: 11800,
  } as const;

  let session = $state<PosTenantSession>(defaultTenantSession());
  let lines = $state<CartLine[]>([{ ...demoProduct, quantity: 1 }]);
  let sellerId = $state('');
  let status = $state('listo');
  let message = $state('');
  let lastFeedbackMs = $state(0);
  let printPreview = $state('');
  let lastTtfsMs = $state<number | null>(null);
  let terminalId = $state('');
  let terminalRegistered = $state(false);
  let serialScan = $state('');
  let serialStatus = $state('');
  let serialBusy = $state(false);
  let serialInput = $state<HTMLInputElement>();

  const queue = new OfflineQueueStore(createMemoryOfflineIdb());
  const correlatives = new OfflineCorrelativeStore(1);

  const totalCents = $derived(cartTotalCents(lines));
  const banner = $derived(formalizationBannerMessage(session.formalizationMode));

  onMount(() => {
    if (typeof window === 'undefined') return;
    const fromQs = tenantFromSearchParams(new URLSearchParams(window.location.search));
    if (fromQs) {
      writeTenantSession(sessionStorage, fromQs);
      session = fromQs;
    } else {
      session = readTenantSession(sessionStorage);
    }
    terminalId = localStorage.getItem('kipuspay:pos-terminal-id') ?? '';
    terminalRegistered = terminalId.length > 0;
  });

  async function onCharge() {
    status = 'cobrando';
    if (isVitrinaEnabled()) {
      publishVitrina({
        totalCents,
        itemCount: lines.length,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
        phase: 'confirming',
        message: 'Confirma el pago',
      });
    }

    const outcome = await chargeCartOffline(
      lines,
      {
        formalizationMode: session.formalizationMode,
        taxRegime: 'RG',
        branchId: 'b-demo',
        cashRegisterSessionId: 's-demo',
        series: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV01' : 'B001',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm-cash',
        ...(commissionsOn && sellerId.trim() ? { sellerId: sellerId.trim() } : {}),
      },
      queue,
    );

    lastFeedbackMs = outcome.feedbackMs;
    if (!outcome.ok) {
      status = 'bloqueado';
      message = outcome.message;
      return;
    }

    correlatives.reserve(outcome.offlineSaleId, outcome.documentType === 'NV' ? 'NV01' : 'B001');
    status = 'cobrado';
    message = `Venta ${outcome.offlineSaleId.slice(0, 8)}… en cola · ${outcome.documentType}`;

    if (!session.firstSaleAtIso && session.onboardingStartedAtIso) {
      session = markTenantFirstSale(session);
      writeTenantSession(sessionStorage, session);
      lastTtfsMs = ttfsMs(session);
      void fetch('/v1/referrals/first-sale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: session.tenantId }),
      }).catch(() => undefined);
    }

    const inviteBase =
      (import.meta.env.PUBLIC_MARKETING_ORIGIN as string | undefined) ?? 'https://kipuspay.pe';
    const brandUrl = session.referralCode
      ? `${inviteBase.replace(/\/$/, '')}/empezar?ref=${encodeURIComponent(session.referralCode)}`
      : `${inviteBase.replace(/\/$/, '')}/empezar`;

    if (isVitrinaEnabled()) {
      publishVitrina({
        totalCents: outcome.totalCents,
        itemCount: lines.length,
        documentType: outcome.documentType,
        phase: 'charged',
        message: 'Gracias por su compra',
        ...(session.brandQrEnabled
          ? { brandLabel: 'Emitido con KipusPay', brandUrl }
          : {}),
      });
    }

    if (isPrintTemplatesEnabled()) {
      const ticket: TicketData = {
        enterprise: session.tradeName,
        ruc: '20100000000',
        documentType: outcome.documentType,
        series: outcome.documentType === 'NV' ? 'NV01' : 'B001',
        number: correlatives.get(outcome.offlineSaleId)?.tentativeNumber ?? 0,
        totalCents: outcome.totalCents,
        items: lines.map((l) => ({
          name: l.name,
          qty: l.quantity,
          totalCents: l.unitPriceCents * l.quantity,
        })),
        lineWidth: resolveLineWidth(58),
        brandFooter: {
          enabled: session.brandQrEnabled,
          label: 'Emitido con KipusPay',
          shortUrl: brandUrl,
          qrPayload: brandUrl,
        },
      };
      printPreview = buildTicketHtml(ticket);
    }

    lines = [];
  }

  function addDemo() {
    lines = addOrBumpLine(lines, {
      ...demoProduct,
      quantity: 1,
    });
  }

  function registerTerminal() {
    terminalId = terminalId.trim();
    if (!terminalId) {
      terminalRegistered = false;
      serialStatus = 'Ingresa el ID de un terminal registrado.';
      return;
    }
    localStorage.setItem('kipuspay:pos-terminal-id', terminalId);
    terminalRegistered = true;
    serialStatus = 'Terminal listo para reservar series.';
    serialInput?.focus();
  }

  function terminalChanged() {
    terminalRegistered = false;
  }

  async function addScannedSerial(event?: KeyboardEvent) {
    if (event && event.key !== 'Enter') return;
    event?.preventDefault();
    if (serialBusy) return;
    serialBusy = true;
    serialStatus = 'Buscando serie disponible…';
    try {
      const line = await leaseScannedSerialLine({
        rawSerial: serialScan,
        terminalId: terminalRegistered ? terminalId : '',
        apiBase:
          (import.meta.env.PUBLIC_API_BASE as string | undefined) ??
          'https://api.kipuspay.local',
        authorization: (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo',
        resolveProduct: (productId) => (productId === demoProduct.productId ? demoProduct : undefined),
      });
      lines = addOrBumpLine(lines, line);
      serialStatus = `Serie ${serialScan.trim()} agregada como una unidad.`;
      serialScan = '';
    } catch (error) {
      serialStatus =
        error instanceof SerialCheckoutError
          ? error.message
          : 'No se pudo reservar la serie. Verifica la conexión e inténtalo de nuevo.';
    } finally {
      serialBusy = false;
      serialInput?.focus();
    }
  }
</script>

<h1>KipusPay POS</h1>
<p data-testid="tenant-name">{session.tradeName}</p>

{#if !checkoutOn}
  <p data-testid="checkout-off">Caja desactivada (FEATURE_POS_CHECKOUT off).</p>
  <p>Total demo: S/ {formatCents(11800)}</p>
{:else}
  <p data-testid="formalization-banner" role="status">{banner}</p>
  <p data-testid="formalization-mode">{session.formalizationMode}</p>
  <p data-testid="total">Total: S/ {formatCents(totalCents)}</p>
  {#if commissionsOn}
    <label>
      Vendedor (opcional)
      <input bind:value={sellerId} data-testid="seller-id" />
    </label>
  {/if}
  {#if serialsOn}
    <section class="serial-panel" aria-labelledby="serial-title" data-testid="main-serial-checkout">
      <div>
        <p class="serial-eyebrow">Identidad por unidad</p>
        <h2 id="serial-title">Escanear serie</h2>
        <p class="serial-help">El servidor reserva la unidad para este terminal antes de agregarla.</p>
      </div>
      <div class="terminal-row">
        <label for="main-terminal-id">Terminal registrado</label>
        <input
          id="main-terminal-id"
          bind:value={terminalId}
          oninput={terminalChanged}
          autocomplete="off"
          placeholder="terminal_id"
          data-testid="main-serial-terminal"
        />
        <button type="button" onclick={registerTerminal}>Registrar terminal</button>
      </div>
      <div class="scanner-row">
        <label for="main-serial-scan">Número de serie</label>
        <input
          id="main-serial-scan"
          bind:this={serialInput}
          bind:value={serialScan}
          onkeydown={addScannedSerial}
          disabled={!terminalRegistered || serialBusy}
          autocomplete="off"
          autocapitalize="characters"
          placeholder="Escanea y presiona Enter"
          data-testid="main-serial-scan"
        />
        <button
          type="button"
          disabled={!terminalRegistered || !serialScan.trim() || serialBusy}
          onclick={() => addScannedSerial()}
        >
          {serialBusy ? 'Reservando…' : 'Agregar serie'}
        </button>
      </div>
      {#if serialStatus}
        <p
          class:error={serialStatus.includes('SERIAL_') || serialStatus.startsWith('No se pudo')}
          role="status"
          aria-live="polite"
          data-testid="main-serial-status"
        >
          {serialStatus}
        </p>
      {/if}
    </section>
  {/if}
  <p data-testid="status">{status}</p>
  <p data-testid="message">{message}</p>
  <p data-testid="feedback-ms">{Math.round(lastFeedbackMs)}</p>
  {#if lastTtfsMs !== null}
    <p data-testid="ttfs-ms">{lastTtfsMs}</p>
  {/if}

  <button type="button" data-testid="add-line" onclick={addDemo}>Agregar</button>
  <button type="button" data-testid="charge" onclick={onCharge}>Cobrar</button>

  {#if printPreview}
    <div data-testid="print-preview">{@html printPreview}</div>
  {/if}
{/if}

<style>
  .serial-panel {
    max-width: 42rem;
    margin: 1.25rem 0;
    padding: 1rem;
    border: 1px solid #9bb8ae;
    border-left: 5px solid #196b57;
    background: #f8fbfa;
    color: #16332c;
  }
  .serial-eyebrow {
    margin: 0;
    font: 700 0.72rem/1.2 ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #196b57;
  }
  .serial-panel h2 {
    margin: 0.25rem 0;
  }
  .serial-help {
    margin-top: 0;
    color: #48655e;
  }
  .terminal-row,
  .scanner-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }
  .terminal-row label,
  .scanner-row label {
    grid-column: 1 / -1;
    font-weight: 700;
  }
  .serial-panel input,
  .serial-panel button {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    font: inherit;
  }
  .serial-panel input {
    min-width: 0;
    border: 1px solid #71867e;
    background: white;
    color: inherit;
  }
  .serial-panel button {
    border: 0;
    background: #196b57;
    color: white;
    font-weight: 750;
    cursor: pointer;
  }
  .serial-panel button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .serial-panel input:focus-visible,
  .serial-panel button:focus-visible {
    outline: 3px solid #ffb29a;
    outline-offset: 2px;
  }
  .serial-panel .error {
    color: #8b241c;
    font-weight: 700;
  }
  @media (max-width: 560px) {
    .terminal-row,
    .scanner-row {
      grid-template-columns: 1fr;
    }
    .terminal-row label,
    .scanner-row label {
      grid-column: auto;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .serial-panel * {
      scroll-behavior: auto;
      transition: none;
    }
  }
</style>
