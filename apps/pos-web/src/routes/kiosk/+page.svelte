<script lang="ts">
  /**
   * Kiosko thin: mismos guards fiscales que caja (chargeCartOffline).
   */
  import { formatCents } from '$lib/cents';
  import { isPosCheckoutEnabled, isPrintTemplatesEnabled } from '$lib/features';
  import { chargeCartOffline } from '$lib/pos-checkout/charge';
  import { createMemoryOfflineIdb, OfflineQueueStore } from '$lib/offline-sync/offline-queue';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import BrandKnot from '$lib/ui/BrandKnot.svelte';
  import { vitrinaPhaseLabel } from '$lib/vitrina/vitrina-copy';
  import { documentKindLabel } from '$lib/ui/ops-copy';
  import { apiFetch } from '$lib/auth/api-client';
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { readTenantSession } from '$lib/tenant/session';
  import { OfflineCorrelativeStore } from '$lib/offline-correlative/reserve';
  import { PrintOutboxStore, createBrowserPrintIdb } from '$lib/print/print-outbox-store';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import { enqueueAndPrintTicket } from '$lib/print/enqueue-print';
  import { buildSaleTicketSnapshot } from '$lib/print/offload-compile';
  import { buildPosPrinterEnv } from '$lib/print/printer-runtime';

  const enabled = isPosCheckoutEnabled();
  const queue = new OfflineQueueStore(createMemoryOfflineIdb());
  const correlatives = new OfflineCorrelativeStore(1);
  const printOutbox = new PrintOutboxStore(createBrowserPrintIdb());
  import { onMount } from 'svelte';
  let message = $state('');
  let status = $state('idle');
  let product = $state<{ id: string; name: string; priceCents: number } | null>(null);
  let catalogState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');

  onMount(() => {
    if (enabled && session.branchId) void loadSellable();
  });

  const session = $derived({
    branchId: tenantBranchId(localStorage),
    sessionId: cashSessionContext(localStorage).sessionId,
  });

  function kioskPhaseLabel(phase: string): string {
    if (phase === 'blocked') return 'No se pudo cobrar';
    if (phase === 'idle' || phase === 'confirming' || phase === 'charged') {
      return vitrinaPhaseLabel(phase);
    }
    return 'Esperando';
  }

  async function loadSellable() {
    catalogState = 'loading';
    try {
      const res = await apiFetch(`/api/catalog/sellable?branchId=${encodeURIComponent(session.branchId)}`, {
        storage: localStorage,
      });
      if (!res.ok) {
        catalogState = 'error';
        return;
      }
      const json = (await res.json()) as {
        items?: Array<{ productId: string; name: string; unitPriceCents: number }>;
      };
      const first = (json.items ?? []).find((i) => i.unitPriceCents > 0);
      if (!first) {
        catalogState = 'empty';
        return;
      }
      product = { id: first.productId, name: first.name, priceCents: first.unitPriceCents };
      catalogState = 'ready';
    } catch {
      catalogState = 'error';
    }
  }

  async function pay() {
    if (!product || !session.branchId || !session.sessionId) {
      message = 'El kiosko necesita una sesión de caja abierta para cobrar.';
      status = 'blocked';
      return;
    }
    status = 'confirming';
    const outcome = await chargeCartOffline(
      [{ productId: product.id, name: product.name, unitPriceCents: product.priceCents, quantity: 1 }],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: session.branchId,
        cashRegisterSessionId: session.sessionId,
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm-cash',
      },
      queue,
    );
    status = outcome.ok ? 'charged' : 'blocked';
    message = outcome.ok ? `Pagado · ${documentKindLabel(outcome.documentType)}` : outcome.message;
    if (!outcome.ok || !isPrintTemplatesEnabled()) return;
    const tenant = readTenantSession(sessionStorage);
    const reserve = correlatives.reserve(outcome.offlineSaleId, 'NV01');
    const snapshot = buildSaleTicketSnapshot({
      enterprise: tenant.tradeName,
      ruc: '',
      documentType: 'NV',
      series: 'NV01',
      number: reserve.tentativeNumber,
      totalCents: product.priceCents,
      items: [{ name: product.name, qty: 1, totalCents: product.priceCents }],
    });
    // C7: imprime por la ladder real (best-effort; nunca bloquea el cobro).
    void enqueueAndPrintTicket({
      outbox: printOutbox,
      transport: createPrinterTransport(buildPosPrinterEnv()),
      saleId: outcome.offlineSaleId,
      ticket: snapshot,
    });
  }
