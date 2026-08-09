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
  import Icon from '$lib/ui/Icon.svelte';

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

    status = 'completado';
    message = `Venta ${outcome.offlineSaleId} cobrada en ${Math.round(outcome.feedbackMs)} ms.`;

    if (session.firstSaleAtIso === null) {
      const nextSession = markTenantFirstSale(session, new Date().toISOString());
      writeTenantSession(sessionStorage, nextSession);
      session = nextSession;
      lastTtfsMs = ttfsMs(session);
    } else {
      lastTtfsMs = ttfsMs(session);
    }

    if (isPrintTemplatesEnabled()) {
      const isNv = session.formalizationMode === 'INTERNAL_CONTROL';
      const reserve = correlatives.reserve(outcome.offlineSaleId, isNv ? 'NV01' : 'B001');
      const mockTicket: TicketData = {
        enterprise: session.tradeName,
        ruc: '20123456789',
        documentType: isNv ? 'NV' : '03',
        series: isNv ? 'NV01' : 'B001',
        number: reserve.tentativeNumber,
        totalCents,
        lineWidth: 32,
        items: lines.map((l) => ({
          name: l.name,
          qty: l.quantity,
          totalCents: l.unitPriceCents * l.quantity,
        })),
      };
      printPreview = buildTicketHtml(mockTicket);
    }
  }

  function addDemo() {
    lines = addOrBumpLine(lines, { ...demoProduct, quantity: 1 });
  }

  function removeLine(productId: string) {
    lines = lines.filter((l) => l.productId !== productId);
  }

  function updateQuantity(productId: string, delta: number) {
    lines = lines
      .map((l) => {
        if (l.productId !== productId) return l;
        const newQty = l.quantity + delta;
        return newQty > 0 ? { ...l, quantity: newQty } : null;
      })
      .filter((l): l is CartLine => l !== null);
  }

  function registerTerminal() {
    const trimmed = terminalId.trim();
    if (!trimmed) return;
    localStorage.setItem('kipuspay:pos-terminal-id', trimmed);
    terminalId = trimmed;
    terminalRegistered = true;
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
    const parsedGrams = parseInt(manualWeightGrams.trim(), 10);
    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    const weightMicrounits = parsedGrams * 1_000;
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

<div class="pos-layout">
  <!-- Top Bar Meta / Banner -->
  <header class="pos-banner-card glass-panel">
    <div class="banner-left">
      <h1 data-testid="tenant-name" class="pos-title">{session.tradeName}</h1>
      {#if checkoutOn}
        <div class="banner-pills">
          <span data-testid="formalization-banner" class="badge badge-indigo" role="status">
            {banner}
          </span>
          <span data-testid="formalization-mode" class="badge badge-warning">
            {session.formalizationMode}
          </span>
        </div>
      {/if}
    </div>
    {#if checkoutOn && commissionsOn}
      <div class="seller-input-group">
        <label for="seller-id-input">Vendedor</label>
        <input
          id="seller-id-input"
          bind:value={sellerId}
          placeholder="ID Vendedor (opcional)"
          data-testid="seller-id"
        />
      </div>
    {/if}
  </header>

  {#if !checkoutOn}
    <div class="glass-panel checkout-disabled-panel">
      <div class="badge badge-danger">Caja Desactivada</div>
      <p data-testid="checkout-off">Caja desactivada (FEATURE_POS_CHECKOUT off).</p>
      <p class="demo-total">Total demo: S/ {formatCents(11800)}</p>
    </div>
  {:else}
    <div class="pos-main-grid">
      <!-- Left Column: Catalog & Instruments -->
      <div class="pos-instruments-col">
        <!-- Quick Add Catalog Card -->
        <section class="glass-panel catalog-card">
          <div class="card-header">
            <h2>Catálogo Rápido</h2>
            <span class="badge badge-indigo">Items Disponibles</span>
          </div>
          <div class="products-grid">
            <button type="button" class="product-item-btn" onclick={addDemo} data-testid="add-line">
              <div class="product-icon"><Icon name="package" size={24} /></div>
              <div class="product-info">
                <span class="product-name">{demoProduct.name}</span>
                <span class="product-price tabular-nums">S/ {formatCents(demoProduct.unitPriceCents)}</span>
              </div>
              <span class="add-badge">+ Añadir</span>
            </button>
          </div>
        </section>

        <!-- Serial Scanner Instrument Panel -->
        {#if serialsOn}
          <section class="glass-panel serial-panel" aria-labelledby="serial-title" data-testid="main-serial-checkout">
            <div class="card-header">
              <div>
                <span class="instrument-eyebrow">Identidad por unidad</span>
                <h2 id="serial-title">Escanear Número de Serie</h2>
              </div>
              <span class="badge badge-indigo">Reserva D1</span>
            </div>

            <div class="terminal-row">
              <label for="main-terminal-id">Terminal Registrado</label>
              <div class="input-with-button">
                <input
                  id="main-terminal-id"
                  bind:value={terminalId}
                  oninput={terminalChanged}
                  autocomplete="off"
                  placeholder="ID Terminal"
                  data-testid="main-serial-terminal"
                />
                <button type="button" class="secondary" onclick={registerTerminal}>Registrar</button>
              </div>
            </div>

            <div class="scanner-row">
              <label for="main-serial-scan">Escanear Serie</label>
              <div class="input-with-button">
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
                  class="primary"
                  disabled={!terminalRegistered || !serialScan.trim() || serialBusy}
                  onclick={() => addScannedSerial()}
                >
                  {serialBusy ? 'Reservando…' : 'Agregar Serie'}
                </button>
              </div>
            </div>

            {#if serialStatus}
              <p
                class="status-feedback"
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

        <!-- Scale Instrument Panel -->
        {#if scaleOn}
          <section
            class="glass-panel scale-panel"
            class:manual={scaleState === 'MANUAL_REQUIRED'}
            aria-labelledby="scale-title"
            data-testid="scale-checkout"
          >
            <div class="card-header">
              <div>
                <span class="instrument-eyebrow">Instrumento Balanza</span>
                <h2 id="scale-title">Captura de Peso WebHID</h2>
              </div>
              <div class="scale-state-badge" data-testid="scale-state">
                <span class="pulse-dot"></span>
                <span>{scaleState}</span>
              </div>
            </div>

            <div class="weight-display-box">
              <span class="display-label">PESO NETO</span>
              <div class="display-value tabular-nums">
                <strong>{scaleWeightMicrounits ? Math.round(scaleWeightMicrounits / 1_000) : '—'}</strong>
                <span class="unit">g</span>
              </div>
            </div>

            <div class="scale-actions-row">
              <button type="button" class="secondary" onclick={connectScale}>
                <Icon name="wifi" size={16} />
                {scaleState === 'CONNECTING' ? 'Conectando…' : 'Conectar Balanza'}
              </button>
              <button type="button" class="primary" onclick={captureDeviceWeight} disabled={scaleState !== 'STABLE'}>
                <Icon name="scale" size={16} />
                Capturar Pesada
              </button>
              <button type="button" class="secondary" onclick={disconnectScale}>
                <Icon name="edit" size={16} />
                Peso Manual
              </button>
            </div>

            {#if scaleState === 'MANUAL_REQUIRED'}
              <div class="manual-entry-box">
                <p role="alert" class="manual-alert">
                  {scaleError || 'La lectura del dispositivo no es cobrable. Ingresa un peso manual válido.'}
                </p>
                <div class="manual-fields">
                  <div>
                    <label for="manual-weight">Peso manual (gramos)</label>
                    <input
                      id="manual-weight"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      bind:value={manualWeightGrams}
                      placeholder="Ej. 350"
                    />
                  </div>
                  <div>
                    <label for="weight-auth">PIN Autorización (>250g)</label>
                    <input
                      id="weight-auth"
                      type="password"
                      autocomplete="off"
                      bind:value={weightAuthorizationToken}
                      placeholder="PIN Supervisor"
                    />
                  </div>
                </div>
                <button type="button" class="primary" onclick={captureManualWeight}>
                  Confirmar Peso Manual
                </button>
              </div>
            {/if}
          </section>
        {/if}
      </div>

      <!-- Right Column: Cart & Checkout Summary Panel -->
      <div class="pos-cart-col">
        <section class="glass-panel cart-panel">
          <div class="card-header">
            <h2>Detalle de Venta</h2>
            <span class="badge badge-success">{lines.length} {lines.length === 1 ? 'ítem' : 'ítems'}</span>
          </div>

          <!-- Items List -->
          <div class="cart-items-scroll">
            {#if lines.length === 0}
              <div class="empty-cart">
                <Icon name="cart" size={36} />
                <p>El carrito está vacío</p>
              </div>
            {:else}
              {#each lines as line (line.productId)}
                <div class="cart-item-row">
                  <div class="item-details">
                    <span class="item-name">{line.name}</span>
                    <span class="item-unit-price tabular-nums">S/ {formatCents(line.unitPriceCents)} c/u</span>
                  </div>
                  <div class="item-actions">
                    <div class="quantity-controls">
                      <button type="button" class="qty-btn" onclick={() => updateQuantity(line.productId, -1)}>-</button>
                      <span class="qty-value tabular-nums">{line.quantity}</span>
                      <button type="button" class="qty-btn" onclick={() => updateQuantity(line.productId, 1)}>+</button>
                    </div>
                    <span class="item-line-total tabular-nums">
                      S/ {formatCents(line.unitPriceCents * line.quantity)}
                    </span>
                    <button type="button" class="remove-item-btn" onclick={() => removeLine(line.productId)}>×</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Total & Charge Section -->
          <div class="cart-summary-footer">
            <div class="summary-total-box">
              <span class="total-label">TOTAL A COBRAR</span>
              <span data-testid="total" class="total-amount tabular-nums">
                S/ {formatCents(totalCents)}
              </span>
            </div>

            <!-- Transaction Metrics Badges -->
            <div class="metrics-row">
              <div class="metric-pill">
                <span class="metric-label">Latencia UI</span>
                <span data-testid="feedback-ms" class="metric-value tabular-nums">{Math.round(lastFeedbackMs)} ms</span>
              </div>
              {#if lastTtfsMs !== null}
                <div class="metric-pill">
                  <span class="metric-label">TTFS</span>
                  <span data-testid="ttfs-ms" class="metric-value tabular-nums">{lastTtfsMs} ms</span>
                </div>
              {/if}
            </div>

            <!-- Status Alerts -->
            {#if status}
              <div class="status-box">
                <span data-testid="status" class="status-tag">{status}</span>
                {#if message}
                  <span data-testid="message" class="status-msg">{message}</span>
                {/if}
              </div>
            {/if}

            <!-- Primary Action Button -->
            <button
              type="button"
              class="primary charge-btn"
              data-testid="charge"
              onclick={onCharge}
              disabled={lines.length === 0}
            >
              <Icon name="credit-card" size={20} />
              COBRAR (S/ {formatCents(totalCents)})
            </button>
          </div>
        </section>

        <!-- Print Preview Card -->
        {#if printPreview}
          <div class="glass-panel print-preview-card" data-testid="print-preview">
            <div class="card-header">
              <h3>Vista Previa Ticket Térmico 80mm</h3>
              <span class="badge badge-indigo">ESC/POS Ready</span>
            </div>
            <div class="ticket-render-body">
              {@html printPreview}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .pos-layout {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .pos-banner-card {
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;

  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .pos-title {
    font-size: 1.375rem;
    font-weight: 800;
  }

  .banner-pills {
    display: flex;
    gap: 0.5rem;
  }

  .seller-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .seller-input-group label {
    margin-bottom: 0;
    white-space: nowrap;
  }
  .seller-input-group input {
    width: 180px;
  }

  .checkout-disabled-panel {
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .demo-total {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--emerald-green);
  }

  /* Main Grid */
  .pos-main-grid {
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: 1.25rem;
    align-items: start;
  }

  .pos-instruments-col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .pos-cart-col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .card-header h2, .card-header h3 {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .instrument-eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-primary);
  }

  /* Catalog Grid */
  .catalog-card {
    padding: 1.25rem;
  }
  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .product-item-btn {
    background: var(--bg-glass-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    text-align: left;
    color: var(--text-main);
    transition: all var(--transition-smooth);
    cursor: pointer;
  }
  .product-item-btn:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
    transform: translateY(-2px);
  }
  .product-icon {
    font-size: 1.75rem;
    color: var(--text-main);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .product-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    color: var(--text-main);
  }
  .product-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text-main);
  }
  .product-price {
    color: var(--emerald-green);
    font-weight: 700;
    font-size: 1rem;
  }
  .add-badge {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  /* Serial Scanner Panel */
  .serial-panel {
    padding: 1.25rem;
  }
  .terminal-row, .scanner-row {
    margin-bottom: 0.875rem;
  }
  .input-with-button {
    display: flex;
    gap: 0.5rem;
  }
  .status-feedback {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-primary);
  }
  .status-feedback.error {
    color: var(--rose-red);
  }

  /* Scale Panel */
  .scale-panel {
    padding: 1.25rem;
  }
  .scale-state-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--emerald-green);
    text-transform: uppercase;
  }
  .weight-display-box {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem;
    margin: 0.75rem 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .display-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
  }
  .display-value {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--emerald-green);
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }
  .display-value .unit {
    font-size: 1rem;
    color: var(--text-muted);
  }
  .scale-actions-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .manual-entry-box {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .manual-alert {
    font-size: 0.8125rem;
    color: var(--rose-red);
    font-weight: 600;
  }
  .manual-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  /* Cart & Checkout Column */
  .cart-panel {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    min-height: 520px;
  }
  .cart-items-scroll {
    flex: 1;
    overflow-y: auto;
    max-height: 320px;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .empty-cart {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: var(--text-dim);
    gap: 0.5rem;
  }
  .cart-item-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  .item-details {
    display: flex;
    flex-direction: column;
  }
  .item-name {
    font-weight: 600;
    font-size: 0.9375rem;
  }
  .item-unit-price {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .quantity-controls {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }
  .qty-btn {
    padding: 0.25rem 0.625rem;
    background: transparent;
    border: none;
    color: var(--text-main);
    font-weight: 700;
  }
  .qty-value {
    padding: 0 0.5rem;
    font-weight: 700;
    font-size: 0.875rem;
  }
  .item-line-total {
    font-weight: 700;
    color: var(--emerald-green);
  }
  .remove-item-btn {
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 1.25rem;
    padding: 0.25rem;
  }
  .remove-item-btn:hover {
    color: var(--rose-red);
  }

  .cart-summary-footer {
    border-top: 1px solid var(--border-subtle);
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .summary-total-box {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .total-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
  .total-amount {
    font-size: 2.25rem;
    font-weight: 800;
    color: var(--emerald-green);
    text-shadow: 0 0 16px rgba(16, 185, 129, 0.25);
  }

  .metrics-row {
    display: flex;
    gap: 0.75rem;
  }
  .metric-pill {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0.375rem 0.625rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .metric-label {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .metric-value {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  .status-box {
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .status-tag {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent-primary);
  }
  .status-msg {
    font-size: 0.8125rem;
    color: var(--text-main);
  }

  .charge-btn {
    width: 100%;
    padding: 1rem;
    font-size: 1.125rem;
    letter-spacing: 0.02em;
  }

  .print-preview-card {
    padding: 1.25rem;
  }
  .ticket-render-body {
    background: #ffffff;
    color: #000000;
    padding: 1rem;
    border-radius: var(--radius-sm);
    overflow-x: auto;
  }

  @media (max-width: 900px) {
    .pos-main-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
