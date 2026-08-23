/* eslint-disable @typescript-eslint/no-explicit-any -- focused Worker RPC/D1 boundary fake */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class {
    protected env: unknown;

    constructor(_ctx: unknown, env: unknown) {
      this.env = env;
    }
  },
  DurableObject: class {
    protected ctx: unknown;
    protected env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
  WorkflowEntrypoint: class {
    protected ctx: unknown;
    protected env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { runRecurringScheduler } = vi.hoisted(() => ({
  runRecurringScheduler: vi.fn(),
}));
vi.mock('@kipuspay/adapters-d1/process-recurring-sale-atomic', () => ({
  runRecurringScheduler,
}));
vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  runD1AtomicPlan: vi.fn(async (_db: unknown, build: (plan: any) => Promise<void>) => {
    const statements: any[] = [];
    await build({
      guardState: vi.fn(),
      claimAuditChain: vi.fn(),
      add(statement: any) {
        statements.push(statement);
      },
    });
    for (const statement of statements) await statement.run();
  }),
}));

import type { WorkerEnv } from '../auth/control-plane.js';
import { runRecurringManualRpc } from './recurring-sales-scheduled.js';
import { RecurringManualControl } from '../worker.js';

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

interface FakeState {
  used: boolean;
  resultJson: string | null;
  audits: string[];
  tokenRuns: number;
}

async function rpcEnv(input: {
  readonly action: string;
  readonly idempotencyKey?: string;
  readonly feature?: string;
  readonly manualEnabled?: string;
}): Promise<{ env: WorkerEnv; state: FakeState }> {
  const state: FakeState = { used: false, resultJson: null, audits: [], tokenRuns: 0 };
  const expectedIdempotencyHash = await sha256(input.idempotencyKey ?? 'request-a');
  const tokenHash = await sha256('raw-secret-token');
  const db = {
    prepare: vi.fn((sql: string) => {
      let params: unknown[] = [];
      const statement = {
        bind: vi.fn((...values: unknown[]) => {
          params = values;
          return statement;
        }),
        first: vi.fn(async () => {
          if (sql.includes('tenant_capabilities')) return { enabled: 1 };
          if (sql.includes('FROM authorization_tokens')) {
            const serialized = JSON.stringify(params);
            if (
              !serialized.includes(tokenHash) ||
              !serialized.includes(input.action) ||
              !serialized.includes(expectedIdempotencyHash)
            ) {
              return null;
            }
            return {
              id: 'authorization-a',
              approved_by_user_id: 'support-user',
              used_at: state.used ? '2026-08-08T10:00:00.000Z' : null,
              recurring_run_result_json: state.resultJson,
            };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [], success: true, meta: {} })),
        run: vi.fn(async () => {
          if (sql.includes('UPDATE authorization_tokens SET used_at')) {
            state.used = true;
            state.tokenRuns += 1;
          }
          if (sql.includes('recurring_run_result_json = ?')) {
            state.resultJson = String(params[0]);
          }
          if (sql.includes('INSERT INTO audit_events')) {
            state.audits.push(JSON.stringify(params));
          }
          return { results: [], success: true, meta: {} };
        }),
      };
      return statement;
    }),
    batch: vi.fn(),
  };
  return {
    env: {
      FEATURE_SALES_RECURRING: input.feature ?? '1',
      RECURRING_MANUAL_RUN_ENABLED: input.manualEnabled ?? '1',
      DB: db,
    } as unknown as WorkerEnv,
    state,
  };
}

const planRequest = {
  authorizationToken: 'raw-secret-token',
  idempotencyKey: 'request-a',
  tenantId: 'tenant-a',
  planId: 'plan-a',
} as const;
const wildcardRequest = {
  authorizationToken: planRequest.authorizationToken,
  idempotencyKey: planRequest.idempotencyKey,
  tenantId: planRequest.tenantId,
} as const;

