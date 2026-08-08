import type { VerifiedTerminalContext } from '../catalog/price-label-client.js';

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CustomerOrderStatus = 'OPEN' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

export interface CustomerOrderItemDto {
  readonly id: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly product_uom_id: string;
  readonly requested_quantity_microunits: number;
  readonly reserved_quantity_microunits: number;
  readonly fulfilled_quantity_microunits: number;
  readonly released_quantity_microunits: number;
  readonly unit_price_cents: number;
}

export interface CustomerOrderSummaryDto {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly status: CustomerOrderStatus;
  readonly pickup_at: string | null;
  readonly reserved_until: string;
  readonly version: number;
}

export interface CustomerOrderDetailDto extends CustomerOrderSummaryDto {
  readonly created_by_user_id: string;
  readonly items: readonly CustomerOrderItemDto[];
}

export interface CustomerOrderCreateRequest {
  readonly branchId: string;
  readonly customerId: string;
  readonly idempotencyKey: string;
  readonly reservedUntil: string;
  readonly pickupAt?: string | null;
  readonly priceListId?: string;
  readonly items: readonly {
    readonly productId: string;
    readonly productUomId?: string;
    readonly enteredQuantityMicrounits: number;
    readonly batchId?: string;
    readonly locationId?: string;
    readonly serialId?: string;
    readonly serialIds?: readonly string[];
  }[];
}

export interface CustomerOrderCreateResult {
  readonly orderId: string;
  readonly status: 'OPEN';
  readonly saleId: null;
  readonly paymentId: null;
  readonly fiscalDocumentId: null;
  readonly alreadyApplied: boolean;
}

export interface CustomerOrderLeaseResult {
  readonly envelope: string;
  readonly envelopeId: string;
  readonly scope: 'CUSTOMER_ORDER_FULFILL';
  readonly oneShot: true;
  readonly ttlSeconds: number;
}

const SAFE_ERROR_CODES = new Set([
  'FEATURE_OFF',
  'FORBIDDEN',
  'TERMINAL_REQUIRED',
  'CUSTOMER_ORDER_NOT_FOUND',
  'CUSTOMER_ORDER_TERMINAL',
  'CUSTOMER_ORDER_CONFLICT',
  'CUSTOMER_ORDER_RESERVATION_EXPIRED',
  'CUSTOMER_ORDER_LEASE_INVALID',
  'CUSTOMER_ORDER_LEASE_CONFLICT',
  'CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING',
  'CUSTOMER_ORDER_INSUFFICIENT_STOCK',
  'CUSTOMER_ORDER_CANCEL_REASON_REQUIRED',
  'CUSTOMER_ORDER_REPRICE_AUTH_INVALID',
  'CUSTOMER_ORDER_REPRICE_REQUIRES_EXPIRED',
]);

export class CustomerOrderClientError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'CustomerOrderClientError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function status(value: unknown): value is CustomerOrderStatus {
  return ['OPEN', 'PARTIAL', 'FULFILLED', 'CANCELLED', 'EXPIRED'].includes(String(value));
}

function isSummary(value: unknown): value is CustomerOrderSummaryDto {
  const row = object(value);
  return Boolean(
    row &&
    string(row.id) &&
    string(row.branch_id) &&
    string(row.customer_id) &&
    status(row.status) &&
    (row.pickup_at === null || typeof row.pickup_at === 'string') &&
    string(row.reserved_until) &&
    integer(row.version),
  );
}

function isItem(value: unknown): value is CustomerOrderItemDto {
  const row = object(value);
  return Boolean(
    row &&
    string(row.id) &&
    string(row.product_id) &&
    string(row.product_name) &&
    string(row.product_uom_id) &&
    [
      'requested_quantity_microunits',
      'reserved_quantity_microunits',
      'fulfilled_quantity_microunits',
      'released_quantity_microunits',
      'unit_price_cents',
    ].every((key) => integer(row[key])),
  );
}

async function body(response: Response): Promise<Record<string, unknown>> {
  try {
    return object(await response.json()) ?? {};
  } catch {
    throw new CustomerOrderClientError('CUSTOMER_ORDER_RESPONSE_INVALID', response.status);
  }
}

