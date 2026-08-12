/**
 * Contratos de venta offline (Arquitectura §6) — puro, sin D1/Hono.
 */

import { applyIgvCents, IGV_RATE_PER_MILLE } from './taxes.js';

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
  /** Stable client line identity; mandatory for a WEIGH measurement. */
  readonly saleItemId?: string | undefined;
  /**
   * Untrusted measurement facts only. Product type, price, base UOM, policy,
   * subtotal and physical stock quantity are resolved by the adapter.
   */
  readonly weightMeasurement?:
    | {
        readonly measurementId: string;
        readonly weightMicrounits: number;
        readonly measurementSource: 'DEVICE' | 'MANUAL';
        readonly scaleProtocol?: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB' | undefined;
        readonly scaleDeviceId?: string | undefined;
        readonly heartbeatSequence?: number | undefined;
        readonly observedAt: string;
        readonly stable?: boolean | undefined;
        readonly authorizationToken?: string | undefined;
      }
    | undefined;
  /** Compatibilidad offline pre-S31: unidades base. */
  readonly quantity?: number | undefined;
  /** S31/ADR-0015: identidad UOM; factor siempre server-side. */
  readonly uomId?: string | undefined;
  readonly enteredQuantityMicrounits?: number | undefined;
  /** Solo motor ACID después de resolver UOM; nunca del cliente HTTP. */
  readonly baseQuantityMicrounits?: number | undefined;
  readonly resolvedUomCode?: string | undefined;
  readonly resolvedFactorNumerator?: number | undefined;
  readonly resolvedFactorDenominator?: number | undefined;
  readonly discountAmountCents?: number | undefined;
  /** Sprint 30: IDs de promoción (servidor impone el precio; ADR-0014). */
  readonly promotionIds?: readonly string[] | undefined;
  /**
   * Solo motor ACID post-promo (nunca del cliente HTTP).
   * Precio unitario ya resuelto por lista + promoción.
   */
  readonly serverUnitPriceCents?: number | undefined;
  /** Sprint 39: physical identity plus opaque terminal lease, always as a pair. */
  readonly serialId?: string | undefined;
  readonly serialLeaseToken?: string | undefined;
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
  /**
   * Sprint 24: puntos a canjear (0/omit = no-op).
   * Offline-origin sin reserva online → rechazo; reserva EXPIRED → edge A.
   */
  readonly loyaltyPoints?: number | undefined;
  /** Sprint 35: canje de crédito de tienda. Monto lo impone el servidor. */
  readonly useStoreCredit?: boolean | undefined;
  /** Sprint 35: venta de vale/gift card (ISSUE en el mismo batch). */
  readonly storeCreditIssue?: boolean | undefined;
  /** Sprint 36: plan de cuotas sobre venta a crédito (schedule; 0 CPE propio). */
  readonly installmentPlan?:
    | {
        readonly downPaymentCents?: number;
        readonly items: readonly {
          readonly installmentNumber: number;
          readonly principalCents: number;
          readonly interestCents: number;
          readonly dueDateIso: string;
        }[];
      }
    | undefined;
  /** Sprint 37: atribución de vendedor (carrito) → sale_items.seller_id. */
  readonly sellerId?: string | undefined;
}

const ISSUED_AT_SKEW_MS = 6 * 3600 * 1000;

function requireNonEmpty(value: string | undefined, code: string): void {
  if (!value?.trim()) throw new Error(code);
}

function assertPromotionIds(item: OfflineSaleItemPayload): void {
  if (item.promotionIds === undefined) return;
  if (!Array.isArray(item.promotionIds)) throw new Error('INVALID_PROMOTION_IDS');
  for (const id of item.promotionIds) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('INVALID_PROMOTION_IDS');
  }
}

function hasValidOpaqueLease(serialId: string, leaseToken: string): boolean {
  return leaseToken !== serialId && leaseToken.startsWith('opaque_') && leaseToken.length >= 12;
}

function hasOneUnitCardinality(item: OfflineSaleItemPayload): boolean {
  const validBase =
    item.baseQuantityMicrounits === undefined || item.baseQuantityMicrounits === 1_000_000;
  const validEntered =
    item.enteredQuantityMicrounits === undefined || item.enteredQuantityMicrounits === 1_000_000;
  return item.quantity === 1 && validBase && validEntered;
}

function assertSerialIdentity(item: OfflineSaleItemPayload): void {
  const serialId = item.serialId?.trim() ?? '';
  const leaseToken = item.serialLeaseToken?.trim() ?? '';
  if (serialId && !leaseToken) throw new Error('MISSING_SERIAL_LEASE_TOKEN');
  if (!serialId && leaseToken) throw new Error('MISSING_SERIAL_ID');
  if (!serialId) return;
  if (!hasValidOpaqueLease(serialId, leaseToken)) {
    throw new Error('INVALID_SERIAL_LEASE_TOKEN');
  }
  if (!hasOneUnitCardinality(item)) {
    throw new Error('INVALID_SERIAL_CARDINALITY');
  }
}

