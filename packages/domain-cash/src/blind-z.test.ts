import { describe, expect, it } from 'vitest';
import {
  assertCreditWithinLimit,
  assertDiscountAuthorized,
  computeExpectedCashCents,
  discountRequiresAuthz,
  planBlindClose,
  planSaleReprint,
  printOutboxPendingCount,
  shouldBlockZForPrintOutbox,
  sumCountLines,
} from './blind-z.js';

describe('computeExpectedCashCents', () => {
  it('aplica opening + ventas + ingresos − retiros − egresos', () => {
    const expected = computeExpectedCashCents({
      openingBalanceCents: 10_000,
      cashSalesCents: 5_000,
      movements: [
        { movementType: 'CHANGE_FUND_IN', amountCents: 2_000 },
        { movementType: 'DEPOSIT_VALUES', amountCents: 3_000 },
        { movementType: 'SUPPLIER_PAYMENT', amountCents: 1_000 },
      ],
      legacyExpenseCents: 500,
    });
    // 10000 + 5000 + 2000 - 3000 - 1000 - 500 = 12500
    expect(expected).toBe(12_500);
  });

  it('trata SALE_REFUND y LAYAWAY_REFUND como outflow y LAYAWAY_DEPOSIT como inflow', () => {
    expect(
      computeExpectedCashCents({
        openingBalanceCents: 10_000,
        cashSalesCents: 0,
        movements: [
          { movementType: 'LAYAWAY_DEPOSIT', amountCents: 2_000 },
          { movementType: 'SALE_REFUND', amountCents: 500 },
          { movementType: 'LAYAWAY_REFUND', amountCents: 300 },
        ],
      }),
    ).toBe(11_200);
  });
});

describe('planBlindClose', () => {
  it('exige conteo en modo estricto', () => {
    expect(() =>
      planBlindClose({
        expectedCents: 1000,
        countLines: [],
        differenceThresholdCents: 0,
        differenceReason: null,
        strictMode: true,
      }),
    ).toThrow('BLIND_Z_REQUIRES_COUNT');
  });

  it('exige razón si |diff| > umbral', () => {
    expect(() =>
      planBlindClose({
        expectedCents: 1000,
        countLines: [{ denominationCents: 100, quantity: 5 }],
        differenceThresholdCents: 0,
        differenceReason: null,
        strictMode: true,
      }),
    ).toThrow('BLIND_Z_REASON_REQUIRED');
  });

  it('planifica cierre ciego con diff documentada', () => {
    const plan = planBlindClose({
      expectedCents: 1000,
      countLines: [{ denominationCents: 100, quantity: 8 }],
      differenceThresholdCents: 100,
      differenceReason: 'faltante documentado',
      strictMode: true,
    });
    expect(plan.countedTotalCents).toBe(800);
    expect(plan.differenceAmountCents).toBe(-200);
    expect(plan.closedBlind).toBe(true);
    expect(plan.requiresReason).toBe(true);
  });
});

describe('sumCountLines', () => {
  it('suma denominaciones × cantidad', () => {
    expect(
      sumCountLines([
        { denominationCents: 2000, quantity: 2 },
        { denominationCents: 100, quantity: 3 },
      ]),
    ).toBe(4300);
  });
});

describe('discount authz', () => {
  const policy = { maxPercentWithoutAuth: 5, maxAmountWithoutAuthCents: 2000 };

  it('no requiere token bajo umbral', () => {
    expect(
      discountRequiresAuthz({
        lineSubtotalCents: 10_000,
        discountCents: 400,
        policy,
        authorizationTokenHash: null,
      }),
    ).toBe(false);
  });

  it('exige token sobre umbral de monto', () => {
    expect(() =>
      assertDiscountAuthorized({
        lineSubtotalCents: 50_000,
        discountCents: 2500,
        policy,
        authorizationTokenHash: null,
      }),
    ).toThrow('AUTH_TOKEN_REQUIRED');
  });

  it('acepta token cuando requiere authz', () => {
    expect(() =>
      assertDiscountAuthorized({
        lineSubtotalCents: 50_000,
        discountCents: 2500,
        policy,
        authorizationTokenHash: 'abc',
      }),
    ).not.toThrow();
  });
});

