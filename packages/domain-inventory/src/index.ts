/**
 * Inventario FASE 6 / Sprint 18 — FEFO, BOM, PMP, listas (Arquitectura §5.3).
 * Puro; sin D1.
 */

export type StockQuantity = number;
export type Cents = number;

export {
  assertVariantTopology,
  convertEnteredToBaseMicrounits,
  normalizeUomCode,
  QTY_OVERFLOW,
  QUANTITY_SCALE,
  resolveVariantUnitPriceCents,
  UOM_CODE_INVALID,
  UOM_FACTOR_INVALID,
  VARIANT_NESTING_FORBIDDEN,
  VARIANT_SELF_PARENT,
} from './variants-uom.js';

export interface StockBatch {
  readonly batchId: string;
  readonly productId: string;
  readonly qty: StockQuantity;
  readonly expiresAtUtc: string;
}

export function sumQty(batches: readonly StockBatch[]): StockQuantity {
  let total = 0;
  for (const batch of batches) {
    total += batch.qty;
  }
  return total;
}

export function firstExpiringAtUtc(batches: readonly StockBatch[]): string | null {
  let earliest: string | null = null;
  for (const batch of batches) {
    if (earliest === null || batch.expiresAtUtc < earliest) {
      earliest = batch.expiresAtUtc;
    }
  }
  return earliest;
}

abstract class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ExpiredBatchError extends InventoryError {
  readonly batchId: string;
  constructor(batchId: string) {
    super(`EXPIRED_BATCH:${batchId}`);
    this.batchId = batchId;
  }
}

export class InsufficientBatchStockError extends InventoryError {
  readonly productId: string;
  readonly requested: number;
  readonly available: number;
  constructor(productId: string, requested: number, available: number) {
    super(`INSUFFICIENT_BATCH_STOCK:${productId}`);
    this.productId = productId;
    this.requested = requested;
    this.available = available;
  }
}

export interface FefoAllocation {
  readonly batchId: string;
  readonly qty: number;
}

/**
 * Asigna qty por vencimiento ASC; bloquea lotes ya vencidos (expiresAtUtc < nowIso).
 */
export function allocateFefo(
  batches: readonly StockBatch[],
  productId: string,
  qtyNeeded: number,
  nowIsoUtc: string,
): FefoAllocation[] {
  if (!(qtyNeeded > 0)) throw new Error('INVALID_QTY');
  const sorted = [...batches]
    .filter((b) => b.productId === productId && b.qty > 0)
    .sort((a, b) => a.expiresAtUtc.localeCompare(b.expiresAtUtc));
  let remaining = qtyNeeded;
  const out: FefoAllocation[] = [];
  for (const batch of sorted) {
    if (batch.expiresAtUtc < nowIsoUtc) {
      throw new ExpiredBatchError(batch.batchId);
    }
    const take = Math.min(batch.qty, remaining);
    out.push({ batchId: batch.batchId, qty: take });
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    throw new InsufficientBatchStockError(productId, qtyNeeded, qtyNeeded - remaining);
  }
  return out;
}

export interface BomComponent {
  readonly componentProductId: string;
  readonly qtyPerKit: number;
}

export interface BomExplosionLine {
  readonly componentProductId: string;
  readonly qty: number;
}

/** Explota kit → componentes; falla si qtyPerKit inválido. */
export function explodeBom(
  components: readonly BomComponent[],
  kitQty: number,
): BomExplosionLine[] {
  if (!(kitQty > 0)) throw new Error('INVALID_KIT_QTY');
  if (components.length === 0) throw new Error('BOM_EMPTY');
  return components.map((c) => {
    if (!(c.qtyPerKit > 0)) throw new Error('INVALID_BOM_COMPONENT');
    return {
      componentProductId: c.componentProductId,
      qty: kitQty * c.qtyPerKit,
    };
  });
}

/**
 * PMP: nuevo_costo = (stock_prev * pmp_prev + qty_in * unit_cost) / (stock_prev + qty_in)
 * Resultado INTEGER cents (redondeo half-up vía Math.round).
 */
