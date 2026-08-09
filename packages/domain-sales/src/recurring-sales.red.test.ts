/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- production contract module is intentionally absent in RED */
import { describe, expect, it } from 'vitest';
import {
  computeRecurringPeriod,
  computeRecurringProration,
  decideRecurringDelinquency,
  resolveRecurringOccurrenceItems,
  type RecurringPlanVersion,
} from './recurring-sales.js';

const fixedPlan: RecurringPlanVersion = {
  timezone: 'America/Lima',
  frequency: 'MONTHLY',
  anchorDay: 31,
  anchorIsLastDay: false,
  anchorTime: '09:30:00',
  pricingPolicy: 'FIXED',
  graceDays: 3,
  afterGracePolicy: 'PAUSE_FUTURE_EXECUTION',
  items: [
    {
      productId: 'service-a',
      productUomId: 'uom-a',
      quantityMicrounits: 1_000_000,
      fixedUnitPriceCents: 10_000,
    },
  ],
};

describe('Sprint 44 recurring-sales temporal and pricing contract (RED)', () => {
  it('keeps half-open Lima periods and a safe monthly day-31 anchor', () => {
    const february = computeRecurringPeriod(fixedPlan, '2028-01-31T09:30:00-05:00');
    expect(february).toEqual({
      periodStart: '2028-01-31T09:30:00-05:00',
      periodEnd: '2028-02-29T09:30:00-05:00',
      nextRunAt: '2028-02-29T09:30:00-05:00',
    });
    const march = computeRecurringPeriod(fixedPlan, february.periodEnd);
    expect(march.periodEnd).toBe('2028-03-31T09:30:00-05:00');
    expect(february.periodEnd).toBe(march.periodStart);
  });

  it.each([
    ['DAILY', '2026-08-09T09:30:00-05:00'],
    ['WEEKLY', '2026-08-15T09:30:00-05:00'],
  ] as const)('derives deterministic %s next-run from the prior boundary', (frequency, expected) => {
    expect(
      computeRecurringPeriod(
        { ...fixedPlan, frequency },
        '2026-08-08T09:30:00-05:00',
      ).periodEnd,
    ).toBe(expected);
  });

  it('defaults to FIXED and preserves its server snapshot across catalog drift', () => {
    expect(
      resolveRecurringOccurrenceItems({
        plan: { ...fixedPlan, pricingPolicy: undefined },
        serverCatalog: [{ productId: 'service-a', currentUnitPriceCents: 15_000 }],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toEqual([
      expect.objectContaining({
        productId: 'service-a',
        appliedUnitPriceCents: 10_000,
        priceSource: 'FIXED',
      }),
    ]);
  });

  it('resolves CURRENT on the server for each occurrence and stores the applied snapshot', () => {
    expect(
      resolveRecurringOccurrenceItems({
        plan: { ...fixedPlan, pricingPolicy: 'CURRENT' },
        serverCatalog: [{ productId: 'service-a', currentUnitPriceCents: 15_000 }],
        periodStart: '2026-08-31T09:30:00-05:00',
      }),
    ).toEqual([
      expect.objectContaining({
        productId: 'service-a',
        appliedUnitPriceCents: 15_000,
        appliedQuantityMicrounits: 1_000_000,
        priceSource: 'CURRENT',
        priceResolvedAt: expect.any(String),
      }),
    ]);
  });
});

describe('Sprint 44 recurring-sales grace and proration contract (RED)', () => {
  it('never blocks ordinary POS or fiscal work while late or after grace', () => {
    expect(
      decideRecurringDelinquency({
        dueAt: '2026-08-01T00:00:00-05:00',
        now: '2026-08-06T00:00:00-05:00',
        graceDays: 3,
        afterGracePolicy: 'PAUSE_FUTURE_EXECUTION',
      }),
    ).toEqual({
      membershipState: 'PAUSED_AFTER_GRACE',
      executeFutureOccurrences: false,
      ordinaryCheckoutAllowed: true,
      ordinaryFiscalAllowed: true,
    });
  });

  it('credits whole unused service days with integer rational half-up', () => {
    expect(
      computeRecurringProration({
        lineTotalCents: 10_000,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-08-22T10:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toMatchObject({
      serviceDays: 31,
      unusedServiceDays: 9,
      creditAmountCents: 2_903,
      returnDocumentType: 'FROM_ORIGINAL_DOCUMENT',
      mutatesOriginalSale: false,
    });
  });

  it('gives no credit for cancel-at-period-end', () => {
    expect(
      computeRecurringProration({
        lineTotalCents: 10_000,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-08-22T10:00:00-05:00',
        mode: 'AT_PERIOD_END',
      }),
    ).toMatchObject({ creditAmountCents: 0, createsReturn: false });
  });

  it('rejects unsafe monetary intermediates instead of rounding floats', () => {
    expect(() =>
      computeRecurringProration({
        lineTotalCents: Number.MAX_SAFE_INTEGER,
        periodStart: '2026-08-01T00:00:00-05:00',
        periodEnd: '2026-09-01T00:00:00-05:00',
        cancelledAt: '2026-08-02T00:00:00-05:00',
        mode: 'IMMEDIATE',
      }),
    ).toThrow('RECURRING_PRORATION_UNSAFE_INTEGER');
  });
});
