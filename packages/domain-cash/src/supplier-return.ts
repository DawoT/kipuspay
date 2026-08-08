/**
 * Devolución a proveedor — Arquitectura §5.3 regla 19 / ADR-0018.
 * Puro, sin D1. INTEGER cents + microunits. 0 CPE / 0 cupo.
 */

const QUANTITY_SCALE = 1_000_000;

export const SUPPLIER_RETURN_ITEMS_REQUIRED = 'SUPPLIER_RETURN_ITEMS_REQUIRED';
export const SUPPLIER_RETURN_INVALID_AMOUNT = 'SUPPLIER_RETURN_INVALID_AMOUNT';
export const SUPPLIER_RETURN_INVALID_STATUS = 'SUPPLIER_RETURN_INVALID_STATUS';
export const SUPPLIER_RETURN_ALREADY_CLOSED = 'SUPPLIER_RETURN_ALREADY_CLOSED';
export const SUPPLIER_RETURN_ALREADY_TERMINAL = 'SUPPLIER_RETURN_ALREADY_TERMINAL';
export const SUPPLIER_RETURN_QTY_EXCEEDED = 'SUPPLIER_RETURN_QTY_EXCEEDED';
export const SUPPLIER_RETURN_COST_MISMATCH = 'SUPPLIER_RETURN_COST_MISMATCH';
export const AP_ALREADY_PAID = 'AP_ALREADY_PAID';
export const AP_INSUFFICIENT = 'AP_INSUFFICIENT';
export const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK';

export type SupplierReturnStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type SupplierReturnApStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export interface SupplierReturnItemInput {
  readonly productId: string;
  readonly baseQuantityMicrounits: number;
  readonly unitCostCents: number;
  readonly snapshotUnitCostCents: number;
  readonly receivedMicrounits: number;
  readonly invoicedMicrounits: number | null;
  readonly alreadyReturnedMicrounits: number;
}

export interface SupplierReturnCreatePlan {
  readonly status: 'OPEN';
  readonly snapshotTotalCents: number;
  readonly emitsFiscalDocument: false;
  readonly movesStock: false;
  readonly items: readonly SupplierReturnItemInput[];
}

export interface SupplierReturnClosePlan {
  readonly status: 'CLOSED';
  readonly snapshotTotalCents: number;
  readonly emitsFiscalDocument: false;
  readonly movesStock: true;
  readonly requiresPriceDiffAudit: boolean;
  readonly apDeltaCents: number;
  readonly nextApBalanceCents: number | null;
  readonly nextApStatus: SupplierReturnApStatus | null;
}

export function planSupplierReturnCreate(input: {
  readonly items: readonly SupplierReturnItemInput[];
  readonly reason: string;
}): SupplierReturnCreatePlan {
  if (input.items.length === 0) throw new Error(SUPPLIER_RETURN_ITEMS_REQUIRED);
  if (!input.reason.trim()) throw new Error(SUPPLIER_RETURN_ITEMS_REQUIRED);
  let snapshotTotalCents = 0;
  for (const item of input.items) {
    if (!item.productId.trim()) throw new Error(SUPPLIER_RETURN_ITEMS_REQUIRED);
    snapshotTotalCents += lineCents(item);
    assertQtyWithinReceived(item);
  }
  return {
    status: 'OPEN',
    snapshotTotalCents,
    emitsFiscalDocument: false,
    movesStock: false,
    items: input.items,
  };
}

function planApOnClose(
  ap:
    | { readonly status: SupplierReturnApStatus; readonly balanceDueCents: number }
    | null
    | undefined,
  snapshotTotalCents: number,
): {
  apDeltaCents: number;
  nextApBalanceCents: number | null;
  nextApStatus: SupplierReturnApStatus | null;
} {
  if (!ap) return { apDeltaCents: 0, nextApBalanceCents: null, nextApStatus: null };
  if (ap.status === 'PAID') throw new Error(AP_ALREADY_PAID);
  if (!Number.isInteger(ap.balanceDueCents) || ap.balanceDueCents < 0) {
    throw new Error(AP_INSUFFICIENT);
  }
  if (ap.balanceDueCents < snapshotTotalCents) throw new Error(AP_INSUFFICIENT);
  const nextApBalanceCents = ap.balanceDueCents - snapshotTotalCents;
  return {
    apDeltaCents: snapshotTotalCents,
    nextApBalanceCents,
    nextApStatus: nextApBalanceCents === 0 ? 'PAID' : 'PARTIALLY_PAID',
  };
}

