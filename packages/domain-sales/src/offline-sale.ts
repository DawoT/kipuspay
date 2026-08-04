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
  readonly documentType: 'NV';
  readonly series: string;
  readonly clientDocumentType: string;
  readonly clientDocumentNumber: string;
  readonly clientName: string;
  readonly currency?: 'PEN' | undefined;
  readonly items: readonly OfflineSaleItemPayload[];
  readonly payments: readonly OfflinePaymentPayload[];
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
  }
}

export function assertOfflineSaleShape(payload: OfflineSalePayload): void {
  requireNonEmpty(payload.offlineSaleId, 'MISSING_OFFLINE_SALE_ID');
  requireNonEmpty(payload.branchId, 'MISSING_BRANCH_ID');
  requireNonEmpty(payload.cashRegisterSessionId, 'MISSING_SESSION_ID');
  if (payload.documentType !== 'NV') throw new Error('UNSUPPORTED_DOCUMENT_TYPE');
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
}

export interface NvTotals {
  readonly lines: readonly NvLineCents[];
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalDiscountCents: number;
  readonly totalCogsCents: number;
  readonly totalAmountCents: number;
}

/** Totales NV server-side (IGV 18%, Math.round). */
export function computeNvLineTotals(
  items: readonly OfflineSaleItemPayload[],
  catalog: ReadonlyMap<string, { priceCents: number; costCents: number }>,
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
    const discountCents = item.discountAmountCents ?? 0;
    const subtotalCents = item.quantity * product.priceCents - discountCents;
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
    });
    totalTaxableCents += subtotalCents;
    totalIgvCents += igvCents;
    totalDiscountCents += discountCents;
    totalCogsCents += unitCostCents * item.quantity;
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
