import {
  cancelRecurringPlanAtomic,
  createRecurringPlanAtomic,
  transitionRecurringPlanAtomic,
  versionRecurringPlanAtomic,
} from '@kipuspay/adapters-d1/process-recurring-sale-atomic';
import { computeRecurringPeriod, computeRecurringProration } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isRecurringSalesEnabled } from '../auth/features.js';

export { isRecurringSalesEnabled };

export interface RecurringSalesActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly branchId?: string;
  readonly allowedBranches?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface RecurringHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Operation = 'READ' | 'WRITE';
type Body = Record<string, unknown>;

const SAFE_CODES = new Set([
  'RECURRING_PLAN_NOT_FOUND',
  'RECURRING_CONFLICT',
  'RECURRING_INVALID_STATUS_TRANSITION',
  'RECURRING_ITEMS_REQUIRED',
  'RECURRING_PRODUCT_NOT_FOUND',
  'RECURRING_INVALID_ITEM',
  'RECURRING_INVALID_QUANTITY',
  'RECURRING_INVALID_TIME',
  'RECURRING_PRICE_UNAVAILABLE',
  'RECURRING_INVALID_RECEIVER',
  'RECURRING_INSUFFICIENT_STOCK',
  'RECURRING_SERIES_UNAVAILABLE',
]);

function result(status: number, body: Body): RecurringHttpResult {
  return { status, body };
}

function object(value: unknown): Body {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : {};
}

