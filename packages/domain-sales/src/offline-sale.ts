/**
 * Contratos de venta offline (Arquitectura §6) — puro, sin D1/Hono.
 */

export class InsufficientStockError extends Error {
  readonly productId: string;
  readonly requested: number;
  readonly available: number;

  constructor(productId: string, requested: number, available: number) {
    super(
      `Stock insuficiente para producto ${productId}: solicitado ${requested}, disponible ${available}`,
    );
    this.name = 'InsufficientStockError';
    this.productId = productId;
    this.requested = requested;
    this.available = available;
  }
}

export interface OfflinePaymentPayload {
  readonly paymentMethodId: string;
  readonly amountCents: number;
  readonly referenceNumber?: string | undefined;
  /** DAT-05: crédito de tienda → CxC en la misma tx (servidor revalida). */
  readonly isCredit?: boolean | undefined;
  /**
   * Captura offline de medio electrónico (§5.4 edge 2B):
   * 'API' si el adquirente confirmó en línea; 'MANUAL' = cajero verificó visualmente sin red.
   */
  readonly captureStatus?: 'API' | 'MANUAL' | undefined;
}

export interface OfflineSaleItemPayload {
  readonly productId: string;
  readonly quantity: number;
  readonly discountAmountCents?: number | undefined;
}

export interface OfflineSalePayload {
  readonly offlineSaleId: string;
  readonly issuedAt?: string | undefined;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly documentType: 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08';
  readonly series: string;
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
  readonly clientName: string;
  /** Snapshot CRM opcional — consolidación LWW server-side (SYN-08). */
  readonly clientEmail?: string | undefined;
  readonly clientPhone?: string | undefined;
  readonly clientAddress?: string | undefined;
  readonly clientProfileUpdatedAt?: string | undefined;
  /** SYN-11: id local del cliente nuevo en el turno (single-writer pre-chunk). */
  readonly localClientId?: string | undefined;
  readonly currency?: 'PEN' | undefined;
  readonly items: readonly OfflineSaleItemPayload[];
  readonly payments: readonly OfflinePaymentPayload[];
  /** NV_RETURN / NC: venta origen para compensación CxC (edge E-D). */
  readonly referencedSaleId?: string | undefined;
  /** S17: hash del authorization_token para descuentos sobre umbral. */
  readonly discountAuthorizationTokenHash?: string | null | undefined;
  /** S17: override de credit_limit. */
  readonly creditOverrideTokenHash?: string | null | undefined;
}

const ISSUED_AT_SKEW_MS = 6 * 3600 * 1000;

function requireNonEmpty(value: string | undefined, code: string): void {
  if (!value?.trim()) throw new Error(code);
}

function assertItems(items: readonly OfflineSaleItemPayload[]): void {
  if (!items?.length) throw new Error('EMPTY_ITEMS');
  for (const item of items) {
    requireNonEmpty(item.productId, 'MISSING_PRODUCT_ID');
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('INVALID_QUANTITY');
    if (
      item.discountAmountCents !== undefined &&
      (!Number.isInteger(item.discountAmountCents) || item.discountAmountCents < 0)
    ) {
      throw new Error('INVALID_DISCOUNT_CENTS');
    }
  }
}

function assertPayments(payments: readonly OfflinePaymentPayload[]): void {
  if (!payments?.length) throw new Error('EMPTY_PAYMENTS');
  for (const pay of payments) {
    requireNonEmpty(pay.paymentMethodId, 'MISSING_PAYMENT_METHOD');
    if (!Number.isInteger(pay.amountCents) || pay.amountCents < 0) {
      throw new Error('INVALID_PAYMENT_CENTS');
    }
    if (
      pay.captureStatus !== undefined &&
      pay.captureStatus !== 'API' &&
      pay.captureStatus !== 'MANUAL'
    ) {
      throw new Error('INVALID_CAPTURE_STATUS');
    }
  }
}

export function assertOfflineSaleShape(payload: OfflineSalePayload): void {
  requireNonEmpty(payload.offlineSaleId, 'MISSING_OFFLINE_SALE_ID');
  requireNonEmpty(payload.branchId, 'MISSING_BRANCH_ID');
  requireNonEmpty(payload.cashRegisterSessionId, 'MISSING_SESSION_ID');
  if (
    payload.documentType !== 'NV' &&
    payload.documentType !== 'NV_RETURN' &&
    payload.documentType !== '01' &&
    payload.documentType !== '03' &&
    payload.documentType !== '07' &&
    payload.documentType !== '08'
  ) {
    throw new Error('UNSUPPORTED_DOCUMENT_TYPE');
  }
  requireNonEmpty(payload.series, 'MISSING_SERIES');
  requireNonEmpty(payload.clientDocumentType, 'MISSING_CLIENT_DOC_TYPE');
  requireNonEmpty(payload.clientDocumentNumber, 'MISSING_CLIENT_DOC_NUMBER');
  requireNonEmpty(payload.clientName, 'MISSING_CLIENT_NAME');
  assertItems(payload.items);
  assertPayments(payload.payments);
}