</script>

<svelte:head><title>Kiosko de Autoatención · KipusPay</title></svelte:head>

<div class="page-shell kiosk-shell" data-testid="kiosk-root">
  {#if !enabled}
    <div class="feature-off-banner" data-testid="kiosk-off">
      <Icon name="info" size={18} />
      <span>El kiosko está desactivado para esta tienda.</span>
    </div>
  {:else}
    <div class="ledger-card kiosk-card">
      <div class="kiosk-header">
        <div class="brand-badge">
          <BrandKnot size={18} />
        </div>
        <p class="page-eyebrow">Autoatención</p>
        <h1 class="page-title">Kiosko de pedidos</h1>
        <p class="page-lede">Realiza tu pedido y pago directo en autoservicio.</p>
      </div>

      <div class="cart-summary">
        {#if catalogState === 'loading'}
          <p class="kiosk-loading">Cargando catálogo…</p>
        {:else if catalogState === 'empty'}
          <div class="kiosk-empty" data-testid="kiosk-empty">
            <p>Sin productos disponibles para vender en el kiosko.</p>
            <p class="kiosk-hint">Agrega productos al catálogo con precio para habilitar el autoservicio.</p>
          </div>
        {:else if catalogState === 'error'}
          <p class="kiosk-error">No se pudo cargar el catálogo. Reintenta en un momento.</p>
        {:else if product}
          <div class="cart-item">
            <span class="item-name">{product.name}</span>
            <span class="item-price tabular-nums">S/ {formatCents(product.priceCents)}</span>
          </div>
          <div class="total-row">
            <span>Total a pagar</span>
            <span class="total-amount tabular-nums">S/ {formatCents(product.priceCents)}</span>
          </div>
        {/if}
      </div>

      {#if message}
        <StatusMessage tone={status === 'charged' ? 'info' : 'danger'} aria-live="polite" data-testid="kiosk-message">
          <Icon name={status === 'charged' ? 'check' : 'alert'} size={16} />
          <span>{message}</span>
        </StatusMessage>
      {/if}

      <div class="status-line" data-testid="kiosk-status">
        Estado: <strong>{kioskPhaseLabel(status)}</strong>
      </div>

      <button
        type="button"
        class="primary pay-btn"
        data-testid="kiosk-pay"
        onclick={pay}
        disabled={status === 'confirming' || !product}
      >
        <Icon name="credit-card" size={18} />
        {status === 'confirming' ? 'Procesando…' : 'Confirmar pago'}
      </button>
    </div>
  {/if}
</div>

<style>
  .kiosk-shell {
    min-height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--inset-shell);
  }

  .kiosk-card {
    max-width: 28rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .kiosk-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .brand-badge {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: var(--radius-full);
    background: rgba(217, 154, 61, 0.15);
    border: 1px solid var(--border-glow);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-primary);
    margin-bottom: 0.5rem;
  }

  .cart-summary {
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .cart-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.9375rem;
    color: var(--text-main);
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.75rem;
    font-weight: 700;
  }

  .total-amount {
    font-family: var(--font-mono);
    font-size: 1.35rem;
    color: var(--accent-primary);
  }

  .status-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    text-align: center;
  }

  .pay-btn {
    width: 100%;
    padding: 0.875rem;
    font-size: 1.05rem;
  }
</style>
