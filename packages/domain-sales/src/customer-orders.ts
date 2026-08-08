/* eslint-disable no-secrets/no-secrets -- domain error codes are not secrets */
export const CUSTOMER_ORDER_MAX_ITEMS = 100;
export const CUSTOMER_ORDER_MICROUNITS_PER_BASE_UNIT = 1_000_000;

export type CustomerOrderStatus = 'OPEN' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
export type CustomerOrderTerminalStatus = 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

export interface CustomerOrderQuantities {
  readonly requestedQuantityMicrounits: number;
  readonly fulfilledQuantityMicrounits: number;
  readonly releasedQuantityMicrounits: number;
  readonly reservedQuantityMicrounits: number;
}

export interface CustomerOrderItemInput {
  readonly productId: string;
  readonly productUomId: string;
  readonly uomCode: string;
  readonly enteredQuantityMicrounits: number;
  readonly factorNumerator: number;
  readonly factorDenominator: number;
  readonly requestedQuantityMicrounits: number;
  readonly unitPriceCents: number;
  readonly batchId?: string | null;
  readonly locationId?: string | null;
  readonly serialIds?: readonly string[];
}

function fail(code: string): never {
  throw new Error(code);
}

function assertNonEmpty(value: string, code: string): void {
  if (value.trim() === '') fail(code);
}

function assertSafeInteger(value: number, code: string, minimum: number = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code);
}

function parseIsoInstant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return fail('CUSTOMER_ORDER_INVALID_ISO_DATE');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    return fail('CUSTOMER_ORDER_INVALID_ISO_DATE');
  }
  return timestamp;
}

function isTerminal(status: CustomerOrderStatus): status is CustomerOrderTerminalStatus {
  return status === 'FULFILLED' || status === 'CANCELLED' || status === 'EXPIRED';
}

