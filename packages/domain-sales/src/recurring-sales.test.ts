import { describe, expect, it } from 'vitest';
import {
  computeRecurringCatchUp,
  computeRecurringPeriod,
  computeRecurringProration,
  computeRecurringRetry,
  decideRecurringCancellation,
  decideRecurringDelinquency,
  resolveRecurringOccurrenceItems,
  transitionRecurringStatus,
  versionRecurringPlan,
  type RecurringPlanVersion,
} from './recurring-sales.js';

const plan: RecurringPlanVersion = {
  timezone: 'America/Lima',
  frequency: 'MONTHLY',
  anchorDay: 31,
  anchorIsLastDay: false,
  anchorTime: '09:30:00',
  pricingPolicy: 'FIXED',
  graceDays: 3,
  afterGracePolicy: 'CONTINUE',
  items: [
    {
      productId: 'service',
      productUomId: 'uom',
      quantityMicrounits: 1_000_000,
      fixedUnitPriceCents: 1_000,
    },
  ],
};

describe('recurring calendar operations', () => {
  it('preserves an explicit last-day anchor across leap and regular months', () => {
    const lastDayPlan = { ...plan, anchorDay: 30, anchorIsLastDay: true };
    const february = computeRecurringPeriod(lastDayPlan, '2028-01-31T09:30:00-05:00');
    expect(february.periodEnd).toBe('2028-02-29T09:30:00-05:00');
    expect(computeRecurringPeriod(lastDayPlan, february.periodEnd).periodEnd).toBe(
      '2028-03-31T09:30:00-05:00',
    );
  });

  it('rolls a monthly boundary into the next civil year', () => {
    expect(
      computeRecurringPeriod({ ...plan, anchorDay: 31 }, '2026-12-31T09:30:00-05:00').periodEnd,
    ).toBe('2027-01-31T09:30:00-05:00');
  });

  it('rejects ambiguous or non-Lima timestamps without using Date parsing', () => {
    expect(() => computeRecurringPeriod(plan, '2026-08-31T09:30:00Z')).toThrow(
      'RECURRING_INVALID_LIMA_TIMESTAMP',
    );
  });

  it.each([
    '0000-08-31T09:30:00-05:00',
    '2026-00-31T09:30:00-05:00',
    '2026-13-31T09:30:00-05:00',
    '2026-02-30T09:30:00-05:00',
    '2026-08-00T09:30:00-05:00',
    '2026-08-31T24:30:00-05:00',
    '2026-08-31T09:60:00-05:00',
    '2026-08-31T09:30:60-05:00',
  ])('rejects invalid Lima civil timestamp %s', (timestamp) => {
    expect(() => computeRecurringPeriod(plan, timestamp)).toThrow(
      'RECURRING_INVALID_LIMA_TIMESTAMP',
    );
  });

  it('rejects invalid timezone and monthly anchors', () => {
    expect(() =>
      computeRecurringPeriod(
        { ...plan, timezone: 'UTC' as 'America/Lima' },
        '2026-08-31T09:30:00-05:00',
      ),
    ).toThrow('RECURRING_INVALID_TIMEZONE');
    expect(() =>
      computeRecurringPeriod({ ...plan, anchorDay: 0 }, '2026-08-31T09:30:00-05:00'),
    ).toThrow('RECURRING_INVALID_ANCHOR');
    expect(() =>
      computeRecurringPeriod({ ...plan, anchorDay: 32 }, '2026-08-31T09:30:00-05:00'),
    ).toThrow('RECURRING_INVALID_ANCHOR');
  });

  it('caps catch-up and leaves the next deterministic boundary pending', () => {
    expect(
      computeRecurringCatchUp({
        plan,
        firstPeriodStart: '2026-01-31T09:30:00-05:00',
        now: '2026-08-08T09:30:00-05:00',
        limit: 3,
      }),
    ).toEqual({
      periodStarts: [
        '2026-01-31T09:30:00-05:00',
        '2026-02-28T09:30:00-05:00',
        '2026-03-31T09:30:00-05:00',
      ],
      nextRunAt: '2026-04-30T09:30:00-05:00',
      hasMore: true,
    });
  });

  it('validates catch-up cap and reports no backlog when now precedes the first period', () => {
    expect(() =>
      computeRecurringCatchUp({
        plan,
        firstPeriodStart: '2026-08-31T09:30:00-05:00',
        now: '2026-08-01T09:30:00-05:00',
        limit: 0,
      }),
    ).toThrow('RECURRING_INVALID_CATCH_UP_LIMIT');
    expect(
      computeRecurringCatchUp({
        plan,
        firstPeriodStart: '2026-08-31T09:30:00-05:00',
        now: '2026-08-01T09:30:00-05:00',
        limit: 1,
      }),
    ).toMatchObject({ periodStarts: [], hasMore: false });
  });
});