export function assertSupplierReturnClosable(input: {
  readonly status: SupplierReturnStatus;
  readonly items: readonly SupplierReturnItemInput[];
  readonly priceDiffOverride: boolean;
  readonly authorizedByUserId?: string | null;
  readonly ap?: {
    readonly status: SupplierReturnApStatus;
    readonly balanceDueCents: number;
  } | null;
}): SupplierReturnClosePlan {
  if (input.status === 'CLOSED') throw new Error(SUPPLIER_RETURN_ALREADY_CLOSED);
  if (input.status !== 'OPEN') throw new Error(SUPPLIER_RETURN_INVALID_STATUS);
  if (input.items.length === 0) throw new Error(SUPPLIER_RETURN_ITEMS_REQUIRED);

  let snapshotTotalCents = 0;
  let requiresPriceDiffAudit = false;
  for (const item of input.items) {
    snapshotTotalCents += lineCents(item);
    assertQtyWithinReceived(item);
    if (item.unitCostCents !== item.snapshotUnitCostCents) {
      if (!input.priceDiffOverride || !input.authorizedByUserId) {
        throw new Error(SUPPLIER_RETURN_COST_MISMATCH);
      }
      requiresPriceDiffAudit = true;
    }
  }

  const apPlan = planApOnClose(input.ap, snapshotTotalCents);

  return {
    status: 'CLOSED',
    snapshotTotalCents,
    emitsFiscalDocument: false,
    movesStock: true,
    requiresPriceDiffAudit,
    apDeltaCents: apPlan.apDeltaCents,
    nextApBalanceCents: apPlan.nextApBalanceCents,
    nextApStatus: apPlan.nextApStatus,
  };
}

export function assertSupplierReturnCancelAllowed(input: {
  readonly status: SupplierReturnStatus;
}): void {
  if (input.status !== 'OPEN') throw new Error(SUPPLIER_RETURN_ALREADY_TERMINAL);
}

export function assertSupplierReturnStockEnough(input: {
  readonly stockMicrounits: number;
  readonly outboundMicrounits: number;
}): void {
  if (
    !Number.isInteger(input.stockMicrounits) ||
    !Number.isInteger(input.outboundMicrounits) ||
    input.outboundMicrounits <= 0
  ) {
    throw new Error(SUPPLIER_RETURN_INVALID_AMOUNT);
  }
  if (input.stockMicrounits < input.outboundMicrounits) throw new Error(INSUFFICIENT_STOCK);
}

function assertQtyWithinReceived(item: SupplierReturnItemInput): void {
  if (!Number.isInteger(item.baseQuantityMicrounits) || item.baseQuantityMicrounits <= 0) {
    throw new Error(SUPPLIER_RETURN_INVALID_AMOUNT);
  }
  const remaining = item.receivedMicrounits - item.alreadyReturnedMicrounits;
  if (item.baseQuantityMicrounits > remaining) throw new Error(SUPPLIER_RETURN_QTY_EXCEEDED);
  if (
    item.invoicedMicrounits !== null &&
    item.baseQuantityMicrounits > item.invoicedMicrounits - item.alreadyReturnedMicrounits
  ) {
    throw new Error(SUPPLIER_RETURN_QTY_EXCEEDED);
  }
}

function lineCents(item: SupplierReturnItemInput): number {
  if (!Number.isInteger(item.unitCostCents) || item.unitCostCents < 0) {
    throw new Error(SUPPLIER_RETURN_INVALID_AMOUNT);
  }
  return Math.floor(
    (item.baseQuantityMicrounits * item.unitCostCents + QUANTITY_SCALE / 2) / QUANTITY_SCALE,
  );
}
