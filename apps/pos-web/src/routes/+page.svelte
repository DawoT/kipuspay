<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { formatCents } from '$lib/cents';  import {
    isCatalogQuickAddEnabled,
    isCatalogVariantsEnabled,
    isInventoryOpsEnabled,
    isInventoryScaleEnabled,
    isInventorySerialsEnabled,
    isOnboardingTourEnabled,
    isOrdersKdsEnabled,
    isPosCheckoutEnabled,
    isPricingPromotionsEnabled,
    isPrintTemplatesEnabled,
    isCashDrawerEnabled,
    isCatalogSellableEnabled,
    isSalesCommissionsEnabled,
    isSaleTipEnabled,
    isSaleFeedbackEnabled,
    isShiftHandoffEnabled,
    isTeamInviteEnabled,
    isCustomerOrdersEnabled,
    isHardwareDiagnosticsEnabled,
    isVitrinaEnabled,
  } from '$lib/features';
  import { resolveSeller } from '$lib/cash/shift-handoff';
import { createPrinterTransport } from '$lib/print/printer-transport';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import { playSaleSuccessFeedback } from '$lib/ui/feedback.js';
  import { readLoginUser, writeLoginTenantId, writeLoginToken, writeLoginUser, type LoginUserIdentity } from '$lib/auth/token-store';
  import {
    claimOnboardingFromUrlIfPresent,
    readLastOnboardingClaim,
    readLastOnboardingError,
  } from '$lib/auth/onboarding-claim';
  import {
    capabilitiesFromFlags,
  } from '$lib/onboarding/capabilities';
  import {
    isTourEligible,
    readTourState,
    recordGrowthEvent,
    writeTourState,
  } from '$lib/onboarding/tour-client';
  import { showCustomerOrderNavigation } from '$lib/customer-orders/customer-order-access';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import { tourStepsFor, type TourStep } from '@kipuspay/domain-onboarding';
  import Tour from '$lib/ui/Tour.svelte';
  import { addOrBumpLine, cartPayableCents, cartTotalCents, genericLine, type CartLine } from '$lib/pos-checkout/cart';
  import SellableCatalog from '$lib/pos/SellableCatalog.svelte';
  import { chargeCartOffline, requiresCustomerIdentity } from '$lib/pos-checkout/charge';
  import {
    leaseScannedSerialLine,
    SerialCheckoutError,
  } from '$lib/pos-checkout/serial-client';
  import {
    createBrowserOfflineIdb,
    createHttpSyncTransport,
    dispatchPendingSalesChunked,
    OfflineQueueStore,
  } from '$lib/offline-sync';
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
    writeTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Modal from '$lib/ui/Modal.svelte';
  import { formalizationModeLabel } from '$lib/ui/ops-copy';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import {
    cashierFacingMessage,
    chargeButtonLabel,
    scaleStateLabel,
  } from '$lib/ui/cashier-copy';
  import { stitchClass, stitchStateFromFlags } from '$lib/ui/sync-stitch';
  import {
    fetchSellableCatalog,
    type SellableCatalogItem,
  } from '$lib/catalog/sellable-catalog-client';

  import { renderQrToCanvas } from '$lib/print/qr-canvas';

  const checkoutOn = isPosCheckoutEnabled();

  // Chrome cashier (FASE F): el cajero navega desde el bottom-nav; el acceso a
  // pedidos con retiro se gatea con la misma regla que el sidebar (DRY).
  let authenticatedRole = $state('');
  $effect(() => {
    authenticatedRole = readAdminAuthenticatedSessionState()?.current?.role ?? '';
  });
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
  let session = $state<PosTenantSession>(defaultTenantSession());
  let loginUser = $state<LoginUserIdentity | null>(null);
  let lines = $state<CartLine[]>([]);
  let catalogItems = $state<SellableCatalogItem[]>([]);
  let catalogLoading = $state(true);
  let catalogError = $state('');
  let catalogQuery = $state('');
  let quickSaleOpen = $state(false);
  const teamOn = isTeamInviteEnabled();
  let sellerResolveOpen = $state(false);
  let sellerIdentifier = $state('');
  let sellerResolveMsg = $state('');
  let sellerResolvedName = $state('');
  let quickName = $state('');
  let quickPriceCents = $state<number | null>(1500);
  let quickError = $state('');
  const QUICK_SALE_MAX_CENTS = 2000;
  let sellerId = $state('');
  let status = $state('listo');
  let message = $state('');
  let printPreview = $state('');
  let previewContainer = $state<HTMLDivElement>();
  // S7-H1: identidad del cliente en el cobro — nunca inventar dummy truthy.
  // El servidor exige doc+nombre para boleta ≥ S/ 700 (BOLETA_ID_REQUIRED).
  let clientDocType = $state('1');
  let clientDocNumber = $state('');
  let clientName = $state('');
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

  // S7-H2: cola offline durable (IndexedDB real, persistente entre recargas);
  // fallback a memoria si no hay browser IDB (SSR/tests).
  const queue = new OfflineQueueStore(createBrowserOfflineIdb());
  const correlatives = new OfflineCorrelativeStore(1);

  const totalCents = $derived(cartTotalCents(lines));
  const payableCents = $derived(cartPayableCents(lines));
  const banner = $derived(formalizationBannerMessage(session.formalizationMode));
  const chargeSettled = $derived(status === 'completado');
  const cobroStitch = $derived(
    stitchClass(
      stitchStateFromFlags({
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        pendingCount: 0,
        charging: status === 'cobrando',
      }),
    ),
  );

  onMount(async () => {
    if (typeof window === 'undefined') return;
    const fromQs = tenantFromSearchParams(new URLSearchParams(window.location.search));
    if (fromQs) {
      writeTenantSession(sessionStorage, fromQs);
      session = fromQs;
      writeLoginTenantId(localStorage, fromQs.tenantId);
    } else {
      session = readTenantSession(sessionStorage);
    }
    terminalId = localStorage.getItem('kipuspay:pos-terminal-id') ?? '';
    terminalRegistered = terminalId.length > 0;
    loginUser = readLoginUser(localStorage);
    const claimed = await claimOnboardingFromUrlIfPresent();
    // Fe de errata de walkthrough (Sprint 7): el claim es single-flight y puede
    // ganarlo el layout; el resultado queda en el módulo — la página lo lee
    // siempre, no solo cuando su propia llamada devuelve true.
    const lastSession = readLastOnboardingClaim();
    if (lastSession) onboardingSession = { branchId: lastSession.branchId, sessionId: lastSession.sessionId };
    if (claimed) {
      loginUser = readLoginUser(localStorage);
    } else if (readLastOnboardingError() && !readLoginUser(localStorage)) {
      // S7: un token ya consumido (reload con URL vieja) NO es un error si el
      // login del claim anterior sigue activo; el notice solo aplica sin sesión.
      onboardingNotice = `No pudimos iniciar tu sesión automáticamente (${readLastOnboardingError()}). Usa "Ingresar" con tu badge y PIN.`;
    }
    void loadSellableCatalog();
    maybeShowTour();
  });

  // M6C: token single-use del onboarding → sesión real del owner.
  let onboardingSession = $state<{ branchId: string; sessionId: string } | null>(null);
  let onboardingNotice = $state('');

  const tourOn = isOnboardingTourEnabled();
  const tipOn = isSaleTipEnabled();
  const drawerOn = isCashDrawerEnabled();
  const saleFeedbackOn = isSaleFeedbackEnabled();
  let tipCents = $state(0);
  const capabilities = capabilitiesFromFlags({
    kds: isOrdersKdsEnabled(),
    fefo: isInventoryOpsEnabled(),
    scale: isInventoryScaleEnabled(),
    promotions: isPricingPromotionsEnabled(),
    variants: isCatalogVariantsEnabled(),
    quickAdd: isCatalogQuickAddEnabled(),
    shiftHandoff: isShiftHandoffEnabled(),
    teamInvite: isTeamInviteEnabled(),
    hardwareDiagnostics: isHardwareDiagnosticsEnabled(),
  });
  let tourOpen = $state(false);
  let tourSteps = $state<readonly TourStep[]>([]);

  function maybeShowTour() {
    if (!tourOn) return;
    if (!isTourEligible({ hasSold: session.firstSaleAtIso !== null, localState: readTourState(localStorage, session.verticalType) })) {
      return;
    }
    const steps = tourStepsFor({
      vertical: session.verticalType,
      // La demo de la caja es el rol Cajero; el Modo Dueño tiene su propia versión.
      role: 'cashier',
      capabilities,
      hasSold: false,
    });
    if (steps.length === 0) return;
    tourSteps = steps;
    tourOpen = true;
    void recordGrowthEvent('tour_started', { vertical: session.verticalType });
  }

  function onTourComplete() {
    tourOpen = false;
    writeTourState(localStorage, session.verticalType, 'completed');
    void recordGrowthEvent('tour_completed', { steps: tourSteps.length });
  }

  function onTourDismiss() {
    tourOpen = false;
    writeTourState(localStorage, session.verticalType, 'dismissed');
    void recordGrowthEvent('tour_dismissed', { step: 0 });
  }

  /** S7-H2: drena la cola offline hacia POST /api/v1/sync/sales en background. */
  async function flushPendingSales(): Promise<void> {
    try {
      const apiBase = resolveApiBase(localStorage);
      await dispatchPendingSalesChunked(
        queue,
        createHttpSyncTransport({
          endpointUrl: `${apiBase}/api/v1/sync/sales`,
          bearerToken: localStorage.getItem('kipuspay_token') ?? undefined,
          tenantId: localStorage.getItem('kipuspay_tenant_id') ?? undefined,
        }),
      );
    } catch {
      // Red caída: la cola (IDB durable) conserva las ventas para el próximo flush.
    }
  }

  async function onCharge() {
    status = 'cobrando';
    if (!onboardingSession) {
      // Fe de errata de walkthrough (Sprint 7): sin sesión de caja (branch +
      // sesión OPEN) el server rechaza la venta; nunca encolar con valores demo.
      status = 'bloqueado';
      message = 'No hay una sesión de caja abierta. Inicia sesión o abre la caja.';
      return;
    }
    if (isVitrinaEnabled()) {
      publishVitrina({
        totalCents,
        itemCount: lines.length,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
        phase: 'confirming',
        message: 'Confirma el pago',
        // S12-H2: marca KipusPay visible en la vitrina (opt-out por tenant).
        ...(session.brandQrEnabled ? { brandLabel: 'Emitido con KipusPay' } : {}),
      });
    }

    const outcome = await chargeCartOffline(
      lines,
      {
        formalizationMode: session.formalizationMode,
        taxRegime: 'RG',
        branchId: onboardingSession?.branchId ?? '',
        cashRegisterSessionId: onboardingSession?.sessionId ?? '',
        series: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV01' : 'B001',
        clientDocumentType: clientDocType,
        clientDocumentNumber: clientDocNumber.trim(),
        clientName: clientName.trim(),
        paymentMethodId: 'pm-cash',
        ...(commissionsOn && sellerId.trim() ? { sellerId: sellerId.trim() } : {}),
        ...(tipOn && tipCents > 0 ? { tipCents } : {}),
      },
      queue,
    );
    if (!outcome.ok) {
      status = 'bloqueado';
      message = outcome.message;
      return;
    }

    status = 'completado';
    message = `Venta ${outcome.offlineSaleId} cobrada.`;

    // GTM §6.5: beep + vibración breve al confirmar (opt-in, nunca bloquea).
    if (saleFeedbackOn) {
      playSaleSuccessFeedback();
    }

    // P2: abre el cajón tras el cobro (efectivo/wallets — uso común en Perú).
    if (drawerOn) {
      void createPrinterTransport().openDrawer();
    }

    // S7-H2: sync en background — nunca bloquea el cobro (cero spinner).
    void flushPendingSales();

    if (session.firstSaleAtIso === null) {
      const nextSession = markTenantFirstSale(session, new Date().toISOString());
      writeTenantSession(sessionStorage, nextSession);
      session = nextSession;
      // M6D: TTFS — primera venta real (growth_events, catálogo cerrado).
      void recordGrowthEvent('first_sale', { vertical: session.verticalType });
    }

    if (isPrintTemplatesEnabled()) {
      const isNv = session.formalizationMode === 'INTERNAL_CONTROL';
      const reserve = correlatives.reserve(outcome.offlineSaleId, isNv ? 'NV01' : 'B001');
      const mockTicket: TicketData = {
        enterprise: session.tradeName,
        documentType: isNv ? 'NV' : '03',
        series: isNv ? 'NV01' : 'B001',
        number: reserve.tentativeNumber,
        totalCents: cartPayableCents(lines),
        lineWidth: 32,
        items: lines.map((l) => ({
          name: l.name,
          qty: l.quantity,
          totalCents: l.unitPriceCents * l.quantity,
        })),
        // S12-H2: pie de marca KipusPay en comprobantes (opt-out por tenant).
        ...(session.brandQrEnabled
          ? {
              brandFooter: {
                enabled: true,
                label: 'Emitido con KipusPay',
                shortUrl: 'kipuspay.com',
                qrPayload: 'https://kipuspay.com',
              },
            }
          : {}),
      };
      printPreview = buildTicketHtml(mockTicket);
    }
  }

  function addProduct(item: SellableCatalogItem) {
    lines = addOrBumpLine(lines, {
      productId: item.productId,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: 1,
    });
  }

  $effect(() => {
    const previewHtml = printPreview;
    const container = previewContainer;
    if (!previewHtml || !container) return;
    container.querySelectorAll<HTMLElement>('[data-qr], [data-brand-qr]').forEach((el) => {
      const payload = el.dataset.qr ?? el.dataset.brandQr ?? '';
      if (!payload || el.dataset.qrRendered === '1') return;
      el.dataset.qrRendered = '1';
      const canvas = document.createElement('canvas');
      renderQrToCanvas(canvas, payload, 120);
      canvas.setAttribute('data-testid', 'ticket-qr');
      canvas.setAttribute('title', payload);
      canvas.setAttribute('aria-label', 'Código QR del comprobante');
      el.replaceChildren(canvas);
    });
  });

  const catalogOn = isCatalogSellableEnabled();

  async function loadSellableCatalog() {
    if (!catalogOn) {
      catalogLoading = false;
      return;
    }
    catalogLoading = true;
    catalogError = '';
    try {
      catalogItems = await fetchSellableCatalog({
        apiBase: resolveApiBase(localStorage),
        authorization: resolveApiAuth(localStorage).authorization ?? '',
        tenantId: resolveApiAuth(localStorage)['x-tenant-id'],
      });
    } catch {
      catalogError = 'No se pudo cargar el catálogo. La venta rápida sigue disponible.';
    } finally {
      catalogLoading = false;
    }
  }


  function addQuickSale() {
    const name = quickName.trim();
    if (
      !name ||
      quickPriceCents === null ||
      !Number.isInteger(quickPriceCents) ||
      quickPriceCents <= 0
    ) {
      quickError = 'Ingresa un nombre y un precio válido.';
      return;
    }
    if (quickPriceCents > QUICK_SALE_MAX_CENTS) {
      quickError = `El precio máximo sin autorización es S/ ${formatCents(QUICK_SALE_MAX_CENTS)}.`;
      return;
    }
    lines = addOrBumpLine(lines, genericLine(name, quickPriceCents));
    quickSaleOpen = false;
    quickName = '';
    quickError = '';
  }

  async function onResolveSeller() {
    sellerResolveMsg = '';
    const res = await resolveSeller(sellerIdentifier);
    if (!res.ok) {
      sellerResolveMsg = res.message;
      return;
    }
    sellerId = res.userId;
    sellerResolvedName = res.email;
    sellerResolveOpen = false;
    sellerIdentifier = '';
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
      productId: 'weigh',
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
      productId: 'weigh',
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
        apiBase: resolveApiBase(localStorage),
        authorization: resolveApiAuth(localStorage).authorization ?? '',
        resolveProduct: (productId) =>
          catalogItems.find((item) => item.productId === productId),
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

<svelte:head><title>POS · KipusPay</title></svelte:head>

<div class="pos-layout">
  <!-- Top Bar Meta / Banner -->
  {#if onboardingNotice}
    <div class="glass-panel onboarding-notice" role="status" data-testid="onboarding-notice">
      <span>{onboardingNotice}</span>
    </div>
  {/if}

  <header class="pos-banner-card glass-panel">
    <div class="banner-row">
      <div class="banner-left">
        <h1 data-testid="tenant-name" class="pos-title">{session.tradeName}</h1>
        {#if checkoutOn}
          <div class="banner-pills">
            <span data-testid="pos-session-bar" class="badge badge-success" role="status">
              Sesión de caja: Abierta{loginUser ? ` · Cajero ${loginUser.userId.slice(0, 8)}` : ''}
            </span>
            <span data-testid="formalization-mode" class="badge badge-warning">
              {formalizationModeLabel(session.formalizationMode)}
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
          {#if teamOn}
            <button
              type="button"
              class="secondary seller-resolve-btn"
              data-testid="seller-resolve"
              onclick={() => (sellerResolveOpen = true)}
            >
              {sellerResolvedName || 'Vincular por badge / PIN'}
            </button>
          {/if}
        </div>
      {/if}
      {#if checkoutOn}
        <div class="customer-input-group">
          <label for="customer-doc-type">Cliente</label>
          <select id="customer-doc-type" bind:value={clientDocType} data-testid="customer-doc-type">
            <option value="1">DNI</option>
            <option value="6">RUC</option>
            <option value="4">CE</option>
          </select>
          <input
            id="customer-doc-number"
            bind:value={clientDocNumber}
            placeholder="N.º documento"
            data-testid="customer-doc-number"
          />
          <input
            id="customer-name"
            bind:value={clientName}
            placeholder="Nombre / razón social"
            data-testid="customer-name"
          />
        </div>
      {/if}
    </div>
    {#if checkoutOn && banner}
      <StatusMessage tone="warning" role="status" data-testid="formalization-banner" class="formalization-callout">
        <Icon name="info" size={16} />
        <span>{banner}</span>
      </StatusMessage>
    {/if}
  </header>

  {#if !checkoutOn}
    <div class="glass-panel checkout-disabled-panel">
      <div class="badge badge-danger">Caja Desactivada</div>
      <p data-testid="checkout-off">El cobro está desactivado para esta tienda. Contacta a tu proveedor.</p>
    </div>
  {:else}
    <div class="pos-main-grid">
      <!-- Left Column: Catalog & Instruments -->
      <div class="pos-instruments-col">
        <SellableCatalog
          items={catalogItems}
          loading={catalogLoading}
          error={catalogError}
          catalogOn={catalogOn}
          bind:query={catalogQuery}
          onAdd={addProduct}
          onQuickSale={() => (quickSaleOpen = true)}
        />

        <!-- Serial Scanner Instrument Panel -->
        {#if serialsOn}
          <section class="glass-panel serial-panel" aria-labelledby="serial-title" data-testid="main-serial-checkout">
            <div class="card-header">
              <div>
                <span class="instrument-eyebrow">Identidad por unidad</span>
                <h2 id="serial-title">Escanear Número de Serie</h2>
              </div>
              <span class="badge badge-indigo">Stock reservado</span>
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
                {cashierFacingMessage(serialStatus)}
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
                <h2 id="scale-title">Balanza por peso</h2>
              </div>
              <div class="scale-state-badge" data-testid="scale-state">
                <span class="pulse-dot"></span>
                <span>{scaleStateLabel(scaleState)}</span>
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
                {scaleState === 'CONNECTING' ? 'Conectando…' : 'Conectar balanza'}
              </button>
              <button type="button" class="primary" onclick={captureDeviceWeight} disabled={scaleState !== 'STABLE'}>
                <Icon name="scale" size={16} />
                Capturar pesada
              </button>
              <button type="button" class="secondary" onclick={disconnectScale}>
                <Icon name="edit" size={16} />
                Peso manual
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
                  Confirmar peso manual
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
              <EmptyState
                icon="cart"
                title="El carrito está vacío"
                description="Agrega un producto del catálogo o cobra una venta rápida."
              >
                <Button
                  variant="secondary"
                  data-testid="empty-cart-quick"
                  onclick={() => (quickSaleOpen = true)}
                >
                  Venta rápida
                </Button>
              </EmptyState>
            {:else}
              {#each lines as line (line.productId)}
                <div class="cart-item-row">
                  <div class="item-details">
                    <span class="item-name">{line.name}</span>
                    <span class="item-unit-price tabular-nums">S/ {formatCents(line.unitPriceCents)} c/u</span>
                  </div>
                  <div class="item-actions">
                    <div class="quantity-controls">
                      <button type="button" class="qty-btn" aria-label="Quitar uno" onclick={() => updateQuantity(line.productId, -1)}>-</button>
                      <span class="qty-value tabular-nums">{line.quantity}</span>
                      <button type="button" class="qty-btn" aria-label="Agregar uno" onclick={() => updateQuantity(line.productId, 1)}>+</button>
                    </div>
                    <span class="item-line-total tabular-nums">
                      S/ {formatCents(line.unitPriceCents * line.quantity)}
                    </span>
                    <button type="button" class="remove-item-btn" aria-label="Quitar del carrito" onclick={() => removeLine(line.productId)}>×</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Total & Charge Section -->
          <div class="cart-summary-footer">
            <div class="summary-total-box">
              <span class="total-label">Total a cobrar</span>
              <span
                data-testid="total"
                class={['total-amount', 'tabular-nums', cobroStitch, chargeSettled && 'settled']}
              >
                S/ {formatCents(payableCents)}
              </span>
            </div>

            <!-- Status Alerts -->
            {#if status}
              <StatusMessage tone="warning">
                <span data-testid="status" class="status-tag">{status}</span>
                {#if message}
                  <span data-testid="message" class="status-msg">{message}</span>
                {/if}
              </StatusMessage>
            {/if}

            <!-- Primary Action Button -->
            {#if requiresCustomerIdentity(totalCents, clientDocNumber, clientName)}
              <StatusMessage tone="warning" role="alert" data-testid="id-required">
                Boleta ≥ S/ 700 requiere documento y nombre del cliente (SUNAT).
              </StatusMessage>
            {/if}
            {#if tipOn}
              <div class="tip-input-row">
                <label for="tip-cents">Propina</label>
                <input
                  id="tip-cents"
                  type="number"
                  min="0"
                  bind:value={tipCents}
                  data-testid="tip-cents"
                  placeholder="0"
                />
                {#each [0.05, 0.1, 0.15] as frac}
                  <button
                    type="button"
                    class="secondary tip-quick"
                    data-testid={`tip-quick-${frac}`}
                    onclick={() => (tipCents = Math.round(totalCents * frac))}
                  >
                    {Math.round(frac * 100)}%
                  </button>
                {/each}
              </div>
            {/if}
            <Button
              variant="primary"
              size="xl"
              data-testid="charge"
              onclick={onCharge}
              disabled={lines.length === 0}
              icon="credit-card"
            >
              {chargeButtonLabel(formatCents(payableCents))}
            </Button>
            <Button
              variant="secondary"
              size="xl"
              data-testid="quick-sale"
              style="margin-top: 0.5rem"
              onclick={() => (quickSaleOpen = true)}
              icon="plus"
            >
              Venta rápida (sin catálogo)
            </Button>
          </div>
        </section>

        <!-- Print Preview Card -->
        {#if printPreview}
          <div class="glass-panel print-preview-card" data-testid="print-preview">
            <div class="card-header">
              <h3>Vista Previa Ticket Térmico 80mm</h3>
              <span class="badge badge-indigo">Listo para imprimir</span>
            </div>
            <div class="ticket-render-body" bind:this={previewContainer}>
              {@html printPreview}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  {#if tourOpen && tourSteps.length > 0}
    <Tour steps={tourSteps} onComplete={onTourComplete} onDismiss={onTourDismiss} />
  {/if}
  <Modal
    open={sellerResolveOpen}
    title="Vincular vendedor"
    confirmText="Vincular"
    confirmTestid="seller-resolve-confirm"
    onConfirm={onResolveSeller}
    onCancel={() => (sellerResolveOpen = false)}
  >
    <p class="quick-hint">
      Escanea el badge <code>EMP-…</code> o teclea el PIN de caja de 4 dígitos. La venta queda atribuida en menos de un segundo.
    </p>
    <Field label="Badge o PIN">
      <Input
        data-testid="seller-resolve-input"
        bind:value={sellerIdentifier}
        autocomplete="off"
        placeholder="EMP-12345 o 1234"
      />
    </Field>
    {#if sellerResolveMsg}
      <p class="quick-error" role="alert">{sellerResolveMsg}</p>
    {/if}
  </Modal>

  <Modal
    open={quickSaleOpen}
    title="Venta rápida sin catálogo"
    confirmText="Agregar al carrito"
    confirmTestid="quick-sale-add"
    onConfirm={addQuickSale}
    onCancel={() => (quickSaleOpen = false)}
  >
    <p class="quick-hint">
      Cobras algo que aún no está en tu catálogo. El servidor calcula impuestos; esta línea no descuenta stock y queda marcada para catalogar.
    </p>
    <Field label="Nombre del artículo">
      <Input
        data-testid="quick-sale-name"
        bind:value={quickName}
        placeholder="Ej.: empanada de queso"
      />
    </Field>
    <Field label="Precio (máx. S/ {formatCents(QUICK_SALE_MAX_CENTS)})">
      <MoneyInput
        data-testid="quick-sale-price"
        bind:value={quickPriceCents}
        min={1}
      />
    </Field>
    {#if quickError}
      <p class="quick-error" role="alert">{quickError}</p>
    {/if}
  </Modal>

  {#if checkoutOn}
    <nav class="pos-bottom-nav" aria-label="Navegación de caja" data-testid="pos-bottom-nav">
      <a href="/" class="pos-nav-item" class:active={page.url.pathname === '/'} data-testid="pos-nav-cobrar">
        <Icon name="check" size={18} />
        <span>Cobrar</span>
      </a>
      <a href="/caja/historial" class="pos-nav-item" data-testid="pos-nav-historial">
        <Icon name="receipt" size={18} />
        <span>Historial del día</span>
      </a>
      <a href="/caja" class="pos-nav-item" data-testid="pos-nav-caja">
        <Icon name="lock" size={18} />
        <span>Caja</span>
      </a>
      {#if showCustomerOrderNavigation({ enabled: isCustomerOrdersEnabled(), role: authenticatedRole })}
        <a href="/orders/customer" class="pos-nav-item" data-testid="pos-nav-pedidos">
          <Icon name="package" size={18} />
          <span>Pedidos retiro</span>
        </a>
      {/if}
      <a href="/ayuda" class="pos-nav-item" data-testid="pos-nav-ayuda">
        <Icon name="info" size={18} />
        <span>Ayuda</span>
      </a>
    </nav>
  {/if}
</div>

<style>
  .pos-layout {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .onboarding-notice {
    padding: 0.875rem 1.25rem;
    border: 1px solid var(--amber-gold);
    background: color-mix(in srgb, var(--amber-gold) 12%, transparent);
    color: var(--text-main);
    font-size: 0.9375rem;
  }

  .pos-bottom-nav {
    display: flex;
    justify-content: space-around;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    padding-bottom: calc(0.625rem + env(safe-area-inset-bottom, 0px));
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    position: sticky;
    bottom: 0.75rem;
    z-index: 20;
  }

  .pos-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 88px;
    min-height: 48px;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .pos-nav-item:hover {
    color: var(--text-main);
    background: rgba(255, 255, 255, 0.04);
  }

  .pos-nav-item.active {
    color: var(--accent-primary);
  }

  .pos-banner-card {
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .banner-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    min-width: 0;
    flex: 1 1 auto;
  }

  .pos-title {
    font-size: 1.375rem;
    font-weight: 800;
  }

  .banner-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .seller-input-group,
  .customer-input-group {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }

  .seller-input-group label,
  .customer-input-group label {
    margin-bottom: 0;
    white-space: nowrap;
  }

  .seller-input-group input {
    width: 180px;
    max-width: 100%;
    min-width: 0;
  }

  .customer-input-group select,
  .customer-input-group input {
    min-width: 0;
    max-width: 100%;
  }

  :global(.formalization-callout) {
    width: 100%;
    max-width: 100%;
  }

  .checkout-disabled-panel {
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
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
    flex-wrap: wrap;
    gap: 0.5rem;
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

  /* Serial Scanner Panel */
  .serial-panel {
    padding: 1.25rem;
  }
  .terminal-row, .scanner-row {
    margin-bottom: 0.875rem;
  }
  .input-with-button {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }
  .input-with-button :global(input),
  .input-with-button :global(.ui-input) {
    min-width: 0;
    flex: 1 1 12rem;
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
    background: var(--bg-primary);
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
    min-width: 44px;
    min-height: 44px;
    padding: 0;
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
    min-width: 44px;
    min-height: 44px;
    padding: 0;
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
    font-family: var(--font-mono);
    font-size: 2.25rem;
    font-weight: 800;
    color: var(--text-main);
  }
  .total-amount.settled {
    color: var(--emerald-green);
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

  .ticket-render-body :global(canvas) {
    width: 120px;
    height: 120px;
    image-rendering: pixelated;
  }

  .ticket-render-body :global([data-qr]) {
    display: inline-block;
  }

  .quick-hint {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0;
  }
  .quick-error {
    color: var(--rose-red);
    font-size: 0.85rem;
    margin: 0;
  }

  @media (max-width: 900px) {
    .pos-main-grid {
      grid-template-columns: 1fr;
    }

    .banner-row {
      flex-direction: column;
      align-items: stretch;
    }

    .banner-left {
      flex-direction: column;
      align-items: flex-start;
    }

    .seller-input-group,
    .customer-input-group {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .seller-input-group label,
    .customer-input-group label {
      white-space: normal;
    }

    .seller-input-group input,
    .customer-input-group select,
    .customer-input-group input {
      width: 100%;
    }

    .input-with-button {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