export function refreshAvgCostCents(input: {
  readonly previousStock: number;
  readonly previousPmpCents: Cents;
  readonly inboundQty: number;
  readonly inboundUnitCostCents: Cents;
}): Cents {
  if (!Number.isInteger(input.previousPmpCents) || input.previousPmpCents < 0) {
    throw new Error('INVALID_PMP');
  }
  if (!Number.isInteger(input.inboundUnitCostCents) || input.inboundUnitCostCents < 0) {
    throw new Error('INVALID_UNIT_COST');
  }
  if (input.inboundQty <= 0) throw new Error('INVALID_INBOUND_QTY');
  const prevStock = Math.max(0, input.previousStock);
  const newStock = prevStock + input.inboundQty;
  if (newStock <= 0) return input.inboundUnitCostCents;
  const total = prevStock * input.previousPmpCents + input.inboundQty * input.inboundUnitCostCents;
  return Math.round(total / newStock);
}

/**
 * PMP outbound (ADR-0018 / regla 9): reverso de recepción.
 * remaining <= 0 → PMP 0; stock insuficiente → INSUFFICIENT_STOCK.
 */
export function refreshAvgCostOnOutboundCents(input: {
  readonly previousStock: number;
  readonly previousPmpCents: Cents;
  readonly outboundQty: number;
  readonly outboundUnitCostCents: Cents;
}): Cents {
  if (!Number.isInteger(input.previousPmpCents) || input.previousPmpCents < 0) {
    throw new Error('INVALID_PMP');
  }
  if (!Number.isInteger(input.outboundUnitCostCents) || input.outboundUnitCostCents < 0) {
    throw new Error('INVALID_UNIT_COST');
  }
  if (input.outboundQty <= 0) throw new Error('INVALID_OUTBOUND_QTY');
  const prevStock = Math.max(0, input.previousStock);
  const remaining = prevStock - input.outboundQty;
  if (remaining < 0) throw new Error('INSUFFICIENT_STOCK');
  if (remaining === 0) return 0;
  const newValue =
    prevStock * input.previousPmpCents - input.outboundQty * input.outboundUnitCostCents;
  return Math.round(newValue / remaining);
}

export type PriceListSource = 'branch' | 'customer' | 'default';

export interface PriceListResolution {
  readonly unitPriceCents: Cents;
  readonly source: PriceListSource;
}

/**
 * Zero-Trust: sucursal → cliente → default. Cliente nunca impone precio.
 */
export function resolveUnitPriceCents(input: {
  readonly branchPriceCents: Cents | null;
  readonly customerPriceCents: Cents | null;
  readonly defaultPriceCents: Cents;
}): PriceListResolution {
  if (!Number.isInteger(input.defaultPriceCents) || input.defaultPriceCents < 0) {
    throw new Error('INVALID_DEFAULT_PRICE');
  }
  if (input.branchPriceCents !== null) {
    if (!Number.isInteger(input.branchPriceCents) || input.branchPriceCents < 0) {
      throw new Error('INVALID_BRANCH_PRICE');
    }
    return { unitPriceCents: input.branchPriceCents, source: 'branch' };
  }
  if (input.customerPriceCents !== null) {
    if (!Number.isInteger(input.customerPriceCents) || input.customerPriceCents < 0) {
      throw new Error('INVALID_CUSTOMER_PRICE');
    }
    return { unitPriceCents: input.customerPriceCents, source: 'customer' };
  }
  return { unitPriceCents: input.defaultPriceCents, source: 'default' };
}

export interface StockPolicyAlert {
  readonly kind: 'STOCKOUT' | 'REORDER' | 'EXPIRING';
  readonly productId: string;
  readonly detail: string;
}

export function evaluateStockAlerts(input: {
  readonly productId: string;
  readonly stock: number;
  readonly minStock: number;
  readonly reorderPoint: number;
  readonly earliestExpiryUtc: string | null;
  readonly nowIsoUtc: string;
  readonly expiryWarnDays: number;
}): StockPolicyAlert[] {
  const alerts: StockPolicyAlert[] = [];
  if (input.stock <= 0) {
    alerts.push({ kind: 'STOCKOUT', productId: input.productId, detail: 'stock<=0' });
  } else if (input.stock <= input.reorderPoint) {
    alerts.push({
      kind: 'REORDER',
      productId: input.productId,
      detail: `stock=${input.stock}<=reorder=${input.reorderPoint}`,
    });
  } else if (input.stock <= input.minStock) {
    alerts.push({
      kind: 'REORDER',
      productId: input.productId,
      detail: `stock=${input.stock}<=min=${input.minStock}`,
    });
  }
  if (input.earliestExpiryUtc) {
    const exp = Date.parse(input.earliestExpiryUtc);
    const now = Date.parse(input.nowIsoUtc);
    const days = (exp - now) / (86400 * 1000);
    if (Number.isFinite(days) && days <= input.expiryWarnDays) {
      alerts.push({
        kind: 'EXPIRING',
        productId: input.productId,
        detail: `days=${Math.round(days * 10) / 10}`,
      });
    }
  }
  return alerts;
}

