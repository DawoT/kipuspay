type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RecurringPricingPolicy = 'FIXED' | 'CURRENT';
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUALLY';
export type RecurringStatus =
  'ACTIVE' | 'GRACE' | 'PAUSED' | 'CANCEL_AT_PERIOD_END' | 'CANCELLED' | 'TERMINATED';

export interface RecurringItemRequest {
  readonly productId: string;
  readonly productUomId?: string;
  readonly quantityMicrounits: number;
  readonly priceListId?: string;
}

export interface RecurringCreateRequest {
  readonly customerId: string;
  readonly branchId: string;
  readonly documentType: 'NV' | '03' | '01';
  readonly pricingPolicy?: RecurringPricingPolicy;
  readonly frequency: RecurringFrequency;
  readonly anchorDay?: number;
  readonly anchorIsLastDay?: boolean;
  readonly anchorTime?: string;
  readonly graceDays?: number;
  readonly afterGracePolicy?: 'CONTINUE' | 'PAUSE_FUTURE_EXECUTION';
  readonly effectiveFrom?: string;
  readonly nextRunAt?: string;
  readonly items: readonly RecurringItemRequest[];
}

export interface RecurringPlanSummary {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly document_type: 'NV' | '03' | '01';
  readonly pricing_policy: RecurringPricingPolicy;
  readonly frequency: RecurringFrequency;
  readonly status: RecurringStatus;
  readonly grace_days: number;
  readonly next_run_at: string;
  readonly retry_count: number;
  readonly next_retry_at: string | null;
  readonly last_error_code: string | null;
  readonly version: number;
  readonly balance_due_cents: number;
}

export class RecurringSalesClientError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'RecurringSalesClientError';
  }
}

