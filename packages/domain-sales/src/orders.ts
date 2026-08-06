/**
 * Comandas / KDS / split bill — FASE 6 Sprint 19 (Arquitectura §5.3).
 * Puro; vive en domain-sales (ciclo de venta).
 */

export type OrderStatus = 'OPEN' | 'FIRED' | 'READY' | 'PAID' | 'CANCELLED';
export type OrderItemStatus = 'PENDING' | 'FIRED' | 'READY' | 'CANCELLED' | 'BILLED';

/** §5.3 regla 7 — default descontar al convertir order_item → sale. */
export type OrderStockPolicy = 'reserve_on_fired' | 'deduct_on_sale';

export const DEFAULT_ORDER_STOCK_POLICY: OrderStockPolicy = 'deduct_on_sale';

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  OPEN: ['FIRED', 'CANCELLED'],
  FIRED: ['READY', 'PAID', 'CANCELLED'],
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

/** Orden cobrable: FIRED o READY (CA: 0 cobros sin estado cobrable). */
export function assertOrderBillable(status: OrderStatus): void {
  if (status !== 'READY' && status !== 'FIRED') {
    throw new Error('ORDER_NOT_BILLABLE');
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
  assertOrderBillable(input.orderStatus);
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

/** KDS marca ítems FIRED → READY. */
export function planMarkItemsReady(
  items: readonly { readonly id: string; readonly status: OrderItemStatus }[],
): readonly { readonly id: string; readonly nextStatus: 'READY' }[] {
  return items.map((it) => {
    assertOrderItemTransition(it.status, 'READY');
    return { id: it.id, nextStatus: 'READY' as const };
  });
}

/**
 * Agrega orden FIRED→READY cuando todos los ítems no cancelados están READY.
 * Retorna el next status o null si aún no aplica.
 */
export function planOrderReadyAggregation(input: {
  readonly orderStatus: OrderStatus;
  readonly itemStatuses: readonly OrderItemStatus[];
}): OrderStatus | null {
  if (input.orderStatus !== 'FIRED') return null;
  const active = input.itemStatuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return null;
  if (!active.every((s) => s === 'READY' || s === 'BILLED')) return null;
  assertOrderTransition('FIRED', 'READY');
  return 'READY';
}

export function resolveOrderStockPolicy(raw: string | undefined | null): OrderStockPolicy {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_ORDER_STOCK_POLICY;
  if (raw === 'reserve_on_fired' || raw === 'deduct_on_sale') return raw;
  throw new Error('INVALID_STOCK_POLICY');
}

export interface OrderStockDelta {
  readonly productId: string;
  readonly qtyDelta: number;
}

/** Plan puro de deltas de stock según política y fase (fire | bill). */
export function planOrderStockDeltas(input: {
  readonly policy: OrderStockPolicy;
  readonly phase: 'fire' | 'bill';
  readonly lines: readonly { readonly productId: string; readonly quantity: number }[];
}): OrderStockDelta[] {
  const shouldDebit =
    (input.policy === 'deduct_on_sale' && input.phase === 'bill') ||
    (input.policy === 'reserve_on_fired' && input.phase === 'fire');
  if (!shouldDebit) return [];

  const byProduct = new Map<string, number>();
  for (const line of input.lines) {
    if (!(line.quantity > 0)) continue;
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.quantity);
  }
  return [...byProduct.entries()].map(([productId, qty]) => ({
    productId,
    qtyDelta: -qty,
  }));
}

/** Latencia KDS objetivo: FIRED visible <1s en LAN (contrato; medido en E2E). */
export const KDS_FIRE_SLA_MS = 1000;
