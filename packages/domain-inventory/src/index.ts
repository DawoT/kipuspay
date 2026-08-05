/**
 * Inventario FASE 6 / Sprint 18 — FEFO, BOM, PMP, listas (Arquitectura §5.3).
 * Puro; sin D1.
 */

export type StockQuantity = number;
export type Cents = number;

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
  if (line.qtyShrink > 0) {
    // caller must supply reason + audit TRANSFER_VARIANCE
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