const SAFE_ERRORS = new Set([
  'FEATURE_OFF',
  'FORBIDDEN',
  'BRANCH_REQUIRED',
  'VERSION_REQUIRED',
  'RECURRING_PLAN_NOT_FOUND',
  'RECURRING_CONFLICT',
  'RECURRING_INVALID_STATUS_TRANSITION',
  'CANCELLATION_CONFIRMATION_REQUIRED',
]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isPlan(value: unknown): value is RecurringPlanSummary {
  const row = object(value);
  return Boolean(
    row &&
    nonEmpty(row.id) &&
    nonEmpty(row.branch_id) &&
    nonEmpty(row.customer_id) &&
    ['NV', '03', '01'].includes(String(row.document_type)) &&
    ['FIXED', 'CURRENT'].includes(String(row.pricing_policy)) &&
    ['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(row.frequency)) &&
    ['ACTIVE', 'GRACE', 'PAUSED', 'CANCEL_AT_PERIOD_END', 'CANCELLED'].includes(
      String(row.status),
    ) &&
    nonEmpty(row.next_run_at) &&
    ['grace_days', 'retry_count', 'version', 'balance_due_cents'].every((key) =>
      safeInteger(row[key]),
    ) &&
    (row.next_retry_at === null || typeof row.next_retry_at === 'string') &&
    (row.last_error_code === null || typeof row.last_error_code === 'string'),
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  try {
    return object(await response.json()) ?? {};
  } catch {
    throw new RecurringSalesClientError('RECURRING_RESPONSE_INVALID', response.status);
  }
}

function createBody(input: RecurringCreateRequest): Record<string, unknown> {
  return {
    customerId: input.customerId,
    branchId: input.branchId,
    documentType: input.documentType,
    pricingPolicy: input.pricingPolicy ?? 'FIXED',
    frequency: input.frequency,
    ...(input.anchorDay === undefined ? {} : { anchorDay: input.anchorDay }),
    ...(input.anchorIsLastDay === undefined ? {} : { anchorIsLastDay: input.anchorIsLastDay }),
    ...(input.anchorTime ? { anchorTime: input.anchorTime } : {}),
    ...(input.graceDays === undefined ? {} : { graceDays: input.graceDays }),
    ...(input.afterGracePolicy ? { afterGracePolicy: input.afterGracePolicy } : {}),
    ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
    ...(input.nextRunAt ? { nextRunAt: input.nextRunAt } : {}),
    items: input.items.map((item) => ({
      productId: item.productId,
      ...(item.productUomId ? { productUomId: item.productUomId } : {}),
      quantityMicrounits: item.quantityMicrounits,
      ...(item.priceListId ? { priceListId: item.priceListId } : {}),
    })),
  };
}

export function createRecurringSalesApi(input: {
  readonly authenticatedFetch: FetchPort;
  readonly apiBase?: string;
}) {
  const base = (input.apiBase ?? '').replace(/\/$/, '');
  const request = async (
    path: string,
    init: RequestInit,
    guard: (value: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>> => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    let response: Response;
    try {
      response = await input.authenticatedFetch(`${base}${path}`, {
        ...init,
        credentials: 'include',
        headers,
      });
    } catch {
      throw new RecurringSalesClientError('RECURRING_OFFLINE');
    }
    const value = await json(response);
    if (!response.ok) {
      const raw = typeof value.code === 'string' ? value.code : '';
      throw new RecurringSalesClientError(
        SAFE_ERRORS.has(raw) ? raw : `RECURRING_HTTP_${response.status}`,
        response.status,
      );
    }
    if (!guard(value)) {
      throw new RecurringSalesClientError('RECURRING_RESPONSE_INVALID', response.status);
    }
    return value;
  };

  const scoped = (planId: string, branchId?: string) => {
    const params = new URLSearchParams();
    if (branchId) params.set('branchId', branchId);
    return `/api/admin/recurring-plans/${encodeURIComponent(planId)}${
      params.size ? `?${params}` : ''
    }`;
  };

  return {
    async list(query: { readonly branchId: string; readonly status?: RecurringStatus }) {
      const params = new URLSearchParams({ branchId: query.branchId });
      if (query.status) params.set('status', query.status);
      const value = await request(
        `/api/admin/recurring-plans?${params}`,
        { method: 'GET' },
        (row) => {
          return Array.isArray(row.plans) && row.plans.every(isPlan);
        },
      );
      return value.plans as readonly RecurringPlanSummary[];
    },
    async detail(input: { readonly planId: string; readonly branchId?: string }) {
      return request(scoped(input.planId, input.branchId), { method: 'GET' }, (row) => {
        return nonEmpty(row.id) && Array.isArray(row.items);
      });
    },
    async create(createInput: RecurringCreateRequest) {
      return request(
        '/api/admin/recurring-plans',
        { method: 'POST', body: JSON.stringify(createBody(createInput)) },
        (row) =>
          nonEmpty(row.planId) &&
          safeInteger(row.planVersion) &&
          ['FIXED', 'CURRENT'].includes(String(row.pricingPolicy)) &&
          nonEmpty(row.nextRunAt),
      );
    },
    async update(
      updateInput: RecurringCreateRequest & {
        readonly planId: string;
        readonly expectedVersion: number;
      },
    ) {
      return request(
        `/api/admin/recurring-plans/${encodeURIComponent(updateInput.planId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...createBody(updateInput),
            expectedVersion: updateInput.expectedVersion,
          }),
        },
        (row) => nonEmpty(row.planId) && safeInteger(row.planVersion),
      );
    },
    async preview(previewInput: { readonly planId: string; readonly branchId?: string }) {
      const path = scoped(previewInput.planId, previewInput.branchId).replace(
        /(\?|$)/,
        '/preview$1',
      );
      return request(path, { method: 'GET' }, (row) => {
        return (
          nonEmpty(row.planId) &&
          nonEmpty(row.nextRunAt) &&
          Array.isArray(row.items) &&
          row.serverAuthoritative === true
        );
      });
    },
    async pause(action: {
      readonly planId: string;
      readonly expectedVersion: number;
      readonly branchId?: string;
    }) {
      return request(
        `/api/admin/recurring-plans/${encodeURIComponent(action.planId)}/pause`,
        { method: 'POST', body: JSON.stringify(action) },
        (row) => row.status === 'PAUSED',
      );
    },
    async resume(action: {
      readonly planId: string;
      readonly expectedVersion: number;
      readonly branchId?: string;
    }) {
      return request(
        `/api/admin/recurring-plans/${encodeURIComponent(action.planId)}/resume`,
        { method: 'POST', body: JSON.stringify(action) },
        (row) => row.status === 'ACTIVE',
      );
    },
    async cancelPreview(action: {
      readonly planId: string;
      readonly expectedVersion: number;
      readonly branchId?: string;
      readonly cancelledAt?: string;
    }) {
      return request(
        `/api/admin/recurring-plans/${encodeURIComponent(action.planId)}/cancel-preview`,
        { method: 'POST', body: JSON.stringify(action) },
        (row) =>
          nonEmpty(row.previewId) &&
          safeInteger(row.creditAmountCents) &&
          ['07', 'NV_RETURN'].includes(String(row.adjustmentDocumentType)) &&
          row.confirmationRequired === true,
      );
    },
    async cancel(action: {
      readonly planId: string;
      readonly mode: 'AT_PERIOD_END' | 'IMMEDIATE';
      readonly expectedVersion: number;
      readonly branchId?: string;
      readonly confirm?: true;
      readonly idempotencyKey?: string;
    }) {
      return request(
        `/api/admin/recurring-plans/${encodeURIComponent(action.planId)}/cancel`,
        { method: 'POST', body: JSON.stringify(action) },
        (row) =>
          ['CANCELLED', 'CANCEL_AT_PERIOD_END'].includes(String(row.status)) &&
          safeInteger(row.creditAmountCents),
      );
    },
    async occurrences(action: { readonly planId: string; readonly branchId?: string }) {
      const params = new URLSearchParams();
      if (action.branchId) params.set('branchId', action.branchId);
      const path = `/api/admin/recurring-plans/${encodeURIComponent(action.planId)}/occurrences${
        params.size ? `?${params}` : ''
      }`;
      return request(path, { method: 'GET' }, (row) => {
        return Array.isArray(row.occurrences) && object(row.retry) !== null;
      });
    },
  };
}
