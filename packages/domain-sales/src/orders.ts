/**
 * Comandas / KDS / split bill — FASE 6 Sprint 19 (Arquitectura §5.3).
 * Puro; vive en domain-sales (ciclo de venta).
 */

export type OrderStatus = 'OPEN' | 'FIRED' | 'READY' | 'PAID' | 'CANCELLED';
export type OrderItemStatus = 'PENDING' | 'FIRED' | 'READY' | 'CANCELLED' | 'BILLED';

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  OPEN: ['FIRED', 'CANCELLED'],
  FIRED: ['READY', 'CANCELLED'],
  READY: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

const ITEM_TRANSITIONS: Readonly<Record<OrderItemStatus, readonly OrderItemStatus[]>> = {
  PENDING: ['FIRED', 'CANCELLED'],
  FIRED: ['READY', 'CANCELLED'],
  READY: ['BILLED', 'CANCELLED'],
  BILLED: [],
  CANCELLED: [],
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw new Error(`ORDER_INVALID:${from}->${to}`);
  }
}

export function assertOrderItemTransition(from: OrderItemStatus, to: OrderItemStatus): void {
  if (!ITEM_TRANSITIONS[from].includes(to)) {
    throw new Error(`ORDER_ITEM_INVALID:${from}->${to}`);
  }
}

/** Cancelar ítem READY exige authz (reusa S17). */
export function assertItemCancelAuthorized(
  status: OrderItemStatus,
  authorizedCancelBy: string | null,
): void {
  if (status === 'CANCELLED') throw new Error('ORDER_ITEM_ALREADY_CANCELLED');
  if (status === 'BILLED') throw new Error('ORDER_ITEM_ALREADY_BILLED');
  if (status === 'READY' && !(authorizedCancelBy && authorizedCancelBy.trim())) {
    throw new Error('AUTH_TOKEN_REQUIRED');
  }
}

export interface SplitPortion {
  readonly saleId: string;
  readonly itemIds: readonly string[];
  readonly amountCents: number;
}

/**
 * Split bill: N sales sin solapar ítems; montos enteros cents.
 * Stock se descuenta una sola vez al FIRED/cobro (adapter); aquí solo partición.
 */
export function planSplitBill(input: {
  readonly orderId: string;
  readonly orderStatus: OrderStatus;
  readonly itemIds: readonly string[];
  readonly portions: readonly { readonly saleId: string; readonly itemIds: readonly string[] }[];
  readonly amountCentsByItem: ReadonlyMap<string, number>;
}): SplitPortion[] {
  if (input.orderStatus !== 'READY' && input.orderStatus !== 'FIRED') {
    throw new Error('ORDER_NOT_BILLABLE');
  }
  if (input.portions.length < 1) throw new Error('SPLIT_REQUIRES_PORTIONS');
  const claimed = new Set<string>();
  const result: SplitPortion[] = [];
  for (const portion of input.portions) {
    result.push({
      saleId: portion.saleId,
      itemIds: portion.itemIds,
      amountCents: portionAmountCents(portion, input.itemIds, claimed, input.amountCentsByItem),
    });
  }
  assertAllItemsClaimed(input.itemIds, claimed);
  return result;
}

function portionAmountCents(
  portion: { readonly saleId: string; readonly itemIds: readonly string[] },
  allItemIds: readonly string[],
  claimed: Set<string>,
  amountCentsByItem: ReadonlyMap<string, number>,
): number {
  if (!portion.saleId.trim()) throw new Error('SPLIT_REQUIRES_SALE_ID');
  if (portion.itemIds.length === 0) throw new Error('SPLIT_EMPTY_PORTION');
  let amountCents = 0;
  for (const id of portion.itemIds) {
    if (claimed.has(id)) throw new Error('SPLIT_ITEM_OVERLAP');
    if (!allItemIds.includes(id)) throw new Error('SPLIT_UNKNOWN_ITEM');
    claimed.add(id);
    const amt = amountCentsByItem.get(id);
    if (amt === undefined || !Number.isInteger(amt) || amt < 0) {
      throw new Error('INVALID_ITEM_AMOUNT');
    }
    amountCents += amt;
  }
  return amountCents;
}

function assertAllItemsClaimed(allItemIds: readonly string[], claimed: ReadonlySet<string>): void {
  for (const id of allItemIds) {
    if (!claimed.has(id)) throw new Error('SPLIT_INCOMPLETE');
  }
}

/** Latencia KDS objetivo: FIRED visible <1s en LAN (contrato; medido en E2E). */
export const KDS_FIRE_SLA_MS = 1000;
