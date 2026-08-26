<script lang="ts">
  import { onMount } from 'svelte';
  import { maybeRunMarketingAutotest } from '$lib/autotest-bridge';
  import { formatCents } from '$lib/cents';
  import { isCatalogQuickAddEnabled, isCatalogVariantsEnabled, isInventoryOpsEnabled, isInventoryScaleEnabled, isInventorySerialsEnabled, isOnboardingTourEnabled, isOrdersKdsEnabled, isPosCheckoutEnabled, isPricingPromotionsEnabled, isPrintTemplatesEnabled, isCashDrawerEnabled, isCatalogSellableEnabled, isSalesCommissionsEnabled, isSaleTipEnabled, isSaleFeedbackEnabled, isShiftHandoffEnabled, isTeamInviteEnabled, isHardwareDiagnosticsEnabled, isVitrinaEnabled } from '$lib/features';
  import { resolveSeller } from '$lib/cash/shift-handoff';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import { PrintOutboxStore, createBrowserPrintIdb } from '$lib/print/print-outbox-store';
  import { enqueueAndPrintTicket } from '$lib/print/enqueue-print';
  import { buildSaleTicketSnapshot, snapshotToTicketData } from '$lib/print/offload-compile';
  import { buildPosPrinterEnv } from '$lib/print/printer-runtime';
  import { apiFetch, resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import { playSaleSuccessFeedback } from '$lib/ui/feedback.js';
  import { readLoginUser, writeLoginTenantId, type LoginUserIdentity } from '$lib/auth/token-store';
  import { claimOnboardingFromUrlIfPresent, readLastOnboardingClaim, readLastOnboardingError } from '$lib/auth/onboarding-claim';
  import { capabilitiesFromFlags } from '$lib/onboarding/capabilities';
  import { isTourEligible, readTourState, recordGrowthEvent, writeTourState } from '$lib/onboarding/tour-client';
  import { tourStepsFor, type TourStep } from '@kipuspay/domain-onboarding';
  import Tour from '$lib/ui/Tour.svelte';
  import { addOrBumpLine, cartPayableCents, cartTotalCents, genericLine, type CartLine } from '$lib/pos-checkout/cart';
  import SellableCatalog from '$lib/pos/SellableCatalog.svelte';
  import CartPanel from '$lib/pos/CartPanel.svelte';
  import SerialInstrument from '$lib/pos/SerialInstrument.svelte';
  import ScaleInstrument from '$lib/pos/ScaleInstrument.svelte';
  import CustomerIdentity from '$lib/pos/CustomerIdentity.svelte';
  import { chargeCartOffline, resolveChargeDocument } from '$lib/pos-checkout/charge';
  import { fetchBranchSeries } from '$lib/branch-series/client.js';
  import { createBrowserOfflineIdb, createHttpSyncTransport, dispatchPendingSalesChunked, OfflineQueueStore } from '$lib/offline-sync';
  import { OfflineCorrelativeStore } from '$lib/offline-correlative/reserve';
  import { publishVitrina } from '$lib/vitrina/channel';
  import { formalizationBannerMessage } from '@kipuspay/domain-fiscal-pe';
  import { buildTicketHtml } from '@kipuspay/print-templates';
  import { defaultTenantSession, markTenantFirstSale, readTenantSession, tenantFromSearchParams, writeTenantSession, type PosTenantSession } from '$lib/tenant/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Modal from '$lib/ui/Modal.svelte';
  import { formalizationModeLabel } from '$lib/ui/ops-copy';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import MoneyInput from '$lib/ui/MoneyInput.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { fetchSellableCatalog, type SellableCatalogItem } from '$lib/catalog/sellable-catalog-client';
  import { renderQrToCanvas } from '$lib/print/qr-canvas';

  const checkoutOn = isPosCheckoutEnabled();
  const commissionsOn = isSalesCommissionsEnabled();
  const serialsOn = isInventorySerialsEnabled();
  const scaleOn = isInventoryScaleEnabled();
  const catalogOn = isCatalogSellableEnabled();
  const tipOn = isSaleTipEnabled();
  const drawerOn = isCashDrawerEnabled();
  const saleFeedbackOn = isSaleFeedbackEnabled();
  const teamOn = isTeamInviteEnabled();
  const tourOn = isOnboardingTourEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let loginUser = $state<LoginUserIdentity | null>(null);
  let lines = $state<CartLine[]>([]);
  let catalogItems = $state<SellableCatalogItem[]>([]);
  let catalogLoading = $state(true);
  let catalogError = $state('');
  let catalogQuery = $state('');
  let quickSaleOpen = $state(false);
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
  let clientDocType = $state('1');
  let clientDocNumber = $state('');
  let clientName = $state('');
  let tipCents = $state<number | null>(0);
  let onboardingSession = $state<{ branchId: string; sessionId: string } | null>(null);
  let onboardingNotice = $state('');
  let tourOpen = $state(false);
  let tourSteps = $state<readonly TourStep[]>([]);

  const queue = new OfflineQueueStore(createBrowserOfflineIdb());
  const correlatives = new OfflineCorrelativeStore(1);
  const printIdb = createBrowserPrintIdb();
  const printOutbox = new PrintOutboxStore(printIdb);
  const banner = $derived(formalizationBannerMessage(session.formalizationMode));
  const chargeSettled = $derived(status === 'completado');
  const capabilities = capabilitiesFromFlags({ kds: isOrdersKdsEnabled(), fefo: isInventoryOpsEnabled(), scale: isInventoryScaleEnabled(), promotions: isPricingPromotionsEnabled(), variants: isCatalogVariantsEnabled(), quickAdd: isCatalogQuickAddEnabled(), shiftHandoff: isShiftHandoffEnabled(), teamInvite: isTeamInviteEnabled(), hardwareDiagnostics: isHardwareDiagnosticsEnabled() });

  function handleAddLine(next: CartLine) {
    lines = addOrBumpLine(lines, next);
  }

  onMount(() => {
    void maybeRunMarketingAutotest(); if (typeof window === 'undefined') return;
    const fromQs = tenantFromSearchParams(new URLSearchParams(window.location.search));
    if (fromQs) { writeTenantSession(sessionStorage, fromQs); session = fromQs; writeLoginTenantId(localStorage, fromQs.tenantId); } else session = readTenantSession(sessionStorage);
    if (session.tenantId && session.taxRegime === 'UNKNOWN') void (async () => { try { const res = await apiFetch('/api/tenant/context', { storage: localStorage }); if (!res.ok) return; const d = (await res.json()) as any; const mOk = d.formalizationMode==='INTERNAL_CONTROL'||d.formalizationMode==='FORMALIZING'||d.formalizationMode==='ELECTRONIC_ISSUER'; const rOk = d.taxRegime==='NRUS'||d.taxRegime==='RER'||d.taxRegime==='RMT'||d.taxRegime==='RG'||d.taxRegime==='UNKNOWN'; if(!mOk&&!rOk&&!d.tradeName) return; const n={...session,...(mOk?{formalizationMode:d.formalizationMode}:{}),...(rOk?{taxRegime:d.taxRegime}:{}),...(d.tradeName?{tradeName:d.tradeName}:{})} as PosTenantSession; if(n.taxRegime!==session.taxRegime||n.formalizationMode!==session.formalizationMode||n.tradeName!==session.tradeName){ writeTenantSession(sessionStorage,n); session=n; }} catch{}})();
    loginUser=readLoginUser(localStorage);
    void claimOnboardingFromUrlIfPresent().then((c)=>{ const s=readLastOnboardingClaim(); if(s) onboardingSession={branchId:s.branchId,sessionId:s.sessionId}; if(c) loginUser=readLoginUser(localStorage); else if(readLastOnboardingError()&&!readLoginUser(localStorage)) onboardingNotice=`No pudimos iniciar tu sesión automáticamente (${readLastOnboardingError()}). Usa "Ingresar" con tu badge y PIN.`;});
    void loadSellableCatalog(); maybeShowTour();
    const kd=(e:KeyboardEvent)=>{ if(e.key==='F9'&&isPosCheckoutEnabled()&&lines.length>0&&status!=='cobrando'){ e.preventDefault(); void onCharge(); }};
    window.addEventListener('keydown',kd); return()=>window.removeEventListener('keydown',kd);
  });

  function maybeShowTour(){ if(!tourOn) return; if(!isTourEligible({hasSold:session.firstSaleAtIso!==null,localState:readTourState(localStorage,session.verticalType)})) return; const s=tourStepsFor({vertical:session.verticalType,role:'cashier',capabilities,hasSold:false}); if(s.length===0) return; tourSteps=s; tourOpen=true; void recordGrowthEvent('tour_started',{vertical:session.verticalType});}
  function onTourComplete(){ tourOpen=false; writeTourState(localStorage,session.verticalType,'completed'); void recordGrowthEvent('tour_completed',{steps:tourSteps.length});}
  function onTourDismiss(){ tourOpen=false; writeTourState(localStorage,session.verticalType,'dismissed'); void recordGrowthEvent('tour_dismissed',{step:0});}
  async function flushPendingSales(){ try{ const b=resolveApiBase(localStorage); await dispatchPendingSalesChunked(queue, createHttpSyncTransport({ endpointUrl: `${b}/api/v1/sync/sales`, bearerToken: localStorage.getItem('kipuspay_token')??undefined, tenantId: localStorage.getItem('kipuspay_tenant_id')??undefined})); }catch{}}
  async function onCharge(){ status='cobrando'; if(!onboardingSession){ status='bloqueado'; message='No hay una sesión de caja abierta. Inicia sesión o abre la caja.'; return; } const branchId=onboardingSession.branchId; let branchSeries: readonly any[] = []; try{ branchSeries=await fetchBranchSeries(branchId);}catch{ branchSeries=[]; } const chargeDoc=resolveChargeDocument({ formalizationMode: session.formalizationMode, taxRegime: session.taxRegime, clientDocumentType: clientDocType, clientDocumentNumber: clientDocNumber.trim(), branchSeries }); if(isVitrinaEnabled()) publishVitrina({ totalCents: cartTotalCents(lines), itemCount: lines.length, documentType: chargeDoc.documentType, phase:'confirming', message:'Confirma el pago', ...(session.brandQrEnabled?{brandLabel:'Emitido con KipusPay'}:{})}); const outcome=await chargeCartOffline(lines,{ formalizationMode: session.formalizationMode, taxRegime: session.taxRegime, branchId, cashRegisterSessionId: onboardingSession?.sessionId??'', series: chargeDoc.series, clientDocumentType: clientDocType, clientDocumentNumber: clientDocNumber.trim(), clientName: clientName.trim(), paymentMethodId:'pm-cash', documentTypeOverride: chargeDoc.documentType, ...(commissionsOn&&sellerId.trim()?{sellerId:sellerId.trim()}:{}), ...(tipOn&&Number.isInteger(tipCents)&&tipCents>0?{tipCents: Math.round(tipCents)}:{})}, queue); if(!outcome.ok){ status='bloqueado'; message=outcome.message; return;} status='completado'; message=`Venta ${outcome.offlineSaleId} cobrada.`; if(saleFeedbackOn) playSaleSuccessFeedback(); if(drawerOn) void createPrinterTransport().openDrawer(); void flushPendingSales(); if(session.firstSaleAtIso===null){ const n=markTenantFirstSale(session,new Date().toISOString()); writeTenantSession(sessionStorage,n); session=n; void recordGrowthEvent('first_sale',{vertical:session.verticalType}); } if(isPrintTemplatesEnabled()){ const s=chargeDoc.series; const r=correlatives.reserve(outcome.offlineSaleId,s); const snap=buildSaleTicketSnapshot({ enterprise: session.tradeName, ruc:'', documentType: chargeDoc.documentType, series:s, number:r.tentativeNumber, totalCents: cartPayableCents(lines), items: lines.map(l=>({name:l.name, qty:l.quantity, totalCents:l.unitPriceCents*l.quantity})), ...(session.brandQrEnabled?{brandFooter:{enabled:true,label:'Emitido con KipusPay',shortUrl:'kipuspay.com',qrPayload:'https://kipuspay.com'}}:{})}); printPreview=buildTicketHtml(snapshotToTicketData(snap)); void enqueueAndPrintTicket({ outbox: printOutbox, transport: createPrinterTransport(buildPosPrinterEnv()), saleId: outcome.offlineSaleId, ticket: snap});}}
  function addProduct(item: SellableCatalogItem) {
    handleAddLine({ productId: item.productId, name: item.name, unitPriceCents: item.unitPriceCents, quantity: 1 });
  }
  $effect(()=>{ const h=printPreview; const c=previewContainer; if(!h||!c) return; c.querySelectorAll<HTMLElement>('[data-qr], [data-brand-qr]').forEach((el)=>{ const p=el.dataset.qr??el.dataset.brandQr??''; if(!p||el.dataset.qrRendered==='1') return; el.dataset.qrRendered='1'; const canvas=document.createElement('canvas'); renderQrToCanvas(canvas,p,120); canvas.setAttribute('data-testid','ticket-qr'); canvas.setAttribute('title',p); canvas.setAttribute('aria-label','Código QR del comprobante'); el.replaceChildren(canvas);});});
  async function loadSellableCatalog(){ if(!catalogOn){ catalogLoading=false; return;} catalogLoading=true; catalogError=''; try{ catalogItems=await fetchSellableCatalog({ apiBase: resolveApiBase(localStorage), authorization: resolveApiAuth(localStorage).authorization??'', tenantId: resolveApiAuth(localStorage)['x-tenant-id']});}catch{ catalogError='No se pudo cargar el catálogo. La venta rápida sigue disponible.'; } finally{ catalogLoading=false;}}
  function addQuickSale(){ const name=quickName.trim(); if(!name||quickPriceCents===null||!Number.isInteger(quickPriceCents)||quickPriceCents<=0){ quickError='Ingresa un nombre y un precio válido.'; return;} if(quickPriceCents>QUICK_SALE_MAX_CENTS){ quickError=`El precio máximo sin autorización es S/ ${formatCents(QUICK_SALE_MAX_CENTS)}.`; return;} const next=genericLine(name, quickPriceCents); lines=addOrBumpLine(lines, genericLine(name, quickPriceCents)); quickSaleOpen=false; quickName=''; quickError='';}
  async function onResolveSeller(){ sellerResolveMsg=''; const r=await resolveSeller(sellerIdentifier); if(!r.ok){ sellerResolveMsg=r.message; return;} sellerId=r.userId; sellerResolvedName=r.email; sellerResolveOpen=false; sellerIdentifier='';}
  function removeLine(id:string){ lines=lines.filter(l=>l.productId!==id);}
  function updateQuantity(id:string,delta:number){ lines=lines.map(l=>l.productId!==id?l:l.quantity+delta>0?{...l,quantity:l.quantity+delta}:null).filter((l):l is CartLine=>l!==null);}
</script>

<svelte:head><title>POS · KipusPay</title></svelte:head>

<div class="pos-layout">
  {#if onboardingNotice}
    <div class="ledger-card onboarding-notice" role="status" data-testid="onboarding-notice"><span>{onboardingNotice}</span></div>
  {/if}
  <header class="pos-banner-card ledger-card">
    <div class="banner-row">
      <div class="banner-left">
        <h1 data-testid="tenant-name" class="pos-title">{session.tradeName}</h1>
        {#if checkoutOn}
          <div class="banner-pills">
            <span data-testid="pos-session-bar" class="badge badge-success" role="status">Sesión de caja: Abierta{loginUser ? ` · Cajero ${loginUser.userId.slice(0, 8)}` : ''}</span>
            <span data-testid="formalization-mode" class="badge badge-warning">{formalizationModeLabel(session.formalizationMode)}</span>
          </div>
        {/if}
      </div>
      {#if checkoutOn && commissionsOn}
        <div class="seller-input-group">
          <label for="seller-id-input">Vendedor</label>
          <input id="seller-id-input" bind:value={sellerId} placeholder="ID Vendedor (opcional)" data-testid="seller-id" />
          {#if teamOn}
            <button type="button" class="secondary seller-resolve-btn" data-testid="seller-resolve" onclick={() => (sellerResolveOpen = true)}>{sellerResolvedName || 'Vincular por badge / PIN'}</button>
          {/if}
        </div>
      {/if}
      {#if checkoutOn}
        <CustomerIdentity bind:docType={clientDocType} bind:docNumber={clientDocNumber} bind:customerName={clientName} />
      {/if}
    </div>
    {#if checkoutOn && banner}
      <StatusMessage tone="warning" role="status" data-testid="formalization-banner" class="formalization-callout"><Icon name="info" size={16} /><span>{banner}</span></StatusMessage>
    {/if}
  </header>

  {#if !checkoutOn}
    <div class="ledger-card checkout-disabled-panel">
      <div class="badge badge-danger">Caja Desactivada</div>
      <p data-testid="checkout-off">El cobro está desactivado para esta tienda. Contacta a tu proveedor.</p>
    </div>
  {:else}
    <div class="pos-main-grid">
      <div class="pos-instruments-col">
        <SellableCatalog items={catalogItems} loading={catalogLoading} error={catalogError} catalogOn={catalogOn} bind:query={catalogQuery} onAdd={addProduct} onQuickSale={() => (quickSaleOpen = true)} />
        {#if serialsOn}
          <SerialInstrument {catalogItems} onAddLine={handleAddLine} />
        {/if}
        {#if scaleOn}
          <ScaleInstrument onAddLine={handleAddLine} />
        {/if}
      </div>
      <div class="pos-cart-col">
        <CartPanel bind:lines {status} {message} bind:tipCents {tipOn} {clientDocNumber} {clientName} {chargeSettled} onCharge={onCharge} onQuickSale={() => (quickSaleOpen = true)} onRemoveLine={removeLine} onUpdateQuantity={updateQuantity} />
        {#if printPreview}
          <div class="ledger-card print-preview-card" data-testid="print-preview">
            <div class="card-header"><h3>Vista Previa Ticket Térmico 80mm</h3><span class="badge badge-indigo">Listo para imprimir</span></div>
            <div class="ticket-render-body" bind:this={previewContainer}>{@html printPreview}</div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  {#if tourOpen && tourSteps.length > 0}
    <Tour steps={tourSteps} onComplete={onTourComplete} onDismiss={onTourDismiss} />
  {/if}
  <Modal open={sellerResolveOpen} title="Vincular vendedor" confirmText="Vincular" confirmTestid="seller-resolve-confirm" onConfirm={onResolveSeller} onCancel={() => (sellerResolveOpen = false)}>
    <p class="quick-hint">Escanea el badge <code>EMP-…</code> o teclea el PIN de caja de 4 dígitos. La venta queda atribuida en menos de un segundo.</p>
    <Field label="Badge o PIN"><Input data-testid="seller-resolve-input" bind:value={sellerIdentifier} autocomplete="off" placeholder="EMP-12345 o 1234" /></Field>
    {#if sellerResolveMsg}<p class="quick-error" role="alert">{sellerResolveMsg}</p>{/if}
  </Modal>
  <Modal open={quickSaleOpen} title="Venta rápida sin catálogo" confirmText="Agregar al carrito" confirmTestid="quick-sale-add" onConfirm={addQuickSale} onCancel={() => (quickSaleOpen = false)}>
    <p class="quick-hint">Cobras algo que aún no está en tu catálogo. El servidor calcula impuestos; esta línea no descuenta stock y queda marcada para catalogar.</p>
    <Field label="Nombre del artículo"><Input data-testid="quick-sale-name" bind:value={quickName} placeholder="Ej.: empanada de queso" /></Field>
    <Field label="Precio (máx. S/ {formatCents(QUICK_SALE_MAX_CENTS)})"><MoneyInput data-testid="quick-sale-price" bind:value={quickPriceCents} min={1} /></Field>
    {#if quickError}<p class="quick-error" role="alert">{quickError}</p>{/if}
  </Modal>
</div>

<style>
  .pos-layout{display:flex;flex-direction:column;gap:1.25rem}
  .onboarding-notice{padding:.875rem 1.25rem;border:1px solid var(--amber-gold);background:color-mix(in srgb,var(--amber-gold) 12%,transparent);color:var(--text-main);font-size:.9375rem}
  .pos-banner-card{padding:1rem 1.25rem;display:flex;flex-direction:column;gap:.75rem}
  .banner-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
  .banner-left{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;min-width:0;flex:1 1 auto}
  .pos-title{font-size:1.375rem;font-weight:800}
  .banner-pills{display:flex;flex-wrap:wrap;gap:.5rem}
  .seller-input-group{display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-3);min-width:0}
  .seller-input-group label{margin-bottom:0;white-space:nowrap}
  .seller-input-group input{width:180px;max-width:100%;min-width:0;padding:var(--inset-field)}
  :global(.formalization-callout){width:100%;max-width:100%}
  .checkout-disabled-panel{padding:2rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1rem}
  .pos-main-grid{display:grid;grid-template-columns:1fr 420px;gap:1.25rem;align-items:start}
  .pos-instruments-col,.pos-cart-col{display:flex;flex-direction:column;gap:1.25rem}
  .card-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem}
  .card-header h3{font-size:1.125rem;font-weight:700}
  .ticket-render-body{background:#fff;color:#000;padding:1rem;border-radius:var(--radius-sm);overflow-x:auto}
  .ticket-render-body :global(canvas){width:120px;height:120px;image-rendering:pixelated}
  .ticket-render-body :global([data-qr]){display:inline-block}
  .quick-hint{font-size:.85rem;color:var(--text-muted);margin:0}
  .quick-error{color:var(--rose-red);font-size:.85rem;margin:0}
  @media (max-width:899px){.pos-main-grid{grid-template-columns:1fr}.banner-row{flex-direction:column;align-items:stretch}.banner-left{flex-direction:column;align-items:flex-start}.seller-input-group{width:100%;flex-direction:column;align-items:stretch}.seller-input-group label{white-space:normal}.seller-input-group input{width:100%}}
</style>
