import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  cancelRecurringPlanAtomic,
  claimDueRecurringPlanAtomic,
  processRecurringSaleAtomic,
} from './process-recurring-sale-atomic.js';
import { seedRecurringSalesFixture } from './recurring-sales-test-fixture.js';

describe('Sprint 44 recurring-sales workerd concurrency (RED)', () => {
  it('lets concurrent schedulers settle exactly one sale, CPE/NV, AR, usage, and occurrence', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-race',
      pricingPolicy: 'FIXED',
      periodStart: '2026-08-01T00:00:00-05:00',
    });
    const claims = await Promise.allSettled([
      claimDueRecurringPlanAtomic(env.DB, fixture.claimInput('cron-a')),
      claimDueRecurringPlanAtomic(env.DB, fixture.claimInput('cron-b')),
    ]);
    const winner = claims.find(
      (claim): claim is PromiseFulfilledResult<{ leaseToken: string }> =>
        claim.status === 'fulfilled',
    );
    expect(winner).toBeDefined();
    await Promise.allSettled([
      processRecurringSaleAtomic(env.DB, fixture.settlementInput(winner?.value.leaseToken ?? '')),
      processRecurringSaleAtomic(env.DB, fixture.settlementInput('stale-or-losing-lease')),
    ]);
    expect(await fixture.countOccurrences()).toBe(1);
    expect(await fixture.countSales()).toBe(1);
    expect(await fixture.countAccountsReceivable()).toBe(1);
    expect(await fixture.countFiscalDocuments()).toBe(1);
    expect(await fixture.countUsageEvents()).toBe(1);
  });

  it('rolls back every injected statement failure without advancing the period', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-crash',
      periodStart: '2026-08-01T00:00:00-05:00',
    });
    for (const statementIndex of fixture.atomicStatementIndexes) {
      await fixture.reset();
      await expect(fixture.runWithFailureAt(statementIndex)).rejects.toBeDefined();
      expect(await fixture.countOccurrences()).toBe(0);
      expect(await fixture.countSales()).toBe(0);
      expect(await fixture.countAccountsReceivable()).toBe(0);
      expect(await fixture.countFiscalDocuments()).toBe(0);
      expect(await fixture.countUsageEvents()).toBe(0);
      expect(await fixture.stockDeltaMicrounits()).toBe(0);
      expect(await fixture.readNextRunAt()).toBe('2026-08-01T00:00:00-05:00');
    }
  });

  it('processes bounded catch-up in order without skipped periods', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-catch-up',
      periodStart: '2026-01-31T09:30:00-05:00',
      now: '2026-08-08T09:30:00-05:00',
      catchUpLimit: 3,
    });
    const result = await fixture.runScheduler();
    expect(result.processedPeriods).toEqual([
      '2026-01-31T09:30:00-05:00',
      '2026-02-28T09:30:00-05:00',
      '2026-03-31T09:30:00-05:00',
    ]);
    expect(result.hasMore).toBe(true);
    expect(await fixture.readNextRunAt()).toBe('2026-04-30T09:30:00-05:00');
  });

  it('snapshots FIXED/CURRENT prices and skips stock only for service products', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-pricing',
      withPhysicalAndServiceItems: true,
      pricingPolicy: 'CURRENT',
    });
    await fixture.changeCatalogPrice('physical-a', 2_500);
    await fixture.runScheduler();
    expect(await fixture.readAppliedPrice('physical-a')).toBe(2_500);
    expect(await fixture.readPhysicalStockDelta()).toBeLessThan(0);
    expect(await fixture.readServiceStockMovements()).toBe(0);
  });

  it('serializes immediate cancel versus run and creates one normal return document', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-cancel-race',
      withSettledCurrentPeriod: true,
    });
    await Promise.allSettled([
      fixture.runScheduler(),
      cancelRecurringPlanAtomic(env.DB, fixture.immediateCancelInput('cancel-a')),
    ]);
    expect(await fixture.countProrationAdjustments()).toBe(1);
    expect(await fixture.countReturnDocuments()).toBe(1);
    expect(await fixture.originalSaleWasMutated()).toBe(false);
    expect(await fixture.auditChainIsLinear()).toBe(true);
  });

  it('keeps the scheduler outside ordinary checkout and below the local 50ms budget', async () => {
    const fixture = await seedRecurringSalesFixture(env.DB, {
      tenantId: 'tenant-recurring-checkout-benchmark',
    });
    const checkoutQuery = async (): Promise<number> => {
      const started = performance.now();
      const checkout = await env.DB.prepare(
        `SELECT COUNT(*) AS value FROM cash_register_sessions
         WHERE tenant_id = ? AND status = 'OPEN'`,
      )
        .bind(fixture.tenantId)
        .first<{ value: number }>();
      expect(checkout?.value).toBe(1);
      return performance.now() - started;
    };
    // Control baseline: checkout SIN scheduler (referencia relativa a la máquina).
    const baselineDurations: number[] = [];
    for (let cycle = 0; cycle < 20; cycle += 1) {
      baselineDurations.push(await checkoutQuery());
    }
    // Con scheduler concurrente: mide la degradación real, no la velocidad absoluta.
    const checkoutDurations: number[] = [];
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const scheduler = fixture.runScheduler();
      checkoutDurations.push(await checkoutQuery());
      await scheduler;
    }
    const ordered = checkoutDurations.toSorted((left, right) => left - right);
    const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1]!;
    const baselineOrdered = baselineDurations.toSorted((left, right) => left - right);
    const baselineP95 = baselineOrdered[Math.ceil(baselineOrdered.length * 0.95) - 1]!;
    // Umbral doble anti-flake: absoluto (50ms, presupuesto del hot path) y
    // relativo (≤10× baseline + 5ms) — el scheduler jamás degrada el checkout.
    expect(p95).toBeLessThan(50);
    expect(p95).toBeLessThanOrEqual(baselineP95 * 10 + 5);
  }, 30_000);
});
