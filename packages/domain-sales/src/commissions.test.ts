import { describe, expect, it } from 'vitest';
import {
  COMMISSION_ALREADY_PAID,
  COMMISSION_FORBIDDEN,
  COMMISSION_INVALID_AMOUNT,
  COMMISSION_INVALID_RATE,
  COMMISSION_INVALID_STATUS,
  COMMISSION_NOTHING_TO_PAY,
  COMMISSION_PAYROLL_FORBIDDEN,
  COMMISSION_SELLER_REQUIRED,
  assertCommissionNotPayroll,
  assertCommissionPayable,
  assertCommissionVoidable,
  lineCommissionCents,
  planCommissionAccrual,
  planCommissionPayout,
  planCommissionReverse,
  resolveCommissionRate,
  applyCommissionPercentCents,
} from './commissions.js';

const rates = [
  {
    sellerId: 'u1',
    productId: 'p1',
    categoryId: null,
    ratePercent: 0,
    rateAmountCents: 500,
  },
  {
    sellerId: 'u1',
    productId: null,
    categoryId: 'cat-a',
    ratePercent: 10,
    rateAmountCents: null,
  },
  {
    sellerId: 'u1',
    productId: null,
    categoryId: null,
    ratePercent: 5,
    rateAmountCents: null,
  },
];

describe('resolveCommissionRate', () => {
  it('prioriza product > category > default', () => {
    expect(resolveCommissionRate(rates, 'u1', 'p1', 'cat-a')?.rateAmountCents).toBe(500);
    expect(resolveCommissionRate(rates, 'u1', 'p2', 'cat-a')?.ratePercent).toBe(10);
    expect(resolveCommissionRate(rates, 'u1', 'p2', null)?.ratePercent).toBe(5);
    expect(resolveCommissionRate(rates, 'u2', 'p1', null)).toBeNull();
    expect(resolveCommissionRate(rates, '  ', 'p1', null)).toBeNull();
    expect(resolveCommissionRate(rates, 'u1', 'p2', 'cat-missing')?.ratePercent).toBe(5);
  });
});

describe('planCommissionAccrual', () => {
  it('suma líneas; sin seller → null', () => {
    expect(planCommissionAccrual({ sellerId: null, lines: [], rates })).toBeNull();
    const plan = planCommissionAccrual({
      sellerId: 'u1',
      rates,
      lines: [
        { productId: 'p1', categoryId: null, lineTotalCents: 10_000 },
        { productId: 'p2', categoryId: 'cat-a', lineTotalCents: 2_000 },
      ],
    });
    expect(plan?.amountCents).toBe(500 + 200);
    expect(plan?.emitsPayroll).toBe(false);
    expect(
      planCommissionAccrual({
        sellerId: 'u1',
        rates: [],
        lines: [{ productId: 'p9', categoryId: null, lineTotalCents: 1_000 }],
      }),
    ).toBeNull();
  });

  it('percent half-up y validaciones', () => {
    expect(applyCommissionPercentCents(1001, 5)).toBe(50);
    expect(() => applyCommissionPercentCents(-1, 5)).toThrow(COMMISSION_INVALID_AMOUNT);
    expect(() => applyCommissionPercentCents(100, -1)).toThrow(COMMISSION_INVALID_RATE);
    expect(() =>
      lineCommissionCents(
        {
          sellerId: 'u1',
          productId: null,
          categoryId: null,
          ratePercent: 0,
          rateAmountCents: -5,
        },
        100,
      ),
    ).toThrow(COMMISSION_INVALID_RATE);
    expect(() =>
      lineCommissionCents(
        {
          sellerId: 'u1',
          productId: null,
          categoryId: null,
          ratePercent: 5,
          rateAmountCents: null,
        },
        -1,
      ),
    ).toThrow(COMMISSION_INVALID_AMOUNT);
  });
});

describe('planCommissionReverse COM-07', () => {
  it('reverse once', () => {
    expect(planCommissionReverse({ amountCents: 700, alreadyReversed: false }).reverse).toBe(true);
    expect(planCommissionReverse({ amountCents: 700, alreadyReversed: true }).reverse).toBe(false);
  });
});

describe('planCommissionPayout Zero-Trust', () => {
  it('impone gross del servidor; ignora cliente', () => {
    const plan = planCommissionPayout({
      sellerId: 'u1',
      periodStartIso: '2026-08-01',
      periodEndIso: '2026-08-31',
      openAccrualCents: 3_000,
      actorIsAdminOrOwner: true,
      clientGrossCents: 99_999,
    });
    expect(plan.grossCents).toBe(3_000);
    expect(plan.clientGrossIgnored).toBe(true);
  });

  it('cajero forbidden; nothing to pay; already paid', () => {
    expect(() =>
      planCommissionPayout({
        sellerId: 'u1',
        periodStartIso: '2026-08-01',
        periodEndIso: '2026-08-31',
        openAccrualCents: 100,
        actorIsAdminOrOwner: false,
      }),
    ).toThrow(COMMISSION_FORBIDDEN);
    expect(() =>
      planCommissionPayout({
        sellerId: 'u1',
        periodStartIso: '2026-08-01',
        periodEndIso: '2026-08-31',
        openAccrualCents: 0,
        actorIsAdminOrOwner: true,
      }),
    ).toThrow(COMMISSION_NOTHING_TO_PAY);
    expect(() => assertCommissionPayable({ status: 'PAID', actorIsAdminOrOwner: true })).toThrow(
      COMMISSION_ALREADY_PAID,
    );
    expect(() =>
      planCommissionPayout({
        sellerId: '   ',
        periodStartIso: '2026-08-01',
        periodEndIso: '2026-08-31',
        openAccrualCents: 100,
        actorIsAdminOrOwner: true,
      }),
    ).toThrow(COMMISSION_SELLER_REQUIRED);
    expect(() =>
      planCommissionPayout({
        sellerId: 'u1',
        periodStartIso: '',
        periodEndIso: '2026-08-31',
        openAccrualCents: 100,
        actorIsAdminOrOwner: true,
      }),
    ).toThrow(COMMISSION_INVALID_AMOUNT);
    expect(() =>
      planCommissionPayout({
        sellerId: 'u1',
        periodStartIso: '2026-09-01',
        periodEndIso: '2026-08-01',
        openAccrualCents: 100,
        actorIsAdminOrOwner: true,
      }),
    ).toThrow(COMMISSION_INVALID_AMOUNT);
    expect(() => assertCommissionPayable({ status: 'VOID', actorIsAdminOrOwner: true })).toThrow(
      COMMISSION_INVALID_STATUS,
    );
    expect(() => assertCommissionPayable({ status: 'OPEN', actorIsAdminOrOwner: false })).toThrow(
      COMMISSION_FORBIDDEN,
    );
    expect(() => assertCommissionVoidable({ status: 'PAID', actorIsAdminOrOwner: true })).toThrow(
      COMMISSION_INVALID_STATUS,
    );
    expect(() => assertCommissionVoidable({ status: 'OPEN', actorIsAdminOrOwner: false })).toThrow(
      COMMISSION_FORBIDDEN,
    );
    expect(() =>
      assertCommissionVoidable({ status: 'OPEN', actorIsAdminOrOwner: true }),
    ).not.toThrow();
    expect(() =>
      assertCommissionPayable({ status: 'OPEN', actorIsAdminOrOwner: true }),
    ).not.toThrow();
  });

  it('nómina fuera de alcance', () => {
    expect(() => assertCommissionNotPayroll()).toThrow(COMMISSION_PAYROLL_FORBIDDEN);
  });
});
