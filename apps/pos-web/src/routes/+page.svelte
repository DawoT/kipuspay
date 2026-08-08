<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isPosCheckoutEnabled,
    isPrintTemplatesEnabled,
    isSalesCommissionsEnabled,
    isVitrinaEnabled,
  } from '$lib/features';
  import { addOrBumpLine, cartTotalCents, type CartLine } from '$lib/pos-checkout/cart';
  import { chargeCartOffline } from '$lib/pos-checkout/charge';
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

  let session = $state<PosTenantSession>(defaultTenantSession());
  let lines = $state<CartLine[]>([
    { productId: 'p1', name: 'Producto demo', unitPriceCents: 11800, quantity: 1 },
  ]);
  let sellerId = $state('');
  let status = $state('listo');
  let message = $state('');
  let lastFeedbackMs = $state(0);
  let printPreview = $state('');
  let lastTtfsMs = $state<number | null>(null);

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
      return;
    }
    session = readTenantSession(sessionStorage);
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
      productId: 'p1',
      name: 'Producto demo',
      unitPriceCents: 11800,
      quantity: 1,
    });
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