function text(value: Body, key: string): string {
  return typeof value[key] === 'string' ? value[key].trim() : '';
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function errorResult(error: unknown): RecurringHttpResult {
  const candidate =
    error instanceof Error && SAFE_CODES.has(error.message) ? error.message : 'RECURRING_FAILED';
  if (candidate === 'RECURRING_PLAN_NOT_FOUND') return result(404, { code: candidate });
  if (candidate === 'RECURRING_CONFLICT') return result(409, { code: candidate });
  if (candidate === 'RECURRING_FAILED') return result(500, { code: candidate });
  return result(422, { code: candidate });
}

function canManage(actor: RecurringSalesActor): boolean {
  const role = actor.role.toLowerCase();
  return (
    ['owner', 'admin'].includes(role) &&
    actor.permissions?.includes('sales.recurring.manage') === true
  );
}

async function preflight(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  operation: Operation,
): Promise<RecurringHttpResult | null> {
  void operation;
  if (!isRecurringSalesEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env?.DB) return result(503, { code: 'DB_UNAVAILABLE' });
  if (!actor.tenantId || !actor.userId || !canManage(actor)) {
    return result(403, { code: 'FORBIDDEN' });
  }
  try {
    const capability = await env.DB.prepare(
      `SELECT enabled FROM tenant_capabilities
       WHERE tenant_id = ? AND capability = 'sales.recurring' LIMIT 1`,
    )
      .bind(actor.tenantId)
      .first<{ enabled: number }>();
    if (capability?.enabled !== 1) return result(404, { code: 'FEATURE_OFF' });
  } catch {
    return result(503, { code: 'CAPABILITY_UNAVAILABLE' });
  }
  return null;
}

async function branchAllowed(
  env: WorkerEnv,
  actor: RecurringSalesActor,
  branchId: string,
): Promise<RecurringHttpResult | null> {
  if (!branchId) return result(422, { code: 'BRANCH_REQUIRED' });
  if (actor.allowedBranches?.length && !actor.allowedBranches.includes(branchId)) {
    return result(404, { code: 'RECURRING_PLAN_NOT_FOUND' });
  }
  try {
    const row = await env
      .DB!.prepare(`SELECT 1 AS allowed FROM branches WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(actor.tenantId, branchId)
      .first<{ allowed: number }>();
    if (!row) return result(404, { code: 'RECURRING_PLAN_NOT_FOUND' });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
  return null;
}

async function scopedPlan(
  env: WorkerEnv,
  actor: RecurringSalesActor,
  planId: string,
  branchId = '',
): Promise<{ branch_id: string; version: number } | RecurringHttpResult> {
  try {
    const row = await env
      .DB!.prepare(
        `SELECT branch_id, version FROM recurring_plans
       WHERE tenant_id = ? AND id = ?
         AND (? = '' OR branch_id = ?) LIMIT 1`,
      )
      .bind(actor.tenantId, planId, branchId, branchId)
      .first<{ branch_id: string; version: number }>();
    if (!row || (actor.allowedBranches?.length && !actor.allowedBranches.includes(row.branch_id))) {
      return result(404, { code: 'RECURRING_PLAN_NOT_FOUND' });
    }
    return row;
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

function isHttpResult(value: unknown): value is RecurringHttpResult {
  return Boolean(value && typeof value === 'object' && 'status' in value && 'body' in value);
}

function parsedItems(body: Body) {
  const values = Array.isArray(body.items) ? body.items : [];
  return values.map((raw) => {
    const item = object(raw);
    const productUomId = text(item, 'productUomId');
    const priceListId = text(item, 'priceListId');
    return {
      productId: text(item, 'productId'),
      productUomId: productUomId || text(item, 'productId'),
      enteredQuantityMicrounits:
        integer(item.enteredQuantityMicrounits) ?? integer(item.quantityMicrounits) ?? 0,
      ...(priceListId ? { priceListId } : {}),
    };
  });
}

function schedule(body: Body): {
  documentType: 'NV' | '03' | '01';
  pricingPolicy: 'FIXED' | 'CURRENT';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  anchorDay: number;
  anchorIsLastDay: boolean;
  anchorTime: string;
  graceDays: number;
  afterGracePolicy: 'CONTINUE' | 'PAUSE_FUTURE_EXECUTION';
  catchUpLimit: number;
  effectiveFrom: string;
  nextRunAt: string;
  items: ReturnType<typeof parsedItems>;
} {
  const frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' =
    body.frequency === 'DAILY' || body.frequency === 'WEEKLY' ? body.frequency : 'MONTHLY';
  const effectiveFrom = text(body, 'effectiveFrom') || new Date().toISOString();
  const nextRunAt = text(body, 'nextRunAt') || effectiveFrom;
  return {
    documentType:
      body.documentType === '01' || body.documentType === '03' ? body.documentType : 'NV',
    pricingPolicy: body.pricingPolicy === 'CURRENT' ? ('CURRENT' as const) : ('FIXED' as const),
    frequency,
    anchorDay: integer(body.anchorDay) ?? new Date(Date.parse(effectiveFrom)).getUTCDate(),
    anchorIsLastDay: body.anchorIsLastDay === true,
    anchorTime: text(body, 'anchorTime') || '09:00:00',
    graceDays: integer(body.graceDays) ?? 3,
    afterGracePolicy:
      body.afterGracePolicy === 'PAUSE_FUTURE_EXECUTION'
        ? ('PAUSE_FUTURE_EXECUTION' as const)
        : ('CONTINUE' as const),
    catchUpLimit: integer(body.catchUpLimit) ?? 3,
    effectiveFrom,
    nextRunAt,
    items: parsedItems(body),
  };
}

export async function runCreateRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  rawBody: unknown,
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'WRITE');
  if (denied) return denied;
  const body = object(rawBody);
  const branchId = text(body, 'branchId');
  const branchDenied = await branchAllowed(env!, actor, branchId);
  if (branchDenied) return branchDenied;
  try {
    const created = await createRecurringPlanAtomic(env!.DB!, {
      tenantId: actor.tenantId,
      planKey: text(body, 'planKey') || crypto.randomUUID(),
      customerId: text(body, 'customerId'),
      branchId,
      actorUserId: actor.userId,
      ...schedule(body),
    });
    return result(201, {
      tenantId: actor.tenantId,
      branchId,
      pricingPolicy: schedule(body).pricingPolicy,
      nextRunAt: schedule(body).nextRunAt,
      ...created,
    });
  } catch (error) {
    return errorResult(error);
  }
}

export async function runUpdateRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  rawBody: unknown,
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'WRITE');
  if (denied) return denied;
  const body = object(rawBody);
  const planId = text(body, 'planId');
  const scoped = await scopedPlan(env!, actor, planId, text(body, 'branchId'));
  if (isHttpResult(scoped)) return scoped;
  const expectedVersion = integer(body.expectedVersion);
  if (expectedVersion === undefined) return result(422, { code: 'VERSION_REQUIRED' });
  try {
    return result(
      200,
      await versionRecurringPlanAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        planId,
        expectedVersion,
        actorUserId: actor.userId,
        ...schedule(body),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runListRecurringPlansHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  query: { branchId?: string | undefined; status?: string | undefined } = {},
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  const branchId = query.branchId?.trim() ?? '';
  const branchDenied = await branchAllowed(env!, actor, branchId);
  if (branchDenied) return branchDenied;
  try {
    const rows = await env!
      .DB!.prepare(
        `SELECT rp.id, rp.plan_key, rp.plan_version, rp.customer_id, rp.branch_id,
              rp.document_type, rp.pricing_policy, rp.frequency, rp.status,
              rp.grace_days, rp.after_grace_policy, rp.next_run_at,
              rp.retry_count, rp.next_retry_at, rp.last_error_code, rp.version,
              COALESCE(ar.balance_due_cents, 0) AS balance_due_cents
       FROM recurring_plans rp
       LEFT JOIN recurring_occurrences ro ON ro.tenant_id = rp.tenant_id
         AND ro.plan_id = rp.id
       LEFT JOIN accounts_receivable ar ON ar.tenant_id = ro.tenant_id
         AND ar.id = ro.accounts_receivable_id
       WHERE rp.tenant_id = ? AND rp.branch_id = ?
         AND (? = '' OR rp.status = ?)
       GROUP BY rp.id
       ORDER BY rp.next_run_at, rp.id LIMIT 100`,
      )
      .bind(actor.tenantId, branchId, query.status ?? '', query.status ?? '')
      .all<Record<string, unknown>>();
    return result(200, { plans: rows.results ?? [] });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

export async function runGetRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  input: { planId: string; branchId?: string | undefined },
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  const scoped = await scopedPlan(env!, actor, input.planId, input.branchId ?? '');
  if (isHttpResult(scoped)) return scoped;
  try {
    const plan = await env!
      .DB!.prepare(`SELECT * FROM recurring_plans WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(actor.tenantId, input.planId)
      .first<Record<string, unknown>>();
    const items = await env!
      .DB!.prepare(
        `SELECT id, product_id, product_uom_id, entered_quantity_microunits,
              fixed_unit_price_cents, price_list_id
       FROM recurring_plan_items WHERE tenant_id = ? AND plan_id = ?
       ORDER BY line_number`,
      )
      .bind(actor.tenantId, input.planId)
      .all<Record<string, unknown>>();
    return result(200, { ...plan, items: items.results ?? [] });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

export async function runListRecurringOccurrencesHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  input: { planId: string; branchId?: string | undefined },
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  const scoped = await scopedPlan(env!, actor, input.planId, input.branchId ?? '');
  if (isHttpResult(scoped)) return scoped;
  try {
    const rows = await env!
      .DB!.prepare(
        `SELECT ro.id, ro.plan_version, ro.period_start, ro.period_end, ro.status,
              ro.sale_id, ro.accounts_receivable_id, ro.document_type,
              ro.total_amount_cents, ro.settled_at,
              ar.balance_due_cents, ar.status AS receivable_status
       FROM recurring_occurrences ro
       JOIN recurring_plans rp ON rp.tenant_id = ro.tenant_id AND rp.id = ro.plan_id
       LEFT JOIN accounts_receivable ar ON ar.tenant_id = ro.tenant_id
         AND ar.id = ro.accounts_receivable_id
       WHERE ro.tenant_id = ? AND ro.plan_id = ? AND rp.branch_id = ?
       ORDER BY ro.period_start DESC LIMIT 100`,
      )
      .bind(actor.tenantId, input.planId, scoped.branch_id)
      .all<Record<string, unknown>>();
    return result(200, {
      occurrences: rows.results ?? [],
      retry: {
        count: 0,
        status: 'SAFE',
      },
    });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

export async function runPreviewRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  input: { planId: string; branchId?: string | undefined },
): Promise<RecurringHttpResult> {
  const detail = await runGetRecurringPlanHttp(env, actor, input);
  if (detail.status !== 200) return detail;
  const plan = detail.body;
  try {
    const period = computeRecurringPeriod(
      {
        timezone: 'America/Lima',
        frequency:
          plan.frequency === 'DAILY' || plan.frequency === 'WEEKLY' ? plan.frequency : 'MONTHLY',
        anchorDay: integer(plan.anchor_day) ?? 1,
        anchorIsLastDay: plan.anchor_is_last_day === 1,
        anchorTime: typeof plan.anchor_time === 'string' ? plan.anchor_time : '09:00:00',
        pricingPolicy: plan.pricing_policy === 'CURRENT' ? 'CURRENT' : 'FIXED',
        graceDays: integer(plan.grace_days) ?? 3,
        afterGracePolicy:
          plan.after_grace_policy === 'PAUSE_FUTURE_EXECUTION'
            ? 'PAUSE_FUTURE_EXECUTION'
            : 'CONTINUE',
        items: [],
      },
      typeof plan.next_run_at === 'string' ? plan.next_run_at : new Date().toISOString(),
    );
    return result(200, {
      planId: input.planId,
      pricingPolicy: plan.pricing_policy,
      nextRunAt: plan.next_run_at,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      items: plan.items,
      serverAuthoritative: true,
    });
  } catch {
    return result(422, { code: 'RECURRING_INVALID_TIME' });
  }
}

async function transition(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  rawBody: unknown,
  target: 'ACTIVE' | 'PAUSED',
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'WRITE');
  if (denied) return denied;
  const body = object(rawBody);
  const planId = text(body, 'planId');
  const scoped = await scopedPlan(env!, actor, planId, text(body, 'branchId'));
  if (isHttpResult(scoped)) return scoped;
  const expectedVersion = integer(body.expectedVersion);
  if (expectedVersion === undefined) return result(422, { code: 'VERSION_REQUIRED' });
  try {
    return result(
      200,
      await transitionRecurringPlanAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        planId,
        expectedVersion,
        actorUserId: actor.userId,
        target,
        reason: text(body, 'reason'),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runPauseRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  body: unknown,
): Promise<RecurringHttpResult> {
  return transition(env, actor, body, 'PAUSED');
}

export async function runResumeRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  body: unknown,
): Promise<RecurringHttpResult> {
  return transition(env, actor, body, 'ACTIVE');
}

export async function runPreviewRecurringCancellationHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  rawBody: unknown,
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  const body = object(rawBody);
  const planId = text(body, 'planId');
  const scoped = await scopedPlan(env!, actor, planId, text(body, 'branchId'));
  if (isHttpResult(scoped)) return scoped;
  const cancelledAt = text(body, 'cancelledAt') || new Date().toISOString();
  try {
    const rows = await env!
      .DB!.prepare(
        `SELECT ro.period_start, ro.period_end, ro.document_type,
              roi.applied_total_cents
       FROM recurring_occurrences ro
       JOIN recurring_occurrence_items roi ON roi.tenant_id = ro.tenant_id
         AND roi.occurrence_id = ro.id
       WHERE ro.tenant_id = ? AND ro.plan_id = ?
         AND julianday(?) >= julianday(ro.period_start)
         AND julianday(?) < julianday(ro.period_end)
       ORDER BY roi.line_number`,
      )
      .bind(actor.tenantId, planId, cancelledAt, cancelledAt)
      .all<{
        period_start: string;
        period_end: string;
        document_type: string;
        applied_total_cents: number;
      }>();
    const lines = (rows.results ?? []).map((row) =>
      computeRecurringProration({
        lineTotalCents: row.applied_total_cents,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        cancelledAt,
        mode: 'IMMEDIATE',
      }),
    );
    const creditAmountCents = lines.reduce((sum, line) => sum + line.creditAmountCents, 0);
    const documentType = rows.results?.[0]?.document_type === 'NV' ? 'NV_RETURN' : '07';
    return result(200, {
      previewId: crypto.randomUUID(),
      planId,
      expectedVersion: integer(body.expectedVersion) ?? scoped.version,
      cancelledAt,
      creditAmountCents,
      adjustmentDocumentType: documentType,
      lines,
      confirmationRequired: true,
    });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

export async function runCancelRecurringPlanHttp(
  env: WorkerEnv | undefined,
  actor: RecurringSalesActor,
  rawBody: unknown,
): Promise<RecurringHttpResult> {
  const denied = await preflight(env, actor, 'WRITE');
  if (denied) return denied;
  const body = object(rawBody);
  const planId = text(body, 'planId');
  const scoped = await scopedPlan(env!, actor, planId, text(body, 'branchId'));
  if (isHttpResult(scoped)) return scoped;
  const mode = body.mode === 'IMMEDIATE' ? 'IMMEDIATE' : 'AT_PERIOD_END';
  if (mode === 'IMMEDIATE' && body.confirm !== true) {
    return result(422, { code: 'CANCELLATION_CONFIRMATION_REQUIRED' });
  }
  const expectedVersion = integer(body.expectedVersion) ?? scoped.version;
  try {
    return result(
      200,
      await cancelRecurringPlanAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        planId,
        expectedVersion,
        actorUserId: actor.userId,
        mode,
        cancelledAt: text(body, 'cancelledAt') || new Date().toISOString(),
        idempotencyKey: text(body, 'idempotencyKey') || crypto.randomUUID(),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}
