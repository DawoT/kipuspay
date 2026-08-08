<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isInventorySerialsEnabled,
    isInventoryScaleEnabled,
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
  import { createWebHidScale } from '$lib/scale/webhid';
  import { evaluateScaleHeartbeat } from '$lib/pos-checkout/scale-client';
  import type { ScaleReading } from '$lib/scale/types';
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
  const scaleOn = isInventoryScaleEnabled();

  interface WebHidInputReportEvent extends Event {
    readonly reportId: number;
    readonly data: DataView;
  }
  interface PosHidDevice {
    vendorId: number;
    productId: number;
    productName?: string;
    open(): Promise<void>;
    close(): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: WebHidInputReportEvent) => void): void;
  }
  interface PosNavigator extends Navigator {
    hid: { requestDevice(options: { filters: readonly unknown[] }): Promise<PosHidDevice[]> };
  }
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
  type ScaleState =
    | 'CONNECTING'
    | 'STABLE'
    | 'UNSTABLE'
    | 'STALE'
    | 'DISCONNECTED'
    | 'MANUAL_REQUIRED';
  let scaleState = $state<ScaleState>('DISCONNECTED');
  let scaleWeightMicrounits = $state<number | null>(null);
  let scaleError = $state('');
  let scaleReading: ScaleReading | null = $state(null);
  let connectedScale: { scale: ReturnType<typeof createWebHidScale>; close(): Promise<void> } | null =
    $state(null);
  let manualWeightGrams = $state('');
  let weightAuthorizationToken = $state('');
  const manualThresholdMicrounits = 250_000;

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

  function connectScale() {
    scaleState = 'CONNECTING';
    scaleWeightMicrounits = null;
    if (typeof navigator === 'undefined' || !('hid' in navigator)) {
      scaleState = 'MANUAL_REQUIRED';
      scaleError = 'WebHID no está disponible en este navegador.';
      return;
    }
    void connectHidScale();
  }

  async function connectHidScale() {
    try {
      const nav = navigator as PosNavigator;
      const [device] = await nav.hid.requestDevice({ filters: [] });
      if (!device) {
        scaleState = 'MANUAL_REQUIRED';
        scaleError = 'No se seleccionó ninguna balanza.';
        return;
      }
      await device.open();
      const scale = createWebHidScale({
        profile: {
          deviceId: device.productName || device.vendorId.toString(16),
          vendorId: device.vendorId,
          productId: device.productId,
          reportId: 0,
          maxFrameBytes: 64,
        },
        transport: {
          vendorId: device.vendorId,
          productId: device.productId,
          close: () => device.close(),
        },
      });
      connectedScale = { scale, close: () => device.close() };
      device.addEventListener('inputreport', (event: WebHidInputReportEvent) => {
        try {
          const frame = new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          );
          scaleReading = scale.parseReport(event.reportId, frame, Date.now());
          scaleWeightMicrounits = scaleReading.weightMicrounits;
          scaleState = 'STABLE';
          scaleError = '';
        } catch {
          scaleState = 'UNSTABLE';
        }
      });
    } catch {
      scaleState = 'MANUAL_REQUIRED';
      scaleError = 'No se pudo conectar la balanza WebHID.';
    }
  }

  async function disconnectScale() {
    await connectedScale?.close();
    connectedScale = null;
    scaleReading = null;
    scaleWeightMicrounits = null;
    scaleState = 'MANUAL_REQUIRED';
  }

  function captureDeviceWeight() {
    if (!scaleReading) return;
    const heartbeat = evaluateScaleHeartbeat({
      connected: connectedScale !== null,
      reading: scaleReading,
      nowEpochMs: Date.now(),
    });
    if (heartbeat.status !== 'READY' || heartbeat.reading.weightMicrounits <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      scaleError =
        heartbeat.status === 'READY'
          ? 'La lectura del dispositivo no es cobrable.'
          : 'El dispositivo se desconectó o dejó de reportar.';
      return;
    }
    const measurementId = crypto.randomUUID();
    const saleItemId = crypto.randomUUID();
    const { weightMicrounits, protocol, deviceId, sequence, observedAtEpochMs } =
      heartbeat.reading;
    lines = addOrBumpLine(lines, {
      productId: 'weigh-demo',
      name: 'Manzana por peso',
      unitPriceCents: 100,
      quantity: 1,
      saleItemId,
      weightMeasurement: {
        measurementId,
        weightMicrounits,
        measurementSource: 'DEVICE',
        scaleProtocol: protocol,
        scaleDeviceId: deviceId,
        heartbeatSequence: sequence,
        observedAt: new Date(observedAtEpochMs).toISOString(),
      },
    });
    scaleWeightMicrounits = null;
    scaleReading = null;
    scaleState = 'UNSTABLE';
  }

  function captureManualWeight() {
    const grams = Number(manualWeightGrams);
    const weightMicrounits = Number.isSafeInteger(grams) ? grams * 1_000 : 0;
    if (weightMicrounits <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    if (weightMicrounits > manualThresholdMicrounits && !weightAuthorizationToken.trim()) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    lines = addOrBumpLine(lines, {
      productId: 'weigh-demo',
      name: 'Manzana por peso',
      unitPriceCents: 100,
      quantity: 1,
      saleItemId: crypto.randomUUID(),
      weightMeasurement: {
        measurementId: crypto.randomUUID(),
        weightMicrounits,
        measurementSource: 'MANUAL',
        observedAt: new Date().toISOString(),
        ...(weightAuthorizationToken.trim()
          ? { authorizationToken: weightAuthorizationToken.trim() }
          : {}),
      },
    });
    manualWeightGrams = '';
    weightAuthorizationToken = '';
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
  {#if scaleOn}
    <section
      class:manual={scaleState === 'MANUAL_REQUIRED'}
      class="scale-panel"
      aria-labelledby="scale-title"
      data-testid="scale-checkout"
    >
      <header>
        <div>
          <p class="scale-eyebrow">Instrumento 01 · Balanza</p>
          <h2 id="scale-title">Captura de peso</h2>
        </div>
        <p class="scale-state" aria-live="assertive" data-testid="scale-state">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="5"></circle>
          </svg>
          {scaleState}
        </p>
      </header>
      <output class="weight-readout" aria-live="polite">
        <span>Peso neto</span>
        <strong>{scaleWeightMicrounits ? scaleWeightMicrounits / 1_000 : '—'}</strong>
        <span>g</span>
      </output>
      <div class="scale-actions">
        <button type="button" onclick={connectScale}>
          {scaleState === 'CONNECTING' ? 'Conectando…' : 'Conectar balanza'}
        </button>
        <button type="button" onclick={captureDeviceWeight} disabled={scaleState !== 'STABLE'}>
          Capturar pesada
        </button>
        <button type="button" class="secondary" onclick={disconnectScale}>Peso manual</button>
      </div>
      {#if scaleState === 'MANUAL_REQUIRED'}
        <div class="manual-entry">
          <p role="alert">
            {scaleError ||
              'La lectura del dispositivo no es cobrable. Ingresa un peso manual válido.'}
          </p>
          <label for="manual-weight">Peso manual (gramos enteros)</label>
          <input
            id="manual-weight"
            inputmode="numeric"
            pattern="[0-9]*"
            bind:value={manualWeightGrams}
          />
          <label for="weight-auth">Autorización de supervisor si supera 250 g</label>
          <input
            id="weight-auth"
            type="password"
            autocomplete="off"
            bind:value={weightAuthorizationToken}
          />
          <button type="button" onclick={captureManualWeight}>Agregar peso manual</button>
        </div>
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
  .scale-panel {
    --instrument-bg: #f3f7f5;
    --instrument-ink: #16332c;
    --instrument-line: #71867e;
    --instrument-action: #196b57;
    --instrument-fault: #9f2f27;
    max-width: 42rem;
    margin: 1.25rem 0;
    padding: 1rem;
    border: 1px solid var(--instrument-line);
    border-top: 5px solid var(--instrument-action);
    background: var(--instrument-bg);
    color: var(--instrument-ink);
  }
  .scale-panel.manual {
    border-color: var(--instrument-fault);
    border-top-color: var(--instrument-fault);
    background: #fff5f3;
  }
  .scale-panel header,
  .scale-state,
  .weight-readout,
  .scale-actions {
    display: flex;
    align-items: center;
  }
  .scale-panel header {
    justify-content: space-between;
    gap: 1rem;
  }
  .scale-panel h2,
  .scale-state,
  .scale-eyebrow {
    margin: 0;
  }
  .scale-eyebrow {
    font: 700 0.72rem/1.2 ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .scale-state {
    gap: 0.4rem;
    font: 750 0.78rem/1 ui-monospace, monospace;
  }
  .scale-state svg {
    width: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .manual .scale-state {
    color: var(--instrument-fault);
  }
  .weight-readout {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    margin: 1rem 0;
    padding: 0.75rem;
    border-block: 1px solid var(--instrument-line);
    font-family: ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  .weight-readout strong {
    font-size: clamp(2.5rem, 10vw, 4.5rem);
    line-height: 1;
  }
  .scale-actions {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .scale-panel button,
  .scale-panel input {
    min-height: 44px;
    padding: 0.55rem 0.75rem;
    font: inherit;
  }
  .scale-panel button {
    border: 1px solid var(--instrument-action);
    background: var(--instrument-action);
    color: white;
    font-weight: 750;
    cursor: pointer;
  }
  .scale-panel button.secondary {
    background: transparent;
    color: var(--instrument-ink);
  }
  .scale-panel button:active {
    transform: translateY(1px);
    filter: brightness(0.88);
  }
  .scale-panel button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .scale-panel button:focus-visible,
  .scale-panel input:focus-visible {
    outline: 3px solid #ffb29a;
    outline-offset: 2px;
  }
  .manual-entry {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .manual-entry p {
    color: var(--instrument-fault);
    font-weight: 750;
  }
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
    .scale-panel header,
    .scale-actions {
      align-items: stretch;
      flex-direction: column;
    }
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
    .scale-panel *,
    .serial-panel * {
      scroll-behavior: auto;
      transition: none;
    }
  }
</style>