describe('recurring lifecycle policies', () => {
  it('guards server-resolved prices, quantities, taxes, and safe integer totals', () => {
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: { ...plan, pricingPolicy: 'CURRENT' },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_PRICE_UNAVAILABLE');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: { ...plan, items: [{ ...plan.items[0]!, fixedUnitPriceCents: undefined }] },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_PRICE_UNAVAILABLE');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: { ...plan, items: [{ ...plan.items[0]!, quantityMicrounits: 0 }] },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_INVALID_QUANTITY');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: { ...plan, items: [{ ...plan.items[0]!, fixedUnitPriceCents: -1 }] },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_INVALID_PRICE');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan,
        serverCatalog: [{ productId: 'service', currentUnitPriceCents: 1_000, taxCents: -1 }],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_INVALID_TAX');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: {
          ...plan,
          items: [
            {
              ...plan.items[0]!,
              quantityMicrounits: Number.MAX_SAFE_INTEGER,
              fixedUnitPriceCents: 2,
            },
          ],
        },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_PRICE_UNSAFE_INTEGER');
    expect(() =>
      resolveRecurringOccurrenceItems({
        plan: {
          ...plan,
          items: [
            {
              ...plan.items[0]!,
              quantityMicrounits: Number.MAX_SAFE_INTEGER,
              fixedUnitPriceCents: 1,
            },
          ],
        },
        serverCatalog: [
          {
            productId: 'service',
            currentUnitPriceCents: 1,
            taxCents: Number.MAX_SAFE_INTEGER,
          },
        ],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toThrow('RECURRING_PRICE_UNSAFE_INTEGER');
    expect(
      resolveRecurringOccurrenceItems({
        plan: {
          ...plan,
          items: [{ ...plan.items[0]!, quantityMicrounits: 500_000, fixedUnitPriceCents: 1 }],
        },
        serverCatalog: [],
        periodStart: '2026-08-31T09:30:00-05:00',
      })[0]?.appliedSubtotalCents,
    ).toBe(1);
  });

  it('rejects cancellation outside the active period and handles zero unused days', () => {
    expect(() =>
      computeRecurringProration({
        lineTotalCents: 1_000,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-09-01T00:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toThrow('RECURRING_INVALID_PRORATION_PERIOD');
    expect(() =>
      computeRecurringProration({
        lineTotalCents: 1_000,
        periodStart: '2026-09-01T00:00:00-05:00',
        periodEnd: '2026-08-01T00:00:00-05:00',
        cancelledAt: '2026-08-02T00:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toThrow('RECURRING_INVALID_PRORATION_PERIOD');
    expect(() =>
      computeRecurringProration({
        lineTotalCents: 1_000,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-07-31T00:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toThrow('RECURRING_INVALID_PRORATION_PERIOD');
    expect(
      computeRecurringProration({
        lineTotalCents: 1_000,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-08-31T00:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toMatchObject({ unusedServiceDays: 0, creditAmountCents: 0, createsReturn: false });
  });

  it('computes grace deadline and preserves ordinary checkout', () => {
    expect(
      decideRecurringDelinquency({
        dueAt: '2026-08-01T00:00:00-05:00',
        now: '2026-08-03T23:59:59-05:00',
        graceDays: 3,
        afterGracePolicy: 'PAUSE_FUTURE_EXECUTION',
      }),
    ).toMatchObject({
      membershipState: 'GRACE',
      graceDeadline: '2026-08-04T00:00:00-05:00',
      executeFutureOccurrences: true,
      ordinaryCheckoutAllowed: true,
    });
  });

  it('distinguishes current, continuing-after-grace, and paused delinquency', () => {
    expect(
      decideRecurringDelinquency({
        dueAt: '2026-08-10T00:00:00-05:00',
        now: '2026-08-09T23:59:59-05:00',
        graceDays: 3,
        afterGracePolicy: 'CONTINUE',
      }).membershipState,
    ).toBe('ACTIVE');
    expect(
      decideRecurringDelinquency({
        dueAt: '2026-08-01T00:00:00-05:00',
        now: '2026-08-10T00:00:00-05:00',
        graceDays: 3,
        afterGracePolicy: 'CONTINUE',
      }),
    ).toMatchObject({ membershipState: 'GRACE', executeFutureOccurrences: true });
    expect(() =>
      decideRecurringDelinquency({
        dueAt: '2026-08-01T00:00:00-05:00',
        now: '2026-08-02T00:00:00-05:00',
        graceDays: -1,
        afterGracePolicy: 'CONTINUE',
      }),
    ).toThrow('RECURRING_INVALID_GRACE_DAYS');
  });

  it('uses deterministic bounded integer retry backoff', () => {
    expect(
      computeRecurringRetry({
        failedAt: '2026-08-08T09:00:00-05:00',
        retryCount: 20,
        baseDelaySeconds: 30,
        maxDelaySeconds: 300,
      }),
    ).toEqual({
      retryCount: 21,
      delaySeconds: 300,
      nextRetryAt: '2026-08-08T09:05:00-05:00',
    });
  });

  it('uses unbounded-by-cap exponential retry while safe and validates inputs', () => {
    expect(
      computeRecurringRetry({
        failedAt: '2026-12-31T23:59:59-05:00',
        retryCount: 1,
        baseDelaySeconds: 1,
        maxDelaySeconds: 300,
      }),
    ).toMatchObject({ delaySeconds: 2, nextRetryAt: '2027-01-01T00:00:01-05:00' });
    expect(() =>
      computeRecurringRetry({
        failedAt: '2026-08-08T09:00:00-05:00',
        retryCount: -1,
        baseDelaySeconds: 1,
        maxDelaySeconds: 300,
      }),
    ).toThrow('RECURRING_INVALID_RETRY_COUNT');
    expect(
      computeRecurringRetry({
        failedAt: '2026-08-08T09:00:00-05:00',
        retryCount: 30,
        baseDelaySeconds: Number.MAX_SAFE_INTEGER,
        maxDelaySeconds: 300,
      }).delaySeconds,
    ).toBe(300);
  });

  it('enforces status transitions and cancellation modes', () => {
    expect(transitionRecurringStatus('ACTIVE', 'GRACE')).toBe('GRACE');
    expect(() => transitionRecurringStatus('CANCELLED', 'ACTIVE')).toThrow(
      'RECURRING_INVALID_STATUS_TRANSITION',
    );
    expect(decideRecurringCancellation('ACTIVE', 'AT_PERIOD_END')).toEqual({
      status: 'CANCEL_AT_PERIOD_END',
      executeFutureOccurrences: false,
      createProration: false,
    });
    expect(decideRecurringCancellation('GRACE', 'IMMEDIATE')).toEqual({
      status: 'CANCELLED',
      executeFutureOccurrences: false,
      createProration: true,
    });
    expect(transitionRecurringStatus('PAUSED', 'PAUSED')).toBe('PAUSED');
  });

  it('versions changed items from the next period without mutating history', () => {
    const next = versionRecurringPlan({
      current: { ...plan, id: 'plan-v1', planKey: 'membership', planVersion: 1 },
      nextId: 'plan-v2',
      effectiveFrom: '2026-09-30T09:30:00-05:00',
      items: [{ ...plan.items[0]!, fixedUnitPriceCents: 2_000 }],
    });
    expect(next).toMatchObject({
      id: 'plan-v2',
      planKey: 'membership',
      planVersion: 2,
      supersedesPlanId: 'plan-v1',
      effectiveFrom: '2026-09-30T09:30:00-05:00',
    });
    expect(plan.items[0]?.fixedUnitPriceCents).toBe(1_000);
    expect(next.items[0]?.fixedUnitPriceCents).toBe(2_000);
  });

  it('rejects an unsafe or empty plan version', () => {
    const current = { ...plan, id: 'plan-v1', planKey: 'membership', planVersion: 1 };
    expect(() =>
      versionRecurringPlan({
        current,
        nextId: 'plan-v1',
        effectiveFrom: '2026-09-30T09:30:00-05:00',
        items: plan.items,
      }),
    ).toThrow('RECURRING_INVALID_PLAN_VERSION');
    expect(() =>
      versionRecurringPlan({
        current,
        nextId: 'plan-v2',
        effectiveFrom: '2026-09-30T09:30:00-05:00',
        items: [],
      }),
    ).toThrow('RECURRING_INVALID_PLAN_VERSION');
  });

  it('computes annual recurring period and status transition to TERMINATED', () => {
    const annualPlan = { ...plan, frequency: 'ANNUALLY' as const };
    const period = computeRecurringPeriod(annualPlan, '2024-02-29T09:30:00-05:00');
    expect(period.periodEnd).toBe('2025-02-28T09:30:00-05:00');

    expect(transitionRecurringStatus('ACTIVE', 'TERMINATED')).toBe('TERMINATED');
    expect(transitionRecurringStatus('GRACE', 'TERMINATED')).toBe('TERMINATED');
    expect(transitionRecurringStatus('CANCEL_AT_PERIOD_END', 'TERMINATED')).toBe('TERMINATED');
    expect(transitionRecurringStatus('TERMINATED', 'TERMINATED')).toBe('TERMINATED');
    expect(() => transitionRecurringStatus('TERMINATED', 'ACTIVE')).toThrow(
      'RECURRING_INVALID_STATUS_TRANSITION',
    );
  });

  it('handles leap year century boundaries and multi-month civil day additions', () => {
    const p1 = computeRecurringPeriod(
      { ...plan, frequency: 'ANNUALLY' as const },
      '2000-02-29T09:30:00-05:00',
    );
    expect(p1.periodEnd).toBe('2001-02-28T09:30:00-05:00');
    const p2 = computeRecurringPeriod(
      { ...plan, frequency: 'ANNUALLY' as const },
      '1900-02-28T09:30:00-05:00',
    );
    expect(p2.periodEnd).toBe('1901-02-28T09:30:00-05:00');
  });
});