describe('credit limit', () => {
  it('rechaza si AR + venta supera límite sin override', () => {
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: 10_000,
        openArBalanceCents: 8_000,
        saleAmountCents: 3_000,
        creditOverrideTokenHash: null,
      }),
    ).toThrow('CREDIT_LIMIT_EXCEEDED');
  });

  it('permite con override token', () => {
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: 10_000,
        openArBalanceCents: 8_000,
        saleAmountCents: 3_000,
        creditOverrideTokenHash: 'ovr',
      }),
    ).not.toThrow();
  });
});

describe('sale reprint', () => {
  it('siempre marca COPIA', () => {
    const plan = planSaleReprint({
      id: 'r1',
      tenantId: 't',
      saleId: 's1',
      branchId: 'b',
      printedByUserId: 'u',
    });
    expect(plan.copiedWatermark).toBe(1);
  });
});

describe('print outbox edge 2D', () => {
  it('no bloquea con pending 0', () => {
    expect(printOutboxPendingCount()).toBe(0);
    expect(shouldBlockZForPrintOutbox(0)).toBe(false);
  });

  it('bloquea cuando pending > 0', () => {
    expect(shouldBlockZForPrintOutbox(2)).toBe(true);
  });

  it('rechaza pending inválido', () => {
    expect(() => printOutboxPendingCount(-1)).toThrow('INVALID_OUTBOX_PENDING');
  });
});

describe('blind-z edges', () => {
  it('rechaza movement desconocido / qty negativa / descuento inválido', () => {
    expect(() =>
      computeExpectedCashCents({
        openingBalanceCents: 0,
        cashSalesCents: 0,
        movements: [{ movementType: 'NOPE' as never, amountCents: 1 }],
      }),
    ).toThrow(/UNKNOWN_MOVEMENT_TYPE/);
    expect(() => sumCountLines([{ denominationCents: 100, quantity: -1 }])).toThrow(
      'INVALID_COUNT_QTY',
    );
    expect(() =>
      assertDiscountAuthorized({
        lineSubtotalCents: 100,
        discountCents: 200,
        policy: { maxPercentWithoutAuth: 5, maxAmountWithoutAuthCents: 2000 },
        authorizationTokenHash: null,
      }),
    ).toThrow('DISCOUNT_EXCEEDS_LINE');
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: 100,
        openArBalanceCents: 0,
        saleAmountCents: 0,
        creditOverrideTokenHash: null,
      }),
    ).toThrow('INVALID_SALE_AMOUNT');
    expect(() =>
      planSaleReprint({
        id: 'r',
        tenantId: 't',
        saleId: '  ',
        branchId: 'b',
        printedByUserId: 'u',
      }),
    ).toThrow('REPRINT_REQUIRES_SALE');
  });

  it('cubre ramas % descuento y crédito dentro de límite', () => {
    expect(
      discountRequiresAuthz({
        lineSubtotalCents: 10_000,
        discountCents: 600,
        policy: { maxPercentWithoutAuth: 5, maxAmountWithoutAuthCents: 2000 },
        authorizationTokenHash: null,
      }),
    ).toBe(true);
    expect(() =>
      assertDiscountAuthorized({
        lineSubtotalCents: 10_000,
        discountCents: 0,
        policy: { maxPercentWithoutAuth: 5, maxAmountWithoutAuthCents: 2000 },
        authorizationTokenHash: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: 10_000,
        openArBalanceCents: 1_000,
        saleAmountCents: 2_000,
        creditOverrideTokenHash: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: -1,
        openArBalanceCents: 0,
        saleAmountCents: 1,
        creditOverrideTokenHash: null,
      }),
    ).toThrow('INVALID_CREDIT_LIMIT');
    expect(() =>
      assertCreditWithinLimit({
        creditLimitCents: 0,
        openArBalanceCents: -1,
        saleAmountCents: 1,
        creditOverrideTokenHash: null,
      }),
    ).toThrow('INVALID_AR_BALANCE');
  });
});
