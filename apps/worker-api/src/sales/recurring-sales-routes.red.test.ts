import { describe, expect, it, vi } from 'vitest';
vi.mock('@kipuspay/adapters-d1/process-recurring-sale-atomic', () => ({
  createRecurringPlanAtomic: vi.fn(async (_db, input) => ({
    planId: 'plan-a',
    planVersion: 1,
    alreadyApplied: false,
    tenantId: input.tenantId,
  })),
  versionRecurringPlanAtomic: vi.fn(async (_db, input) => ({
    planId: 'plan-v2',
    planVersion: 2,
    expectedVersion: input.expectedVersion,
  })),
  transitionRecurringPlanAtomic: vi.fn(async (_db, input) => ({ status: input.target })),
  cancelRecurringPlanAtomic: vi.fn(async (_db, input) => ({
    status: input.mode === 'IMMEDIATE' ? 'CANCELLED' : 'CANCEL_AT_PERIOD_END',
    adjustmentSaleId: null,
    creditAmountCents: 0,
    alreadyApplied: false,
  })),
  runRecurringScheduler: vi.fn(async () => ({
    processedPeriods: [],
    hasMore: false,
    failures: 0,
  })),
}));
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isRecurringSalesEnabled,
  runCancelRecurringPlanHttp,
  runCreateRecurringPlanHttp,
  runListRecurringOccurrencesHttp,
  runPauseRecurringPlanHttp,
  runPreviewRecurringPlanHttp,
} from './recurring-sales-routes.js';
import { runRecurringSalesScheduled } from './recurring-sales-scheduled.js';

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_SALES_RECURRING: '1',
    DB: {
      prepare: vi.fn((sql: string) => {
        let bound: unknown[] = [];
        const statement = {
          bind: vi.fn((...params: unknown[]) => {
            bound = params;
            return statement;
          }),
          first: vi.fn(async () => {
            if (sql.includes('tenant_capabilities')) return { enabled: 1 };
            if (sql.includes('FROM branches')) return { allowed: 1 };
            if (sql.includes('FROM recurring_plans')) {
              if (bound[0] === 'tenant-b' && bound[1] === 'plan-owned-by-a') return null;
              return {
                id: bound[1] ?? 'plan-a',
                branch_id: 'branch-a',
                version: 1,
                frequency: 'MONTHLY',
                pricing_policy: 'FIXED',
                anchor_day: 1,
                anchor_is_last_day: 0,
                anchor_time: '09:00:00',
                grace_days: 3,
                after_grace_policy: 'CONTINUE',
                next_run_at: '2026-08-31T09:00:00-05:00',
              };
            }
            return null;
          }),
          all: vi.fn(async () => ({ results: [] })),
        };
        return statement;
      }),
      batch: vi.fn(),
    },
    ...overrides,
  } as unknown as WorkerEnv;
}

const owner = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: 'owner',
  permissions: ['sales.recurring.manage'],
};

describe('Sprint 44 Worker recurring-sales routes (RED)', () => {
  it('is default-off and requires both deploy flag and tenant capability', async () => {
    expect(isRecurringSalesEnabled({} as WorkerEnv)).toBe(false);
    await expect(
      runCreateRecurringPlanHttp(
        env({ FEATURE_SALES_RECURRING: '0' } as Partial<WorkerEnv>),
        owner,
        {},
      ),
    ).resolves.toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it.each([
    ['cashier', 403],
    ['supervisor', 403],
    ['admin', 201],
    ['owner', 201],
  ] as const)('enforces plan-management RBAC for %s', async (role, status) => {
    const response = await runCreateRecurringPlanHttp(
      env(),
      {
        ...owner,
        role,
        permissions: ['admin', 'owner'].includes(role) ? ['sales.recurring.manage'] : [],
      },
      {
        customerId: 'customer-a',
        branchId: 'branch-a',
        pricingPolicy: 'FIXED',
        frequency: 'MONTHLY',
        items: [{ productId: 'service-a', quantityMicrounits: 1_000_000 }],
      },
    );
    expect(response.status).toBe(status);
  });

  it('derives tenant and all money server-side and ignores forged monetary fields', async () => {
    const response = await runCreateRecurringPlanHttp(env(), owner, {
      tenantId: 'tenant-b',
      customerId: 'customer-a',
      branchId: 'branch-a',
      pricingPolicy: 'CURRENT',
      frequency: 'MONTHLY',
      totalAmountCents: 1,
      unitPriceCents: 1,
      items: [
        {
          productId: 'service-a',
          quantityMicrounits: 1_000_000,
          unitPriceCents: 1,
        },
      ],
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ tenantId: 'tenant-a', pricingPolicy: 'CURRENT' });
    expect(response.body).not.toMatchObject({ totalAmountCents: 1 });
  });

  it('keeps list/preview/pause/cancel tenant-scoped with opaque cross-tenant errors', async () => {
    await expect(
      runListRecurringOccurrencesHttp(env(), owner, { planId: 'plan-a' }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      runPreviewRecurringPlanHttp(env(), owner, { planId: 'plan-a' }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      runPauseRecurringPlanHttp(env(), owner, { planId: 'plan-a', expectedVersion: 1 }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      runCancelRecurringPlanHttp(
        env(),
        { ...owner, tenantId: 'tenant-b' },
        {
          planId: 'plan-owned-by-a',
          mode: 'IMMEDIATE',
        },
      ),
    ).resolves.toMatchObject({ status: 404, body: { code: 'RECURRING_PLAN_NOT_FOUND' } });
  });
});

describe('Sprint 44 Worker scheduled contract (RED)', () => {
  it('runs only from scheduled events and has no public execution endpoint', async () => {
    const result = await runRecurringSalesScheduled(env(), {
      scheduledTime: Date.parse('2026-08-08T14:00:00.000Z'),
      cron: '*/5 * * * *',
    });
    expect(result).toMatchObject({
      status: 'COMPLETE',
      catchUpCapped: expect.any(Boolean),
    });
    expect(result).not.toHaveProperty('route');
    expect(result).not.toHaveProperty('url');
  });
});

describe('S44-H3/H4: validación server-side de ancla y cancelación', () => {
  it('anchorDay inválido (0/32) → RECURRING_ANCHOR_DAY_INVALID (no 409 del DDL)', async () => {
    const base = {
      customerId: 'c1',
      branchId: 'b1',
      frequency: 'MONTHLY',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
      pricingPolicy: 'FIXED',
    };
    await expect(
      runCreateRecurringPlanHttp(env(), owner, {
        ...base,
        anchorDay: 0,
      }),
    ).resolves.toMatchObject({ status: 422, body: { code: 'RECURRING_ANCHOR_DAY_INVALID' } });
    await expect(
      runCreateRecurringPlanHttp(env(), owner, {
        ...base,
        anchorDay: 32,
      }),
    ).resolves.toMatchObject({ status: 422, body: { code: 'RECURRING_ANCHOR_DAY_INVALID' } });
  });

  it('anchorTime inválido (24:00:00) → RECURRING_ANCHOR_TIME_INVALID', async () => {
    await expect(
      runCreateRecurringPlanHttp(env(), owner, {
        customerId: 'c1',
        branchId: 'b1',
        frequency: 'MONTHLY',
        anchorTime: '24:00:00',
        items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
        pricingPolicy: 'FIXED',
      }),
    ).resolves.toMatchObject({ status: 422, body: { code: 'RECURRING_ANCHOR_TIME_INVALID' } });
  });
});