describe('Sprint 44 private recurring manual RPC', () => {
  beforeEach(() => {
    runRecurringScheduler.mockReset();
    runRecurringScheduler.mockResolvedValue({
      processedPeriods: ['2026-08-01T00:00:00-05:00'],
      selectionStatus: 'COMPLETE',
      hasMore: false,
      failures: 0,
    });
  });

  it('is exposed by a named WorkerEntrypoint and not an HTTP handler', async () => {
    const { env } = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    const rpc = new RecurringManualControl({} as ExecutionContext, env);
    await expect(rpc.run(planRequest)).resolves.toMatchObject({ status: 'COMPLETE' });
  });

  it('does not consume a token while the feature is off', async () => {
    const { env, state } = await rpcEnv({
      action: 'RECURRING_MANUAL_RUN:plan-a',
      feature: '0',
    });
    await expect(runRecurringManualRpc(env, planRequest)).resolves.toMatchObject({
      status: 'FEATURE_OFF',
    });
    expect(state.used).toBe(false);
    expect(runRecurringScheduler).not.toHaveBeenCalled();
  });

  it('passes the exact plan filter and never falls through on missing or not-due plans', async () => {
    const { env } = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    runRecurringScheduler.mockResolvedValueOnce({
      processedPeriods: [],
      selectionStatus: 'NOT_FOUND',
      hasMore: false,
      failures: 0,
    });
    await expect(runRecurringManualRpc(env, planRequest)).resolves.toMatchObject({
      status: 'NOT_FOUND',
      processedPeriods: 0,
    });
    expect(runRecurringScheduler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-a', planId: 'plan-a' }),
    );

    const second = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-b' });
    runRecurringScheduler.mockResolvedValueOnce({
      processedPeriods: [],
      selectionStatus: 'NOT_DUE',
      hasMore: false,
      failures: 0,
    });
    await expect(
      runRecurringManualRpc(second.env, { ...planRequest, planId: 'plan-b' }),
    ).resolves.toMatchObject({ status: 'NOT_DUE', processedPeriods: 0 });
  });

  it('separates wildcard and plan actions and requires an explicit bounded wildcard limit', async () => {
    const plan = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    await expect(
      runRecurringManualRpc(plan.env, { ...wildcardRequest, limit: 10 }),
    ).rejects.toMatchObject({ code: 'RECURRING_SUPPORT_AUTH_INVALID' });

    const wildcard = await rpcEnv({ action: 'RECURRING_MANUAL_RUN_TENANT:*' });
    await expect(runRecurringManualRpc(wildcard.env, planRequest)).rejects.toMatchObject({
      code: 'RECURRING_SUPPORT_AUTH_INVALID',
    });
    await expect(runRecurringManualRpc(wildcard.env, wildcardRequest)).rejects.toMatchObject({
      code: 'RECURRING_SUPPORT_LIMIT_REQUIRED',
    });
    await expect(
      runRecurringManualRpc(wildcard.env, { ...wildcardRequest, limit: 101 }),
    ).rejects.toMatchObject({ code: 'RECURRING_SUPPORT_LIMIT_INVALID' });
  });

  it('binds idempotency to the token and replays the saved one-shot result', async () => {
    const { env, state } = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    const first = await runRecurringManualRpc(env, planRequest);
    const replay = await runRecurringManualRpc(env, planRequest);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(state.tokenRuns).toBe(1);
    expect(runRecurringScheduler).toHaveBeenCalledTimes(1);

    const wrong = await rpcEnv({
      action: 'RECURRING_MANUAL_RUN:plan-a',
      idempotencyKey: 'another-request',
    });
    await expect(runRecurringManualRpc(wrong.env, planRequest)).rejects.toMatchObject({
      code: 'RECURRING_SUPPORT_AUTH_INVALID',
    });
  });

  it('audits successful and failed requests without logging the raw token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const success = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    await runRecurringManualRpc(success.env, planRequest);
    expect(success.state.audits.join(' ')).toContain('COMPLETE');
    expect(success.state.audits.join(' ')).not.toContain(planRequest.authorizationToken);

    const failed = await rpcEnv({ action: 'RECURRING_MANUAL_RUN:plan-a' });
    runRecurringScheduler.mockRejectedValueOnce(new Error('database details'));
    await expect(runRecurringManualRpc(failed.env, planRequest)).rejects.toMatchObject({
      code: 'RECURRING_SUPPORT_FAILED',
    });
    expect(failed.state.audits.join(' ')).toContain('FAILED');
    expect(failed.state.audits.join(' ')).not.toContain('database details');
    expect(failed.state.audits.join(' ')).not.toContain(planRequest.authorizationToken);
    expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain(
      planRequest.authorizationToken,
    );
    log.mockRestore();
    error.mockRestore();
  });
});