async function checked(
  response: Response,
  guard: (value: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const value = await body(response);
  if (!response.ok) {
    const rawCode = typeof value.code === 'string' ? value.code : '';
    const code = SAFE_ERROR_CODES.has(rawCode) ? rawCode : `CUSTOMER_ORDER_HTTP_${response.status}`;
    throw new CustomerOrderClientError(code, response.status);
  }
  if (!guard(value)) {
    throw new CustomerOrderClientError('CUSTOMER_ORDER_RESPONSE_INVALID', response.status);
  }
  return value;
}

function hasStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => string(value[key]));
}

function hasTerminal(
  terminal: VerifiedTerminalContext | null,
): terminal is VerifiedTerminalContext {
  return Boolean(
    terminal?.verified === true && terminal.terminalId.trim() && terminal.terminalSessionId.trim(),
  );
}

export function createCustomerOrdersApi(input: {
  readonly authenticatedFetch: FetchPort;
  readonly terminalContext: () => VerifiedTerminalContext | null;
  readonly apiBase?: string;
}) {
  const apiBase = (input.apiBase ?? '').replace(/\/$/, '');
  const request = async (
    path: string,
    init: RequestInit,
    guard: (value: Record<string, unknown>) => boolean,
    requiresTerminal = false,
  ) => {
    const terminal = input.terminalContext();
    if (requiresTerminal && !hasTerminal(terminal)) {
      throw new CustomerOrderClientError('CUSTOMER_ORDER_TERMINAL_CONTEXT_REQUIRED');
    }
    const headers = new Headers(init.headers);
    if (hasTerminal(terminal)) {
      headers.set('x-terminal-id', terminal.terminalId);
      headers.set('x-terminal-session-id', terminal.terminalSessionId);
    }
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    return checked(
      await input.authenticatedFetch(`${apiBase}${path}`, { ...init, headers }),
      guard,
    );
  };

  return {
    async list(
      query: {
        readonly branchId?: string;
        readonly status?: CustomerOrderStatus;
      } = {},
    ): Promise<readonly CustomerOrderSummaryDto[]> {
      const params = new URLSearchParams();
      if (query.branchId) params.set('branchId', query.branchId);
      if (query.status) params.set('status', query.status);
      const suffix = params.size ? `?${params.toString()}` : '';
      const value = await request(
        `/api/orders/customer-orders${suffix}`,
        { method: 'GET' },
        (candidate) => Array.isArray(candidate.orders) && candidate.orders.every(isSummary),
      );
      return value.orders as readonly CustomerOrderSummaryDto[];
    },
    async detail(orderId: string): Promise<CustomerOrderDetailDto> {
      const value = await request(
        `/api/orders/customer-orders/${encodeURIComponent(orderId)}`,
        { method: 'GET' },
        (candidate) =>
          isSummary(candidate) &&
          string(candidate.created_by_user_id) &&
          Array.isArray(candidate.items) &&
          candidate.items.every(isItem),
      );
      return value as unknown as CustomerOrderDetailDto;
    },
    async create(createInput: CustomerOrderCreateRequest): Promise<CustomerOrderCreateResult> {
      const value = await request(
        '/api/orders/customer-orders',
        { method: 'POST', body: JSON.stringify(createInput) },
        (candidate) =>
          string(candidate.orderId) &&
          candidate.status === 'OPEN' &&
          candidate.saleId === null &&
          candidate.paymentId === null &&
          candidate.fiscalDocumentId === null &&
          typeof candidate.alreadyApplied === 'boolean',
        true,
      );
      return value as unknown as CustomerOrderCreateResult;
    },
    async requestLease(leaseInput: {
      readonly orderId: string;
      readonly items: readonly { readonly itemId: string; readonly quantityMicrounits: number }[];
      readonly requestedTtlSeconds?: number;
      readonly idempotencyKey: string;
    }): Promise<CustomerOrderLeaseResult> {
      const value = await request(
        '/api/orders/customer-orders/leases',
        { method: 'POST', body: JSON.stringify(leaseInput) },
        (candidate) =>
          hasStrings(candidate, ['envelope', 'envelopeId']) &&
          candidate.scope === 'CUSTOMER_ORDER_FULFILL' &&
          candidate.oneShot === true &&
          integer(candidate.ttlSeconds) &&
          candidate.ttlSeconds > 0,
        true,
      );
      return value as unknown as CustomerOrderLeaseResult;
    },
    async fulfill(fulfillInput: {
      readonly orderId: string;
      readonly envelope: string;
      readonly idempotencyKey: string;
      readonly cashRegisterSessionId?: string;
      readonly documentType?: 'NV' | '01' | '03';
      readonly series?: string;
      readonly paymentMethodId?: string;
    }) {
      return request(
        '/api/orders/customer-orders/fulfill',
        { method: 'POST', body: JSON.stringify(fulfillInput) },
        (candidate) =>
          hasStrings(candidate, ['orderId', 'saleId', 'saleItemId']) &&
          ['PARTIAL', 'FULFILLED'].includes(String(candidate.status)) &&
          integer(candidate.totalAmountCents) &&
          typeof candidate.alreadyApplied === 'boolean',
        true,
      );
    },
    async cancel(cancelInput: {
      readonly orderId: string;
      readonly reason: string;
      readonly idempotencyKey: string;
    }) {
      return request(
        '/api/orders/customer-orders/cancel',
        { method: 'POST', body: JSON.stringify(cancelInput) },
        (candidate) =>
          string(candidate.orderId) &&
          candidate.status === 'CANCELLED' &&
          typeof candidate.alreadyApplied === 'boolean',
      );
    },
    async expire(expireInput: { readonly orderId: string; readonly idempotencyKey: string }) {
      return request(
        '/api/orders/customer-orders/expire',
        { method: 'POST', body: JSON.stringify(expireInput) },
        (candidate) =>
          string(candidate.orderId) &&
          candidate.status === 'EXPIRED' &&
          typeof candidate.alreadyApplied === 'boolean',
      );
    },
    async dispatchNotice(notificationId: string) {
      return request(
        '/api/orders/customer-orders/notices/dispatch',
        { method: 'POST', body: JSON.stringify({ notificationId }) },
        (candidate) => ['SENT', 'RETRY', 'FAILED'].includes(String(candidate.status)),
      );
    },
    async approveReprice(approval: {
      readonly orderId: string;
      readonly actorUserId: string;
      readonly requestedTtlSeconds?: number;
    }): Promise<{
      readonly token: string;
      readonly expiresAt: string;
      readonly scope: 'CUSTOMER_ORDER_REPRICE';
    }> {
      const terminal = input.terminalContext();
      if (!hasTerminal(terminal)) {
        throw new CustomerOrderClientError('CUSTOMER_ORDER_TERMINAL_CONTEXT_REQUIRED');
      }
      const value = await request(
        '/api/orders/customer-orders/reprice-authorizations',
        {
          method: 'POST',
          body: JSON.stringify({ ...approval, terminalId: terminal.terminalId }),
        },
        (candidate) =>
          string(candidate.token) &&
          string(candidate.expiresAt) &&
          candidate.scope === 'CUSTOMER_ORDER_REPRICE',
      );
      return value as unknown as {
        readonly token: string;
        readonly expiresAt: string;
        readonly scope: 'CUSTOMER_ORDER_REPRICE';
      };
    },
    async repriceHandoff(handoff: {
      readonly orderId: string;
      readonly authorizationToken: string;
      readonly idempotencyKey: string;
      readonly priceListId?: string;
    }) {
      return request(
        '/api/orders/customer-orders/reprice-handoff',
        { method: 'POST', body: JSON.stringify(handoff) },
        (candidate) =>
          string(candidate.quoteId) &&
          candidate.source === 'CURRENT_SERVER_PRICING' &&
          candidate.requiresOrdinaryCheckout === true &&
          Array.isArray(candidate.lines) &&
          candidate.lines.every((line) => {
            const item = object(line);
            return Boolean(
              item &&
              hasStrings(item, ['productId', 'productUomId']) &&
              integer(item.quantityMicrounits) &&
              integer(item.unitPriceCents),
            );
          }),
        true,
      );
    },
  };
}
