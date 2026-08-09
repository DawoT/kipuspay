import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  claimDueRecurringPlanAtomic,
  evaluateRecurringGraceAtomic,
  processRecurringSaleAtomic,
  runRecurringScheduler,
} from './process-recurring-sale-atomic.js';
import { seedRecurringSalesFixture } from './recurring-sales-test-fixture.js';

describe('Sprint 44 scheduler adversarial settlement', () => {
  it('rejects lease theft, permits expiry takeover, and rejects the stale token', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-lease-takeover',
    });
    const first = await claimDueRecurringPlanAtomic(env.DB, {
      ...fixture.claimInput('cron-a'),
      requestedLeaseSeconds: 60,
    });
    await expect(
      claimDueRecurringPlanAtomic(env.DB, {
        ...fixture.claimInput('cron-b'),
        expectedVersion: 2,
      }),
    ).rejects.toThrow('RECURRING_LEASE_CONFLICT');
    const takeoverNow = '2026-08-08T09:31:01-05:00';
    const takeover = await claimDueRecurringPlanAtomic(env.DB, {
      ...fixture.claimInput('cron-b'),
      expectedVersion: 2,
      now: takeoverNow,
    });
    await expect(
      processRecurringSaleAtomic(env.DB, {
        ...fixture.settlementInput(first.leaseToken),
        now: takeoverNow,
      }),
    ).rejects.toThrow('RECURRING_INTERNAL_RETRY');
    await expect(
      processRecurringSaleAtomic(env.DB, {
        ...fixture.settlementInput(takeover.leaseToken),
        now: takeoverNow,
      }),
    ).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(await fixture.countOccurrences()).toBe(1);
  });

  it('records bounded retry without advancing or partially settling stock failure', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-stock-retry',
      withPhysicalAndServiceItems: true,
    });
    await env.DB.prepare(
      `UPDATE branch_product_stock SET stock = 0, stock_microunits = 0
       WHERE tenant_id = ? AND product_id = 'physical-a'`,
    )
      .bind(fixture.tenantId)
      .run();
    const result = await fixture.runScheduler();
    expect(result.failures).toBe(1);
    expect(await fixture.countOccurrences()).toBe(0);
    expect(await fixture.countSales()).toBe(0);
    expect(await fixture.countAccountsReceivable()).toBe(0);
    expect(await fixture.countFiscalDocuments()).toBe(0);
    expect(await fixture.countUsageEvents()).toBe(0);
    expect(await fixture.readNextRunAt()).toBe(fixture.periodStart);
    const operational = await env.DB.prepare(
      `SELECT retry_count, next_retry_at, last_error_code
       FROM recurring_plans WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.planId)
      .first<{ retry_count: number; next_retry_at: string; last_error_code: string }>();
    expect(operational).toMatchObject({
      retry_count: 1,
      last_error_code: 'RECURRING_INSUFFICIENT_STOCK',
    });
    expect(operational?.next_retry_at).toBeTruthy();
  });

  it('emits NV with one AR and usage but no fiscal outbox', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-nv',
      documentType: 'NV',
    });
    await fixture.runScheduler();
    expect(await fixture.countSales()).toBe(1);
    expect(await fixture.countAccountsReceivable()).toBe(1);
    expect(await fixture.countFiscalDocuments()).toBe(0);
    expect(await fixture.countUsageEvents()).toBe(1);
  });

  it('fails factura receiver validation atomically and isolates tenant scope', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-invalid-ruc',
      documentType: '01',
      customerDocumentType: '1',
      customerDocumentNumber: '44000001',
    });
    const result = await fixture.runScheduler();
    expect(result.failures).toBe(1);
    expect(await fixture.countOccurrences()).toBe(0);
    await expect(
      processRecurringSaleAtomic(env.DB, {
        tenantId: 'another-tenant',
        planId: fixture.planId,
        periodStart: fixture.periodStart,
        leaseToken: 'cross-tenant',
        now: fixture.now,
      }),
    ).rejects.toThrow('RECURRING_PLAN_NOT_FOUND');
  });

  it('derives post-grace pause from overdue AR without touching checkout state', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-grace-pause',
      afterGracePolicy: 'PAUSE_FUTURE_EXECUTION',
    });
    await fixture.runScheduler();
    await env.DB.prepare(
      `UPDATE accounts_receivable
       SET due_date = '2026-08-01T00:00:00-05:00', status = 'OVERDUE'
       WHERE tenant_id = ?`,
    )
      .bind(fixture.tenantId)
      .run();
    await expect(
      evaluateRecurringGraceAtomic(env.DB, {
        tenantId: fixture.tenantId,
        planId: fixture.planId,
        now: '2026-08-10T00:00:00-05:00',
      }),
    ).resolves.toEqual({ status: 'PAUSED' });
    const checkoutRows = await env.DB.prepare(
      `SELECT COUNT(*) AS value FROM cash_register_sessions
       WHERE tenant_id = ? AND status = 'OPEN'`,
    )
      .bind(fixture.tenantId)
      .first<{ value: number }>();
    expect(checkoutRows?.value).toBe(1);
  });

  it('does not fall through from an exact missing plan to another due plan', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-exact-plan-missing',
    });
    const result = await runRecurringScheduler(env.DB, {
      now: fixture.now,
      tenantId: fixture.tenantId,
      planId: 'another-plan',
      schedulerId: 'manual:missing',
      globalCatchUpLimit: 1,
    });
    expect(result).toMatchObject({ selectionStatus: 'NOT_FOUND', processedPeriods: [] });
    expect(await fixture.countOccurrences()).toBe(0);
  });

  it('returns NOT_DUE for an exact inactive plan without executing other work', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'recurring-exact-plan-not-due',
    });
    await env.DB.prepare(
      `UPDATE recurring_plans SET status = 'PAUSED'
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.planId)
      .run();
    const result = await runRecurringScheduler(env.DB, {
      now: fixture.now,
      tenantId: fixture.tenantId,
      planId: fixture.planId,
      schedulerId: 'manual:not-due',
      globalCatchUpLimit: 1,
    });
    expect(result).toMatchObject({ selectionStatus: 'NOT_DUE', processedPeriods: [] });
    expect(await fixture.countOccurrences()).toBe(0);
  });
});