/** SYN-04/SEC-06: ventana ±6h; fuera → error (nunca re-fechar). */
export function resolveIssuedAtMs(issuedAt: string | undefined, nowMs: number): number {
  const clientTime = issuedAt ? new Date(issuedAt).getTime() : nowMs;
  if (!Number.isFinite(clientTime)) throw new Error('INVALID_ISSUED_AT');
  if (nowMs - clientTime > ISSUED_AT_SKEW_MS || clientTime > nowMs + ISSUED_AT_SKEW_MS) {
    throw new Error('ISSUED_AT_SKEW_VIOLATION');
  }
  return clientTime;
}

export function toLimaTimestamp(validatedTimeMs: number): string {
  return new Date(validatedTimeMs - 5 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

export interface NvLineCents {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly discountCents: number;
  readonly subtotalCents: number;
  readonly igvCents: number;
  readonly totalCents: number;
  readonly unitCostCents: number;
  /** S18 FEFO: lote asignado (opcional; adapter puede partir líneas). */
  readonly batchId?: string | null;
}

export interface CatalogPriceCost {
  readonly priceCents: number;
  /** Snapshot COGS: preferir PMP branch (servidor); nunca precio cliente. */
  readonly costCents: number;
}

export interface NvTotals {
  readonly lines: readonly NvLineCents[];
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalDiscountCents: number;
  readonly totalCogsCents: number;
  readonly totalAmountCents: number;
}

/**
 * Totales NV server-side (IGV 18%, Math.round).
 * `catalog` ya trae precio de lista resuelto y PMP/costo snapshot (Zero-Trust).
 */
export function computeNvLineTotals(
  items: readonly OfflineSaleItemPayload[],
  catalog: ReadonlyMap<string, CatalogPriceCost>,
): NvTotals {
  const lines: NvLineCents[] = [];
  let totalTaxableCents = 0;
  let totalIgvCents = 0;
  let totalDiscountCents = 0;
  let totalCogsCents = 0;
  let totalAmountCents = 0;

  for (const item of items) {
    const product = catalog.get(item.productId);
    if (!product) throw new Error(`Product not found: ${item.productId}`);
    if (!Number.isInteger(product.priceCents) || product.priceCents < 0) {
      throw new Error('INVALID_UNIT_PRICE');
    }
    if (!Number.isInteger(product.costCents) || product.costCents < 0) {
      throw new Error('INVALID_UNIT_COST');
    }
    const discountCents = item.discountAmountCents ?? 0;
    const subtotalCents = Math.round(item.quantity * product.priceCents) - discountCents;
    if (subtotalCents < 0) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
    const igvCents = Math.round((subtotalCents * 18) / 100);
    const totalCents = subtotalCents + igvCents;
    const unitCostCents = product.costCents;
    lines.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
      discountCents,
      subtotalCents,
      igvCents,
      totalCents,
      unitCostCents,
      batchId: null,
    });
    totalTaxableCents += subtotalCents;
    totalIgvCents += igvCents;
    totalDiscountCents += discountCents;
    totalCogsCents += Math.round(unitCostCents * item.quantity);
    totalAmountCents += totalCents;
  }

  return {
    lines,
    totalTaxableCents,
    totalIgvCents,
    totalDiscountCents,
    totalCogsCents,
    totalAmountCents,
  };
}

/**
 * Parte líneas NV por FEFO y asigna batchId. Recalcula subtotales/IGV por tramo.
 */
export function splitNvLinesByFefo(
  lines: readonly NvLineCents[],
  allocationsByProduct: ReadonlyMap<string, readonly { batchId: string; qty: number }[]>,
): NvLineCents[] {
  const out: NvLineCents[] = [];
  for (const line of lines) {
    const allocs = allocationsByProduct.get(line.productId);
    if (!allocs || allocs.length === 0) {
      out.push({ ...line, batchId: line.batchId ?? null });
      continue;
    }
    const sumQty = allocs.reduce((s, a) => s + a.qty, 0);
    if (Math.abs(sumQty - line.quantity) > 1e-9) throw new Error('FEFO_QTY_MISMATCH');
    let discountLeft = line.discountCents;
    let taxableLeft = line.subtotalCents;
    let igvLeft = line.igvCents;
    let totalLeft = line.totalCents;
    for (let i = 0; i < allocs.length; i++) {
      const a = allocs[i]!;
      const isLast = i === allocs.length - 1;
      const discountCents = isLast
        ? discountLeft
        : Math.round((line.discountCents * a.qty) / line.quantity);
      const subtotalCents = isLast
        ? taxableLeft
        : Math.round((line.subtotalCents * a.qty) / line.quantity);
      const igvCents = isLast ? igvLeft : Math.round((line.igvCents * a.qty) / line.quantity);
      const totalCents = isLast ? totalLeft : Math.round((line.totalCents * a.qty) / line.quantity);
      if (!isLast) {
        discountLeft -= discountCents;
        taxableLeft -= subtotalCents;
        igvLeft -= igvCents;
        totalLeft -= totalCents;
      }
      out.push({
        productId: line.productId,
        quantity: a.qty,
        unitPriceCents: line.unitPriceCents,
        discountCents,
        subtotalCents,
        igvCents,
        totalCents,
        unitCostCents: line.unitCostCents,
        batchId: a.batchId,
      });
    }
  }
  return out;
}
