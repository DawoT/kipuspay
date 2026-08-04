<script lang="ts">
  import { formatCents } from '$lib/cents';
  import {
    isPosCheckoutEnabled,
    isPrintTemplatesEnabled,
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

  const checkoutOn = isPosCheckoutEnabled();
  const formalizationMode = 'INTERNAL_CONTROL' as const;
  const banner = formalizationBannerMessage(formalizationMode);

  let lines = $state<CartLine[]>([
    { productId: 'p1', name: 'Producto demo', unitPriceCents: 11800, quantity: 1 },
  ]);
  let status = $state('listo');
  let message = $state('');
  let lastFeedbackMs = $state(0);
  let printPreview = $state('');

  const queue = new OfflineQueueStore(createMemoryOfflineIdb());
  const correlatives = new OfflineCorrelativeStore(1);

  const totalCents = $derived(cartTotalCents(lines));

  async function onCharge() {
    // Cobro crítico: sin await de red — encola y retorna (GTM §6.5).
    status = 'cobrando';
    if (isVitrinaEnabled()) {
      publishVitrina({
        totalCents,
        itemCount: lines.length,
        documentType: 'NV',
        phase: 'confirming',
        message: 'Confirma el pago',
      });
    }

    const outcome = await chargeCartOffline(
      lines,
      {
        formalizationMode,
        taxRegime: 'RG',
        branchId: 'b-demo',
        cashRegisterSessionId: 's-demo',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm-cash',
      },
      queue,
    );

    lastFeedbackMs = outcome.feedbackMs;
    if (!outcome.ok) {
      status = 'bloqueado';
      message = outcome.message;
      return;
    }

    correlatives.reserve(outcome.offlineSaleId, 'NV01');
    status = 'cobrado';
    message = `Venta ${outcome.offlineSaleId.slice(0, 8)}… en cola · ${outcome.documentType}`;

    if (isVitrinaEnabled()) {
      publishVitrina({
        totalCents: outcome.totalCents,
        itemCount: lines.length,
        documentType: outcome.documentType,
        phase: 'charged',
        message: 'Gracias por su compra',
      });
    }

    if (isPrintTemplatesEnabled()) {
      const ticket: TicketData = {
        enterprise: 'KipusPay Demo',
        ruc: '20100000000',
        documentType: outcome.documentType,
        series: 'NV01',
        number: correlatives.get(outcome.offlineSaleId)?.tentativeNumber ?? 0,
        totalCents: outcome.totalCents,
        items: lines.map((l) => ({
          name: l.name,
          qty: l.quantity,
          totalCents: l.unitPriceCents * l.quantity,
        })),
        lineWidth: resolveLineWidth(58),
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

{#if !checkoutOn}
  <p data-testid="checkout-off">Caja desactivada (FEATURE_POS_CHECKOUT off).</p>
  <p>Total demo: S/ {formatCents(11800)}</p>
{:else}
  <p data-testid="formalization-banner" role="status">{banner}</p>
  <p data-testid="total">Total: S/ {formatCents(totalCents)}</p>
  <p data-testid="status">{status}</p>
  <p data-testid="message">{message}</p>
  <p data-testid="feedback-ms">{Math.round(lastFeedbackMs)}</p>

  <button type="button" data-testid="add-line" onclick={addDemo}>Agregar</button>
  <button type="button" data-testid="charge" onclick={onCharge}>Cobrar</button>

  {#if printPreview}
    <div data-testid="print-preview">{@html printPreview}</div>
  {/if}
{/if}
