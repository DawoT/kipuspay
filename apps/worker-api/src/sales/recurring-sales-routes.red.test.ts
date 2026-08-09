/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- production routes and scheduled handler are intentionally absent in RED */
import { describe, expect, it, vi } from 'vitest';
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
        const statement = {
          bind: vi.fn(() => statement),
          first: vi.fn(async () => (sql.includes('tenant_capabilities') ? { enabled: 1 } : null)),
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
    await expect(runListRecurringOccurrencesHttp(env(), owner, { planId: 'plan-a' })).resolves.toMatchObject({
      status: 200,
    });
    await expect(runPreviewRecurringPlanHttp(env(), owner, { planId: 'plan-a' })).resolves.toMatchObject({
      status: 200,
    });
    await expect(runPauseRecurringPlanHttp(env(), owner, { planId: 'plan-a' })).resolves.toMatchObject({
      status: 200,
    });
    await expect(
      runCancelRecurringPlanHttp(env(), { ...owner, tenantId: 'tenant-b' }, {
        planId: 'plan-owned-by-a',
        mode: 'IMMEDIATE',
      }),
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

  it('requires one-shot support authorization for manual execution', async () => {
    await expect(
      runRecurringSalesScheduled(env(), {
        manual: true,
        authorizationToken: '',
        idempotencyKey: 'support-run-a',
      }),
    ).rejects.toMatchObject({ code: 'RECURRING_SUPPORT_AUTH_REQUIRED' });
  });
});
