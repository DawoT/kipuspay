import { runRecurringScheduler } from '@kipuspay/adapters-d1/process-recurring-sale-atomic';
import { readAuditChainHead, runD1AtomicPlan } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isRecurringSalesEnabled } from '../auth/features.js';

export class RecurringScheduledError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'RecurringScheduledError';
    this.code = code;
  }
}

export interface RecurringScheduledInput {
  readonly scheduledTime?: number;
  readonly cron?: string;
}

export interface RecurringManualRpcInput {
  readonly authorizationToken?: string;
  readonly idempotencyKey?: string;
  readonly tenantId?: string;
  readonly planId?: string;
  readonly limit?: number;
}

export interface RecurringScheduledResult {
  readonly status: 'COMPLETE' | 'FEATURE_OFF';
  readonly processedPeriods: number;
  readonly failures: number;
  readonly catchUpCapped: boolean;
  readonly tenants: number;
}

export interface RecurringManualRpcResult {
  readonly status: 'COMPLETE' | 'NOT_DUE' | 'NOT_FOUND' | 'FEATURE_OFF';
  readonly processedPeriods: number;
  readonly failures: number;
  readonly catchUpCapped: boolean;
  readonly replayed?: boolean;
}

function fail(code: string): never {
  throw new RecurringScheduledError(code);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

interface ManualAuthorization {
  readonly id: string;
  readonly approvedByUserId: string;
  readonly action: string;
  readonly idempotencyHash: string;
  readonly planId: string;
  readonly limit: number;
}

interface ManualTokenRow {
  readonly id: string;
  readonly approved_by_user_id: string;
  readonly used_at: string | null;
  readonly recurring_run_result_json: string | null;
}

function parseReplay(value: string | null): RecurringManualRpcResult | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result = parsed as Record<string, unknown>;
    if (result.status === 'FAILED' && result.code === 'RECURRING_SUPPORT_FAILED') {
      fail('RECURRING_SUPPORT_FAILED');
    }
    if (
      typeof result.status !== 'string' ||
      !['COMPLETE', 'NOT_DUE', 'NOT_FOUND', 'FEATURE_OFF'].includes(result.status) ||
      typeof result.processedPeriods !== 'number' ||
      typeof result.failures !== 'number' ||
      typeof result.catchUpCapped !== 'boolean'
    ) {
      return null;
    }
    return {
      status: result.status as RecurringManualRpcResult['status'],
      processedPeriods: result.processedPeriods,
      failures: result.failures,
      catchUpCapped: result.catchUpCapped,
      replayed: true,
    };
  } catch (error) {
    if (error instanceof RecurringScheduledError) throw error;
    return null;
  }
}

async function tenantRecurringEnabled(env: WorkerEnv, tenantId: string): Promise<boolean> {
  try {
    const row = await env
      .DB!.prepare(
        `SELECT enabled FROM tenant_capabilities
         WHERE tenant_id = ? AND capability = 'sales.recurring' LIMIT 1`,
      )
      .bind(tenantId)
      .first<{ enabled: number }>();
    return row?.enabled === 1;
  } catch {
    fail('RECURRING_CAPABILITY_UNAVAILABLE');
  }
}