export function assertCustomerOrderConservation(input: CustomerOrderQuantities): void {
  assertSafeInteger(input.requestedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.fulfilledQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.releasedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.reservedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  const accounted =
    input.fulfilledQuantityMicrounits +
    input.releasedQuantityMicrounits +
    input.reservedQuantityMicrounits;
  if (!Number.isSafeInteger(accounted) || input.requestedQuantityMicrounits !== accounted) {
    fail('CUSTOMER_ORDER_CONSERVATION_VIOLATION');
  }
}

export function customerOrderRemainingMicrounits(
  input: Omit<CustomerOrderQuantities, 'reservedQuantityMicrounits'>,
): number {
  assertSafeInteger(input.requestedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.fulfilledQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.releasedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  const remaining =
    input.requestedQuantityMicrounits -
    input.fulfilledQuantityMicrounits -
    input.releasedQuantityMicrounits;
  assertSafeInteger(remaining, 'CUSTOMER_ORDER_CONSERVATION_VIOLATION', 0);
  return remaining;
}

function planItem(item: CustomerOrderItemInput) {
  assertNonEmpty(item.productId, 'CUSTOMER_ORDER_ITEM_INVALID');
  assertNonEmpty(item.productUomId, 'CUSTOMER_ORDER_ITEM_INVALID');
  assertNonEmpty(item.uomCode, 'CUSTOMER_ORDER_ITEM_INVALID');
  assertSafeInteger(item.enteredQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 1);
  assertSafeInteger(item.factorNumerator, 'CUSTOMER_ORDER_INVALID_FACTOR', 1);
  assertSafeInteger(item.factorDenominator, 'CUSTOMER_ORDER_INVALID_FACTOR', 1);
  assertSafeInteger(item.requestedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 1);
  assertSafeInteger(item.unitPriceCents, 'CUSTOMER_ORDER_INVALID_PRICE', 0);

  const scaled = item.enteredQuantityMicrounits * item.factorNumerator;
  if (
    !Number.isSafeInteger(scaled) ||
    scaled % item.factorDenominator !== 0 ||
    scaled / item.factorDenominator !== item.requestedQuantityMicrounits
  ) {
    fail('CUSTOMER_ORDER_FACTOR_MISMATCH');
  }

  const serialIds = item.serialIds ?? [];
  for (const serialId of serialIds) assertNonEmpty(serialId, 'CUSTOMER_ORDER_SERIAL_INVALID');
  if (new Set(serialIds).size !== serialIds.length) fail('CUSTOMER_ORDER_SERIAL_INVALID');
  if (
    serialIds.length > 0 &&
    serialIds.length * CUSTOMER_ORDER_MICROUNITS_PER_BASE_UNIT !== item.requestedQuantityMicrounits
  ) {
    fail('CUSTOMER_ORDER_SERIAL_QUANTITY_MISMATCH');
  }

  return {
    ...item,
    serialIds: [...serialIds],
    reservedQuantityMicrounits: item.requestedQuantityMicrounits,
    fulfilledQuantityMicrounits: 0,
    releasedQuantityMicrounits: 0,
  };
}

export function planCustomerOrderCreate(input: {
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly reservedUntil: string;
  readonly items: readonly CustomerOrderItemInput[];
}) {
  assertNonEmpty(input.tenantId, 'CUSTOMER_ORDER_TENANT_REQUIRED');
  assertNonEmpty(input.branchId, 'CUSTOMER_ORDER_BRANCH_REQUIRED');
  assertNonEmpty(input.customerId, 'CUSTOMER_ORDER_CUSTOMER_REQUIRED');
  parseIsoInstant(input.reservedUntil);
  if (input.items.length < 1 || input.items.length > CUSTOMER_ORDER_MAX_ITEMS) {
    fail('CUSTOMER_ORDER_ITEM_COUNT_INVALID');
  }
  return {
    kind: 'CUSTOMER_ORDER' as const,
    reservesStock: true as const,
    emitsSale: false as const,
    emitsPayment: false as const,
    emitsFiscalDocument: false as const,
    emitsFiscalOutbox: false as const,
    acceptsAdvancePayment: false as const,
    items: input.items.map(planItem),
  };
}

const ALLOWED_TRANSITIONS: Readonly<Record<'OPEN' | 'PARTIAL', readonly CustomerOrderStatus[]>> = {
  OPEN: ['PARTIAL', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
  PARTIAL: ['FULFILLED', 'CANCELLED', 'EXPIRED'],
};

export function assertCustomerOrderTransition(
  current: CustomerOrderStatus,
  next: CustomerOrderStatus,
): void {
  if (isTerminal(current)) fail('CUSTOMER_ORDER_TERMINAL');
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    fail('CUSTOMER_ORDER_INVALID_TRANSITION');
  }
}

export function planCustomerOrderFulfillment(input: {
  readonly status: CustomerOrderStatus;
  readonly requestedQuantityMicrounits: number;
  readonly reservedQuantityMicrounits: number;
  readonly fulfillQuantityMicrounits: number;
}) {
  if (isTerminal(input.status)) fail('CUSTOMER_ORDER_TERMINAL');
  assertSafeInteger(input.requestedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 1);
  assertSafeInteger(input.reservedQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 0);
  assertSafeInteger(input.fulfillQuantityMicrounits, 'CUSTOMER_ORDER_INVALID_QUANTITY', 1);
  if (
    input.reservedQuantityMicrounits > input.requestedQuantityMicrounits ||
    input.fulfillQuantityMicrounits > input.reservedQuantityMicrounits
  ) {
    fail('CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING');
  }
  const nextReservedQuantityMicrounits =
    input.reservedQuantityMicrounits - input.fulfillQuantityMicrounits;
  const nextStatus: 'FULFILLED' | 'PARTIAL' =
    nextReservedQuantityMicrounits === 0 ? 'FULFILLED' : 'PARTIAL';
  assertCustomerOrderTransition(input.status, nextStatus);
  return {
    nextStatus,
    nextReservedQuantityMicrounits,
    fulfilledQuantityDeltaMicrounits: input.fulfillQuantityMicrounits,
    stockDeductionMicrounits: 0 as const,
  };
}

export function decideCustomerOrderClose(
  input: CustomerOrderQuantities & {
    readonly status: CustomerOrderStatus;
    readonly targetStatus: 'CANCELLED' | 'EXPIRED';
    readonly noticeIntentPersisted: boolean;
  },
) {
  assertCustomerOrderConservation(input);
  assertCustomerOrderTransition(input.status, input.targetStatus);
  if (input.targetStatus === 'EXPIRED' && !input.noticeIntentPersisted) {
    fail('CUSTOMER_ORDER_EXPIRY_NOTICE_REQUIRED');
  }
  const nextReleasedQuantityMicrounits =
    input.releasedQuantityMicrounits + input.reservedQuantityMicrounits;
  return {
    nextStatus: input.targetStatus,
    releaseQuantityMicrounits: input.reservedQuantityMicrounits,
    nextReservedQuantityMicrounits: 0,
    nextReleasedQuantityMicrounits,
  };
}

export function resolveCustomerOrderPrice(input: {
  readonly status: CustomerOrderStatus;
  readonly reservedUntil: string;
  readonly now: string;
  readonly snapshotUnitPriceCents: number;
  readonly currentUnitPriceCents: number;
}) {
  const reservedUntil = parseIsoInstant(input.reservedUntil);
  const now = parseIsoInstant(input.now);
  assertSafeInteger(input.snapshotUnitPriceCents, 'CUSTOMER_ORDER_INVALID_PRICE', 0);
  assertSafeInteger(input.currentUnitPriceCents, 'CUSTOMER_ORDER_INVALID_PRICE', 0);
  if (input.status === 'FULFILLED' || input.status === 'CANCELLED') {
    fail('CUSTOMER_ORDER_TERMINAL');
  }
  if (input.status === 'EXPIRED' || now >= reservedUntil) {
    return {
      unitPriceCents: input.currentUnitPriceCents,
      source: 'CURRENT_PRICING' as const,
      releaseFirst: true as const,
      requiresSupervisor: true as const,
    };
  }
  return {
    unitPriceCents: input.snapshotUnitPriceCents,
    source: 'ORDER_SNAPSHOT' as const,
    requiresSupervisor: false as const,
  };
}

export interface CustomerOrderRepricingScope {
  readonly tenantId: string;
  readonly customerOrderId: string;
  readonly saleId: string;
  readonly snapshotUnitPriceCents: number;
  readonly currentUnitPriceCents: number;
}

export interface CustomerOrderRepricingAuthorization extends CustomerOrderRepricingScope {
  readonly role: 'owner' | 'admin' | 'supervisor' | 'cashier';
}

export function assertCustomerOrderRepricingAuthorized(
  scope: CustomerOrderRepricingScope,
  authorization: CustomerOrderRepricingAuthorization,
): void {
  assertSafeInteger(scope.snapshotUnitPriceCents, 'CUSTOMER_ORDER_INVALID_PRICE', 0);
  assertSafeInteger(scope.currentUnitPriceCents, 'CUSTOMER_ORDER_INVALID_PRICE', 0);
  if (authorization.role === 'cashier') fail('CUSTOMER_ORDER_REPRICE_FORBIDDEN');
  if (
    authorization.tenantId !== scope.tenantId ||
    authorization.customerOrderId !== scope.customerOrderId ||
    authorization.saleId !== scope.saleId ||
    authorization.snapshotUnitPriceCents !== scope.snapshotUnitPriceCents ||
    authorization.currentUnitPriceCents !== scope.currentUnitPriceCents
  ) {
    fail('CUSTOMER_ORDER_REPRICE_SCOPE_MISMATCH');
  }
}

export function planCustomerOrderNotification(input: {
  readonly whatsappCapabilityEnabled: boolean;
  readonly whatsappOptInActive: boolean;
}) {
  return {
    eventType: 'EXPIRY_WARNING' as const,
    channel:
      input.whatsappCapabilityEnabled && input.whatsappOptInActive
        ? ('WHATSAPP' as const)
        : ('IN_APP' as const),
    initialStatus: 'PENDING' as const,
    blocksExpiryRelease: false as const,
  };
}
