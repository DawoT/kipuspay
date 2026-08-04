<script lang="ts">
  /**
   * Kiosko thin: mismos guards fiscales que caja (chargeCartOffline).
   */
  import { formatCents } from '$lib/cents';
  import { isPosCheckoutEnabled } from '$lib/features';
  import { chargeCartOffline } from '$lib/pos-checkout/charge';
  import { createMemoryOfflineIdb, OfflineQueueStore } from '$lib/offline-sync/offline-queue';

  const enabled = isPosCheckoutEnabled();
  const queue = new OfflineQueueStore(createMemoryOfflineIdb());
  let message = $state('');
  let status = $state('idle');

  async function pay() {
    status = 'confirming';
    const outcome = await chargeCartOffline(
      [{ productId: 'k1', name: 'Item kiosko', unitPriceCents: 1180, quantity: 1 }],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b-kiosk',
        cashRegisterSessionId: 's-kiosk',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm-cash',
      },
      queue,
    );
    status = outcome.ok ? 'charged' : 'blocked';
    message = outcome.ok ? `OK ${outcome.documentType}` : outcome.message;
  }
</script>

{#if !enabled}
  <p data-testid="kiosk-off">Kiosko off (FEATURE_POS_CHECKOUT).</p>
{:else}
  <h1>Kiosko</h1>
  <p>Total: S/ {formatCents(1180)}</p>
  <p data-testid="kiosk-status">{status}</p>
  <p data-testid="kiosk-message">{message}</p>
  <button type="button" data-testid="kiosk-pay" onclick={pay}>Confirmar pago</button>
{/if}