// Token, environment, action, tenant, plan, idempotency, TTL and one-shot checks meet here.
// eslint-disable-next-line complexity
async function authorizeManualRpc(
  env: WorkerEnv,
  input: RecurringManualRpcInput,
  now: string,
): Promise<ManualAuthorization | RecurringManualRpcResult> {
  const token = input.authorizationToken?.trim() ?? '';
  const idempotencyKey = input.idempotencyKey?.trim() ?? '';
  const tenantId = input.tenantId?.trim() ?? '';
  const planId = input.planId?.trim() ?? '';
  if (!token) fail('RECURRING_SUPPORT_AUTH_REQUIRED');
  if (env.RECURRING_MANUAL_RUN_ENABLED !== '1' && env.RECURRING_MANUAL_RUN_ENABLED !== 'true') {
    fail('RECURRING_SUPPORT_ENVIRONMENT_FORBIDDEN');
  }
  if (!idempotencyKey || !tenantId) fail('RECURRING_SUPPORT_SCOPE_REQUIRED');
  let limit = 1;
  if (!planId) {
    if (input.limit === undefined) fail('RECURRING_SUPPORT_LIMIT_REQUIRED');
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      fail('RECURRING_SUPPORT_LIMIT_INVALID');
    }
    limit = input.limit;
  } else if (input.limit !== undefined) {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 31) {
      fail('RECURRING_SUPPORT_LIMIT_INVALID');
    }
    limit = input.limit;
  }
  if (!(await tenantRecurringEnabled(env, tenantId))) {
    return {
      status: 'FEATURE_OFF',
      processedPeriods: 0,
      failures: 0,
      catchUpCapped: false,
    };
  }
  const tokenHash = await sha256(token);
  const idempotencyHash = await sha256(idempotencyKey);
  const action = planId ? `RECURRING_MANUAL_RUN:${planId}` : 'RECURRING_MANUAL_RUN_TENANT:*';
  const row = await env
    .DB!.prepare(
      `SELECT id, approved_by_user_id, used_at, recurring_run_result_json
       FROM authorization_tokens
     WHERE tenant_id = ? AND token_hash = ? AND action = ?
       AND recurring_idempotency_key_hash = ?
       AND julianday(expires_at) > julianday(?)
     LIMIT 1`,
    )
    .bind(tenantId, tokenHash, action, idempotencyHash, now)
    .first<ManualTokenRow>();
  if (!row) fail('RECURRING_SUPPORT_AUTH_INVALID');
  if (row.used_at) {
    const replay = parseReplay(row.recurring_run_result_json);
    if (replay) return replay;
    fail('RECURRING_SUPPORT_REPLAY_PENDING');
  }
  try {
    const auditRowHash = await sha256(`${tenantId}:${idempotencyHash}:${action}:ACCEPTED`);
    const auditHead = await readAuditChainHead(env.DB!, tenantId);
    await runD1AtomicPlan(env.DB!, (plan) => {
      plan.guardState(
        `SELECT 1 FROM authorization_tokens
         WHERE tenant_id = ? AND id = ? AND token_hash = ? AND action = ?
           AND recurring_idempotency_key_hash = ?
           AND used_at IS NULL AND julianday(expires_at) > julianday(?)`,
        [tenantId, row.id, tokenHash, action, idempotencyHash, now],
      );
      plan.add(
        env
          .DB!.prepare(
            `UPDATE authorization_tokens SET used_at = ?
           WHERE tenant_id = ? AND id = ? AND token_hash = ? AND action = ?
             AND recurring_idempotency_key_hash = ?
             AND used_at IS NULL AND julianday(expires_at) > julianday(?)`,
          )
          .bind(now, tenantId, row.id, tokenHash, action, idempotencyHash, now),
      );
      plan.add(
        env
          .DB!.prepare(
            `INSERT INTO audit_events (
             id, tenant_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, 'RECURRING_MANUAL_RUN_ACCEPTED',
                     'recurring_scheduler', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            row.approved_by_user_id,
            row.id,
            JSON.stringify({
              status: 'ACCEPTED',
              scope: planId ? 'PLAN' : 'TENANT',
              action,
              idempotencyHash,
              limit,
            }),
            auditHead,
            auditRowHash,
          ),
      );
      plan.claimAuditChain(tenantId, auditHead, [auditRowHash]);
    });
  } catch {
    fail('RECURRING_SUPPORT_AUTH_INVALID');
  }
  return {
    id: row.id,
    approvedByUserId: row.approved_by_user_id,
    action,
    idempotencyHash,
    planId,
    limit,
  };
}

async function persistManualOutcome(
  env: WorkerEnv,
  tenantId: string,
  authorization: ManualAuthorization,
  outcome: RecurringManualRpcResult | { readonly status: 'FAILED'; readonly code: string },
): Promise<void> {
  const payload = JSON.stringify({
    ...outcome,
    scope: authorization.planId ? 'PLAN' : 'TENANT',
    action: authorization.action,
    idempotencyHash: authorization.idempotencyHash,
    limit: authorization.limit,
  });
  const rowHash = await sha256(`${tenantId}:${authorization.id}:${payload}`);
  const auditHead = await readAuditChainHead(env.DB!, tenantId);
  await runD1AtomicPlan(env.DB!, (plan) => {
    plan.guardState(
      `SELECT 1 FROM authorization_tokens
       WHERE tenant_id = ? AND id = ? AND used_at IS NOT NULL`,
      [tenantId, authorization.id],
    );
    plan.add(
      env
        .DB!.prepare(
          `UPDATE authorization_tokens SET recurring_run_result_json = ?
           WHERE tenant_id = ? AND id = ? AND used_at IS NOT NULL`,
        )
        .bind(JSON.stringify(outcome), tenantId, authorization.id),
    );
    plan.add(
      env
        .DB!.prepare(
          `INSERT INTO audit_events (
             id, tenant_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'recurring_scheduler', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          authorization.approvedByUserId,
          outcome.status === 'FAILED'
            ? 'RECURRING_MANUAL_RUN_FAILED'
            : 'RECURRING_MANUAL_RUN_COMPLETE',
          authorization.id,
          payload,
          auditHead,
          rowHash,
        ),
    );
    plan.claimAuditChain(tenantId, auditHead, [rowHash]);
  });
}

export async function runRecurringManualRpc(
  env: WorkerEnv,
  input: RecurringManualRpcInput,
): Promise<RecurringManualRpcResult> {
  if (!isRecurringSalesEnabled(env)) {
    return {
      status: 'FEATURE_OFF',
      processedPeriods: 0,
      failures: 0,
      catchUpCapped: false,
    };
  }
  if (!env.DB) fail('RECURRING_DB_UNAVAILABLE');
  const tenantId = input.tenantId?.trim() ?? '';
  const now = iso(Date.now());
  const authorized = await authorizeManualRpc(env, input, now);
  if ('status' in authorized) return authorized;
  try {
    const outcome = await runRecurringScheduler(env.DB, {
      now,
      tenantId,
      ...(authorized.planId ? { planId: authorized.planId } : {}),
      pageSize: authorized.planId ? 1 : Math.min(25, authorized.limit),
      schedulerId: `support:${authorized.idempotencyHash}`,
      globalCatchUpLimit: authorized.limit,
    });
    const result: RecurringManualRpcResult = {
      status: outcome.selectionStatus,
      processedPeriods: outcome.processedPeriods.length,
      failures: outcome.failures,
      catchUpCapped: outcome.hasMore,
    };
    await persistManualOutcome(env, tenantId, authorized, result);
    console.log(
      JSON.stringify({
        event: 'recurring_manual_run_complete',
        status: result.status,
        scope: authorized.planId ? 'plan' : 'tenant',
        processedPeriods: result.processedPeriods,
        failures: result.failures,
        catchUpCapped: result.catchUpCapped,
      }),
    );
    return result;
  } catch {
    await persistManualOutcome(env, tenantId, authorized, {
      status: 'FAILED',
      code: 'RECURRING_SUPPORT_FAILED',
    }).catch(() => undefined);
    console.error(
      JSON.stringify({
        event: 'recurring_manual_run_failed',
        scope: authorized.planId ? 'plan' : 'tenant',
        code: 'RECURRING_SUPPORT_FAILED',
      }),
    );
    fail('RECURRING_SUPPORT_FAILED');
  }
}

/**
 * The automatic recurrence entrypoint. Manual execution is available only through
 * the separately exported named Worker RPC entrypoint.
 */
export async function runRecurringSalesScheduled(
  env: WorkerEnv,
  input: RecurringScheduledInput,
): Promise<RecurringScheduledResult> {
  if (!isRecurringSalesEnabled(env)) {
    return {
      status: 'FEATURE_OFF',
      processedPeriods: 0,
      failures: 0,
      catchUpCapped: false,
      tenants: 0,
    };
  }
  if (!env.DB) fail('RECURRING_DB_UNAVAILABLE');
  const now = iso(input.scheduledTime ?? Date.now());
  let tenantIds: string[];
  try {
    const capabilities = await env.DB.prepare(
      `SELECT tenant_id FROM tenant_capabilities
         WHERE capability = 'sales.recurring' AND enabled = 1
         ORDER BY tenant_id LIMIT 500`,
    ).all<{ tenant_id: string }>();
    tenantIds = (capabilities.results ?? []).map((row) => row.tenant_id);
  } catch {
    fail('RECURRING_CAPABILITY_UNAVAILABLE');
  }

  let processedPeriods = 0;
  let failures = 0;
  let catchUpCapped = false;
  for (const tenantId of tenantIds) {
    const outcome = await runRecurringScheduler(env.DB, {
      now,
      tenantId,
      pageSize: 25,
      schedulerId: `cron:${input.cron ?? ''}`,
      globalCatchUpLimit: 100,
    });
    processedPeriods += outcome.processedPeriods.length;
    failures += outcome.failures;
    catchUpCapped ||= outcome.hasMore;
  }
  console.log(
    JSON.stringify({
      event: 'recurring_scheduler_complete',
      trigger: 'scheduled',
      tenants: tenantIds.length,
      processedPeriods,
      failures,
      catchUpCapped,
    }),
  );
  return {
    status: 'COMPLETE',
    processedPeriods,
    failures,
    catchUpCapped,
    tenants: tenantIds.length,
  };
}