export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface TransferLineBalance {
  readonly qtySent: number;
  readonly qtyReceived: number;
  readonly qtyShrink: number;
}

/** Conservación: received + shrink = sent. */
export function assertTransferLineConservation(line: TransferLineBalance): void {
  const sum = line.qtyReceived + line.qtyShrink;
  if (Math.abs(sum - line.qtySent) > 1e-9) {
    throw new Error('TRANSFER_QTY_MISMATCH');
  }
}

/** Merma en tránsito exige justificación (audit TRANSFER_VARIANCE en adapter). */
export function assertShrinkJustified(qtyShrink: number, shrinkReason: string | null): void {
  if (!(qtyShrink > 0)) return;
  if (!(shrinkReason && shrinkReason.trim())) {
    throw new Error('SHRINK_REASON_REQUIRED');
  }
}

const TRANSFER_TRANSITIONS: Readonly<Record<TransferStatus, readonly TransferStatus[]>> = {
  DRAFT: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function assertTransferTransition(from: TransferStatus, to: TransferStatus): void {
  if (!TRANSFER_TRANSITIONS[from].includes(to)) {
    throw new Error(`TRANSFER_INVALID:${from}->${to}`);
  }
}

export interface TransferStockLine {
  readonly productId: string;
  readonly quantity: number;
}

export interface TransferStockDelta {
  readonly branchId: string;
  readonly productId: string;
  readonly qtyDelta: number;
  readonly movementType: 'TRANSFER_OUT' | 'TRANSFER_IN' | 'TRANSFER_SHRINK' | 'TRANSFER_CANCEL';
}

/** Ship DRAFT→IN_TRANSIT: debit stock en origen. */
export function planShipStockDeltas(input: {
  readonly originBranchId: string;
  readonly lines: readonly TransferStockLine[];
}): TransferStockDelta[] {
  return aggregateTransferDeltas(input.originBranchId, input.lines, -1, 'TRANSFER_OUT');
}

/** Receive: credit destino por received; shrink no entra a destino. */
export function planReceiveStockDeltas(input: {
  readonly destinationBranchId: string;
  readonly lines: readonly {
    readonly productId: string;
    readonly qtyReceived: number;
    readonly qtyShrink: number;
    readonly shrinkReason: string | null;
  }[];
}): TransferStockDelta[] {
  const deltas: TransferStockDelta[] = [];
  for (const line of input.lines) {
    assertShrinkJustified(line.qtyShrink, line.shrinkReason);
    if (line.qtyReceived > 0) {
      deltas.push({
        branchId: input.destinationBranchId,
        productId: line.productId,
        qtyDelta: line.qtyReceived,
        movementType: 'TRANSFER_IN',
      });
    }
    if (line.qtyShrink > 0) {
      deltas.push({
        branchId: input.destinationBranchId,
        productId: line.productId,
        qtyDelta: 0,
        movementType: 'TRANSFER_SHRINK',
      });
    }
  }
  return mergeTransferDeltas(deltas);
}

/** Cancel IN_TRANSIT: devolver qty_sent al origen. */
export function planCancelInTransit(input: {
  readonly originBranchId: string;
  readonly status: TransferStatus;
  readonly lines: readonly TransferStockLine[];
}): TransferStockDelta[] {
  assertTransferTransition(input.status, 'CANCELLED');
  if (input.status !== 'IN_TRANSIT') {
    // DRAFT cancel = no stock restore
    return [];
  }
  return aggregateTransferDeltas(input.originBranchId, input.lines, 1, 'TRANSFER_CANCEL');
}

function aggregateTransferDeltas(
  branchId: string,
  lines: readonly TransferStockLine[],
  sign: 1 | -1,
  movementType: TransferStockDelta['movementType'],
): TransferStockDelta[] {
  const byProduct = new Map<string, number>();
  for (const line of lines) {
    if (!(line.quantity > 0) || !Number.isFinite(line.quantity)) {
      throw new Error('INVALID_TRANSFER_QTY');
    }
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.quantity);
  }
  return [...byProduct.entries()].map(([productId, qty]) => ({
    branchId,
    productId,
    qtyDelta: sign * qty,
    movementType,
  }));
}