function isPreResolvedItem(item: OfflineSaleItemPayload): boolean {
  return (
    item.baseQuantityMicrounits !== undefined &&
    item.resolvedFactorNumerator !== undefined &&
    item.resolvedFactorDenominator !== undefined
  );
}

function isPositiveSafeInt(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPositiveFinite(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function assertPreResolvedQuantity(item: OfflineSaleItemPayload): void {
  if (
    !isPositiveSafeInt(item.baseQuantityMicrounits) ||
    !isPositiveFinite(item.resolvedFactorNumerator) ||
    !isPositiveFinite(item.resolvedFactorDenominator) ||
    !isPositiveFinite(item.quantity)
  ) {
    throw new Error('INVALID_RESOLVED_QUANTITY');
  }
}

// eslint-disable-next-line complexity -- legacy/UOM/serial/WEIGH union validator
function assertItemQuantity(item: OfflineSaleItemPayload): void {
  if (item.weightMeasurement) {
    const measurement = item.weightMeasurement;
    requireNonEmpty(item.saleItemId, 'WEIGHT_SALE_ITEM_ID_REQUIRED');
    requireNonEmpty(measurement.measurementId, 'WEIGHT_MEASUREMENT_ID_REQUIRED');
    requireNonEmpty(measurement.observedAt, 'WEIGHT_OBSERVED_AT_REQUIRED');
    if (!isPositiveSafeInt(measurement.weightMicrounits)) {
      throw new Error('SCALE_WEIGHT_INVALID');
    }
    if (measurement.measurementSource !== 'DEVICE' && measurement.measurementSource !== 'MANUAL') {
      // eslint-disable-next-line no-secrets/no-secrets -- domain error code
      throw new Error('WEIGHT_SOURCE_INVALID');
    }
    return;
  }
  const hasUomIdentity = item.enteredQuantityMicrounits !== undefined || item.uomId !== undefined;
  if (hasUomIdentity) {
    if (
      !item.uomId?.trim() ||
      !Number.isSafeInteger(item.enteredQuantityMicrounits) ||
      (item.enteredQuantityMicrounits ?? 0) <= 0
    ) {
      throw new Error('INVALID_UOM_QUANTITY');
    }
    return;
  }
  if (isPreResolvedItem(item)) {
    assertPreResolvedQuantity(item);
    return;
  }
  if (!Number.isSafeInteger(item.quantity) || item.quantity === undefined || item.quantity <= 0) {
    throw new Error('INVALID_QUANTITY');
  }
}

function assertItems(items: readonly OfflineSaleItemPayload[]): void {
  if (!items?.length) throw new Error('EMPTY_ITEMS');
  for (const item of items) {
    requireNonEmpty(item.productId, 'MISSING_PRODUCT_ID');
    assertItemQuantity(item);
    if (
      item.discountAmountCents !== undefined &&
      (!Number.isInteger(item.discountAmountCents) || item.discountAmountCents < 0)
    ) {
      throw new Error('INVALID_DISCOUNT_CENTS');
    }
    assertPromotionIds(item);
    assertSerialIdentity(item);
  }
}

function requireResolvedQuantity(item: OfflineSaleItemPayload): number {
  const quantity = item.quantity;
  if (!Number.isFinite(quantity) || quantity === undefined || quantity <= 0) {
    throw new Error('INVALID_QUANTITY');
  }
  return quantity;
}

function saleItemAggregationKey(item: OfflineSaleItemPayload): string {
  return [
    item.productId,
    item.uomId ?? 'BASE',
    item.serialId ?? '',
    item.weightMeasurement ? (item.saleItemId ?? item.weightMeasurement.measurementId) : '',
  ].join('\u0000');
}

/**
 * Agrupa ítems por (productId, uomId) igual que el motor ACID (S31 UOM / convert snapshot).
 * Fuerza de verdad compartida entre normalizeUomItems y los converts quote/apartado.
 */
// eslint-disable-next-line complexity -- identity-aware merge across legacy/UOM/serial/WEIGH
export function aggregateSaleItems(
  items: readonly OfflineSaleItemPayload[],
): OfflineSaleItemPayload[] {
  const aggregated = new Map<string, OfflineSaleItemPayload>();
  for (const item of items) {
    const key = saleItemAggregationKey(item);
    const previous = aggregated.get(key);
    if (!previous) {
      aggregated.set(key, item);
      continue;
    }
    if (item.weightMeasurement || previous.weightMeasurement) {
      throw new Error('WEIGHT_LINE_IDENTITY_DUPLICATE');
    }
    aggregated.set(key, {
      ...previous,
      quantity: requireResolvedQuantity(previous) + requireResolvedQuantity(item),
      enteredQuantityMicrounits:
        (previous.enteredQuantityMicrounits ?? 0) + (item.enteredQuantityMicrounits ?? 0),
      baseQuantityMicrounits:
        (previous.baseQuantityMicrounits ?? 0) + (item.baseQuantityMicrounits ?? 0),
      discountAmountCents: (previous.discountAmountCents ?? 0) + (item.discountAmountCents ?? 0),
      promotionIds: [...new Set([...(previous.promotionIds ?? []), ...(item.promotionIds ?? [])])],
    });
  }
  return [...aggregated.values()];
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

/**
 * SYN-04/SEC-06: ventana ±6h; fuera → error (nunca re-fechar).
 * B6 (47b): un `issuedAt` naive (sin Z ni offset, el formato típico del POS
 * offline) se interpreta como hora local LIMA (UTC-5), no como UTC — antes se
 * desplazaba 5 h y podía caer en el día fiscal equivocado o violar el skew.
 * El instante de emisión offline se conserva (el rollup del día cerrado debe
 * re-materializarse con la fecha real de la venta, edge D).
 */
export function resolveIssuedAtMs(issuedAt: string | undefined, nowMs: number): number {
  if (issuedAt === undefined) return nowMs;
  const clientTime = parseIssuedAtLimaMs(issuedAt);
  if (!Number.isFinite(clientTime)) throw new Error('INVALID_ISSUED_AT');
  if (nowMs - clientTime > ISSUED_AT_SKEW_MS || clientTime > nowMs + ISSUED_AT_SKEW_MS) {
    throw new Error('ISSUED_AT_SKEW_VIOLATION');
  }
  return clientTime;
}

/** Naive (sin zona) = hora local Lima (UTC-5): 14:00 sin Z ⇒ 14:00 Lima ⇒ 19:00 UTC. */
function parseIssuedAtLimaMs(issuedAt: string): number {
  // Con zona si termina en Z o si el tramo tras la T lleva +/offset.
  const tIndex = issuedAt.indexOf('T');
  const tail = tIndex >= 0 ? issuedAt.slice(tIndex) : '';
  const hasZone = issuedAt.endsWith('Z') || tail.includes('+') || tail.includes('-');
  if (hasZone) return Date.parse(issuedAt);
  // Componente por componente: Date.parse sin zona usa la TZ del host (CI corre
  // en UTC), lo que desplazaría la hora 5 h según la máquina.
  const datePart = issuedAt.slice(0, 10);
  const timePart = issuedAt.slice(11);
  const dateParts = datePart.split('-').map((v) => Number(v));
  const timeParts = timePart.split(':').map((v) => Number(v));
  if (dateParts.length < 3 || timeParts.length < 2) return Date.parse(issuedAt);
  const y = dateParts[0]!;
  const mo = dateParts[1]!;
  const d = dateParts[2]!;
  const h = timeParts[0]!;
  const mi = timeParts[1]!;
  const s = timeParts[2];
  if (![y, mo, d, h, mi].every((v) => Number.isFinite(v))) return Date.parse(issuedAt);
  const utc = Date.UTC(y, mo - 1, d, h, mi, Number.isFinite(s) ? s : 0);
  return Number.isFinite(utc) ? utc + 5 * 3600 * 1000 : Number.NaN;
}

export function toLimaTimestamp(validatedTimeMs: number): string {
  return new Date(validatedTimeMs - 5 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
}

export interface NvLineCents {
  /** Stable source identity; prevents same-product weighted lines from collapsing. */
  readonly sourceLineId?: string;
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
    const quantity = requireResolvedQuantity(item);
    const unitPriceCents =
      item.serverUnitPriceCents !== undefined ? item.serverUnitPriceCents : product.priceCents;
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new Error('INVALID_UNIT_PRICE');
    }
    if (!Number.isInteger(product.costCents) || product.costCents < 0) {
      throw new Error('INVALID_UNIT_COST');
    }
    const discountCents = item.discountAmountCents ?? 0;
    const subtotalCents = Math.round(quantity * unitPriceCents) - discountCents;
    if (subtotalCents < 0) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
    const igvCents = Math.round((subtotalCents * 18) / 100);
    const totalCents = subtotalCents + igvCents;
    const unitCostCents = product.costCents;
    lines.push({
      ...(item.saleItemId ? { sourceLineId: item.saleItemId } : {}),
      productId: item.productId,
      quantity,
      unitPriceCents,
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
    totalCogsCents += Math.round(unitCostCents * quantity);
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
// eslint-disable-next-line complexity -- exact residual-cent allocation across FEFO splits
export function splitNvLinesByFefo(
  lines: readonly NvLineCents[],
  allocationsByProduct: ReadonlyMap<string, readonly { batchId: string; qty: number }[]>,
): NvLineCents[] {
  const out: NvLineCents[] = [];
  for (const line of lines) {
    const allocs =
      allocationsByProduct.get(line.sourceLineId ?? '') ?? allocationsByProduct.get(line.productId);
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
      const igvCents = isLast ? igvLeft : applyIgvCents(subtotalCents, IGV_RATE_PER_MILLE);
      const totalCents = isLast ? totalLeft : subtotalCents + igvCents;
      if (!isLast) {
        discountLeft -= discountCents;
        taxableLeft -= subtotalCents;
        igvLeft -= igvCents;
        totalLeft -= totalCents;
      }
      out.push({
        ...(line.sourceLineId ? { sourceLineId: line.sourceLineId } : {}),
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
