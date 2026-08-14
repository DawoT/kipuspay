import { describe, expect, it } from 'vitest';
import {
  QUOTE_ALREADY_CONVERTED,
  QUOTE_ALREADY_TERMINAL,
  QUOTE_EXPIRED,
  QUOTE_INVALID_AMOUNT,
  QUOTE_INVALID_STATUS,
  QUOTE_ITEMS_REQUIRED,
  QUOTE_MISSING_VALID_UNTIL,
  QUOTE_NOT_APPROVED,
  QUOTE_VALID_UNTIL_TOO_FAR,
  assertQuoteApprovable,
  assertQuoteCancelAllowed,
  assertQuoteConvertible,
  assertQuoteSendable,
  markQuoteExpired,
  planQuoteCreate,
} from './quotes.js';

const item = {
  productId: 'p1',
  baseQuantityMicrounits: 2_000_000,
  unitPriceCents: 1180,
};

describe('planQuoteCreate', () => {
  it('congela snapshot COM-05 y no emite ni reserva', () => {
    const plan = planQuoteCreate({
      items: [item],
      validUntilIso: '2026-08-20',
      nowIso: '2026-08-08T01:00:00.000Z',
    });
    expect(plan.status).toBe('DRAFT');
    expect(plan.snapshotTotalCents).toBe(2360);
    expect(plan.emitsFiscalDocument).toBe(false);
    expect(plan.reservesStock).toBe(false);
    expect(plan.items[0]?.unitPriceCents).toBe(1180);
  });

  it('rechaza ítems vacíos o montos inválidos', () => {
    expect(() =>
      planQuoteCreate({
        items: [],
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_ITEMS_REQUIRED);
    expect(() =>
      planQuoteCreate({
        items: [{ ...item, productId: '   ' }],
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_ITEMS_REQUIRED);
    expect(() =>
      planQuoteCreate({
        items: [{ ...item, unitPriceCents: -1 }],
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_INVALID_AMOUNT);
    expect(() =>
      planQuoteCreate({
        items: [{ ...item, baseQuantityMicrounits: 0 }],
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_INVALID_AMOUNT);
  });
});

describe('send / approve / cancel', () => {
  it('S33-H3: sin vencimiento → QUOTE_MISSING_VALID_UNTIL; >90 días → TOO_FAR', () => {
    expect(() =>
      planQuoteCreate({ items: [item], validUntilIso: null, nowIso: '2026-08-08T01:00:00.000Z' }),
    ).toThrow(QUOTE_MISSING_VALID_UNTIL);
    expect(() =>
      planQuoteCreate({
        items: [item],
        validUntilIso: '2026-12-31',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_VALID_UNTIL_TOO_FAR);
    // 90 días exactos (límite) → procede.
    expect(() =>
      planQuoteCreate({
        items: [item],
        validUntilIso: '2026-11-06',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('send solo desde DRAFT; approve desde DRAFT o SENT', () => {
    expect(() => assertQuoteSendable({ status: 'DRAFT' })).not.toThrow();
    expect(() => assertQuoteSendable({ status: 'SENT' })).toThrow(QUOTE_INVALID_STATUS);
    expect(() => assertQuoteApprovable({ status: 'DRAFT' })).not.toThrow();
    expect(() => assertQuoteApprovable({ status: 'SENT' })).not.toThrow();
    expect(() => assertQuoteApprovable({ status: 'APPROVED' })).toThrow(QUOTE_INVALID_STATUS);
    expect(() => assertQuoteApprovable({ status: 'EXPIRED' })).toThrow(QUOTE_EXPIRED);
  });

  it('cancel rechaza terminales', () => {
    expect(() => assertQuoteCancelAllowed({ status: 'DRAFT' })).not.toThrow();
    expect(() => assertQuoteCancelAllowed({ status: 'APPROVED' })).not.toThrow();
    expect(() => assertQuoteCancelAllowed({ status: 'CONVERTED' })).toThrow(QUOTE_ALREADY_TERMINAL);
    expect(() => assertQuoteCancelAllowed({ status: 'CANCELLED' })).toThrow(QUOTE_ALREADY_TERMINAL);
    expect(() => assertQuoteCancelAllowed({ status: 'EXPIRED' })).toThrow(QUOTE_ALREADY_TERMINAL);
  });
});

describe('convert / expire COM-05', () => {
  it('convert solo APPROVED vigente; expirada 422', () => {
    expect(() =>
      assertQuoteConvertible({
        status: 'APPROVED',
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).not.toThrow();
    expect(() =>
      assertQuoteConvertible({
        status: 'SENT',
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_NOT_APPROVED);
    expect(() =>
      assertQuoteConvertible({
        status: 'APPROVED',
        validUntilIso: '2026-08-01',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_EXPIRED);
    expect(() =>
      assertQuoteConvertible({
        status: 'CONVERTED',
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toThrow(QUOTE_ALREADY_CONVERTED);
  });

  it('markQuoteExpired no auto-cancela ni convierte', () => {
    expect(
      markQuoteExpired({
        status: 'APPROVED',
        validUntilIso: '2026-08-01',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toBe('EXPIRED');
    expect(
      markQuoteExpired({
        status: 'DRAFT',
        validUntilIso: '2026-08-20',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toBe('DRAFT');
    expect(
      markQuoteExpired({
        status: 'CONVERTED',
        validUntilIso: '2020-01-01',
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toBe('CONVERTED');
    expect(
      markQuoteExpired({
        status: 'APPROVED',
        validUntilIso: null,
        nowIso: '2026-08-08T01:00:00.000Z',
      }),
    ).toBe('APPROVED');
  });

  it('snapshot congelado no sigue la lista vigente', () => {
    const plan = planQuoteCreate({
      items: [{ ...item, unitPriceCents: 1000 }],
      validUntilIso: '2026-08-20',
      nowIso: '2026-08-08T01:00:00.000Z',
    });
    expect(plan.snapshotTotalCents).toBe(2000);
    expect(plan.items[0]?.unitPriceCents).not.toBe(1500);
  });
});