function mergeTransferDeltas(deltas: readonly TransferStockDelta[]): TransferStockDelta[] {
  const map = new Map<string, TransferStockDelta>();
  for (const d of deltas) {
    const key = `${d.branchId}|${d.productId}|${d.movementType}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, d);
      continue;
    }
    map.set(key, { ...prev, qtyDelta: prev.qtyDelta + d.qtyDelta });
  }
  return [...map.values()];
}

/** Conteo físico (Arquitectura §5.3) — hoja ciega → review → approve. */
export type InventoryCountStatus = 'COUNTING' | 'DIFFERENCE_REVIEW' | 'APPROVED' | 'CANCELLED';

const COUNT_TRANSITIONS: Readonly<Record<InventoryCountStatus, readonly InventoryCountStatus[]>> = {
  COUNTING: ['DIFFERENCE_REVIEW', 'CANCELLED'],
  DIFFERENCE_REVIEW: ['APPROVED', 'CANCELLED'],
  APPROVED: [],
  CANCELLED: [],
};

export function assertInventoryCountTransition(
  from: InventoryCountStatus,
  to: InventoryCountStatus,
): void {
  if (!COUNT_TRANSITIONS[from].includes(to)) {
    throw new Error(`COUNT_INVALID:${from}->${to}`);
  }
}

export interface CountLineDiff {
  readonly productId: string;
  readonly differenceQty: number;
  readonly unitCostCents: Cents;
}

export interface CountAuthzInput {
  readonly lines: readonly CountLineDiff[];
  readonly differenceThresholdCents: Cents;
  readonly authorizedByUserId: string | null;
}

/** Valoriza |diff| y exige authz si supera umbral. */
export function assertCountDiffAuthorized(input: CountAuthzInput): void {
  if (!Number.isInteger(input.differenceThresholdCents) || input.differenceThresholdCents < 0) {
    throw new Error('INVALID_COUNT_THRESHOLD');
  }
  let absValue = 0;
  for (const line of input.lines) {
    if (!Number.isInteger(line.unitCostCents) || line.unitCostCents < 0) {
      throw new Error('INVALID_UNIT_COST');
    }
    absValue += Math.abs(Math.round(line.differenceQty * line.unitCostCents));
  }
  if (absValue > input.differenceThresholdCents) {
    if (!(input.authorizedByUserId && input.authorizedByUserId.trim())) {
      throw new Error('AUTH_TOKEN_REQUIRED');
    }
  }
}

export function assertCountMutable(status: InventoryCountStatus): void {
  if (status === 'APPROVED') throw new Error('COUNT_LOCKED');
  if (status === 'CANCELLED') throw new Error('COUNT_CANCELLED');
}

export type StockLossStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type StockLossCategory = 'DAMAGED' | 'EXPIRED' | 'THEFT_SUSPECTED' | 'SHRINK' | 'OTHER';

export interface ApproveStockLossInput {
  readonly status: StockLossStatus;
  readonly quantity: number;
  readonly category: StockLossCategory;
  readonly evidenceR2Key: string | null;
  readonly reason: string;
  readonly approvedByUserId: string | null;
}

export interface StockLossApprovePlan {
  readonly nextStatus: 'APPROVED';
  readonly adjustmentQty: number;
  readonly movementType: 'AJUSTE';
}

/** APPROVED exige evidencia R2 + razón + aprobador; genera AJUSTE negativo. */
export function planApproveStockLoss(input: ApproveStockLossInput): StockLossApprovePlan {
  if (input.status !== 'PENDING') throw new Error('LOSS_NOT_PENDING');
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) {
    throw new Error('INVALID_LOSS_QTY');
  }
  if (!(input.evidenceR2Key && input.evidenceR2Key.trim())) {
    throw new Error('LOSS_EVIDENCE_REQUIRED');
  }
  if (!(input.reason && input.reason.trim())) throw new Error('LOSS_REASON_REQUIRED');
  if (!(input.approvedByUserId && input.approvedByUserId.trim())) {
    throw new Error('LOSS_APPROVER_REQUIRED');
  }
  return {
    nextStatus: 'APPROVED',
    adjustmentQty: -input.quantity,
    movementType: 'AJUSTE',
  };
}

export function assertStockLossReject(status: StockLossStatus): void {
  if (status !== 'PENDING') throw new Error('LOSS_NOT_PENDING');
}

/** Sugerencia de OC desde política de reposición. */
export function suggestReorderQty(input: {
  readonly stock: number;
  readonly reorderPoint: number;
  readonly reorderQty: number;
}): number {
  if (!(input.reorderQty > 0)) return 0;
  if (input.stock > input.reorderPoint) return 0;
  return input.reorderQty;
}
