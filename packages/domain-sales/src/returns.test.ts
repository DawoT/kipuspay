import { describe, expect, it } from 'vitest';
import {
  assertReturnReason,
  assertReturnWithinWindow,
  daysSinceIssued,
  DEFAULT_RETURN_POLICY,
  parseReturnPolicyRow,
  planReturnLines,
  resolveReturnDocType,
  RETURN_NO_LINES,
  RETURN_OUTSIDE_WINDOW,
  RETURN_QTY_EXCEEDED,
  RETURN_REASON_REQUIRED,
  sumReturnRefundCents,
  windowDaysForMethod,
  type OriginalSaleItem,
} from './returns.js';

const item = (over: Partial<OriginalSaleItem> = {}): OriginalSaleItem => ({
  id: 'si-1',
  productId: 'p1',
  quantity: 2,
  unitPriceCents: 1180,
  unitCostCents: 500,
  batchId: 'b1',
  isUncatalogued: false,
  igvAffectationCode: '10',
  igvAmountCents: 180,
  icbperAmountCents: 0,
  totalAmountCents: 2360,
  alreadyReturnedQty: 0,
  ...over,
});

describe('return policy window §5.3', () => {
  it('windowDaysForMethod usa override o default', () => {
    const p = {
      ...DEFAULT_RETURN_POLICY,
      byPaymentMethod: { credit: 0, card: 14 },
    };
    expect(windowDaysForMethod(p, 'cash')).toBe(7);
    expect(windowDaysForMethod(p, 'card')).toBe(14);
    expect(windowDaysForMethod(p, 'credit')).toBe(0);
  });

  it('assertReturnWithinWindow ok / OUTSIDE_WINDOW', () => {
    const issued = Date.UTC(2026, 7, 1);
    expect(() =>
      assertReturnWithinWindow({
        issuedAtMs: issued,
        nowMs: issued + 3 * 86400000,
        policy: DEFAULT_RETURN_POLICY,
        paymentMethod: 'cash',
      }),
    ).not.toThrow();
    expect(() =>
      assertReturnWithinWindow({
        issuedAtMs: issued,
        nowMs: issued + 8 * 86400000,
        policy: DEFAULT_RETURN_POLICY,
        paymentMethod: 'cash',
      }),
    ).toThrow(RETURN_OUTSIDE_WINDOW);
    expect(daysSinceIssued(issued, issued - 1000)).toBe(0);
  });

  it('credit window 0 → rechaza siempre', () => {
    const issued = Date.UTC(2026, 7, 1);
    expect(() =>
      assertReturnWithinWindow({
        issuedAtMs: issued,
        nowMs: issued,
        policy: { ...DEFAULT_RETURN_POLICY, byPaymentMethod: { credit: 0 } },
        paymentMethod: 'credit',
      }),
    ).toThrow(RETURN_OUTSIDE_WINDOW);
  });
});

describe('planReturnLines', () => {
  it('planifica líneas y suma refund', () => {
    const lines = planReturnLines([{ originalSaleItemId: 'si-1', qty: 1 }], [item()]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.restoreStock).toBe(true);
    expect(lines[0]?.lineTotalCents).toBe(1180);
    expect(sumReturnRefundCents(lines)).toBe(1180);
  });

  it('uncatalogued no restaura stock', () => {
    const lines = planReturnLines(
      [{ originalSaleItemId: 'si-1', qty: 1 }],
      [item({ isUncatalogued: true, quantity: 1, totalAmountCents: 1000, alreadyReturnedQty: 0 })],
    );
    expect(lines[0]?.restoreStock).toBe(false);
  });

  it('rechaza qty excedida / sin líneas / reason vacío', () => {
    expect(() => planReturnLines([], [item()])).toThrow(RETURN_NO_LINES);
    expect(() => planReturnLines([{ originalSaleItemId: 'si-1', qty: 3 }], [item()])).toThrow(
      RETURN_QTY_EXCEEDED,
    );
    expect(() => planReturnLines([{ originalSaleItemId: 'missing', qty: 1 }], [item()])).toThrow(
      'RETURN_ITEM_NOT_FOUND',
    );
    expect(() => assertReturnReason('  ')).toThrow(RETURN_REASON_REQUIRED);
    expect(() => assertReturnReason('defecto')).not.toThrow();
  });
});

describe('resolveReturnDocType and return policy parsing', () => {
  it('elige 07 vs NV_RETURN', () => {
    expect(resolveReturnDocType('ELECTRONIC_ISSUER')).toBe('07');
    expect(resolveReturnDocType('FORMALIZING')).toBe('07');
    expect(resolveReturnDocType('INTERNAL_CONTROL')).toBe('NV_RETURN');
  });

  it('parse row null → default; JSON inválido → {}', () => {
    expect(parseReturnPolicyRow(null)).toEqual(DEFAULT_RETURN_POLICY);
    const p = parseReturnPolicyRow({
      window_days: 10,
      by_payment_method_json: 'not-json',
      refund_to_original_method: 1,
      allow_turn_closed_with_auth: 0,
    });
    expect(p.windowDays).toBe(10);
    expect(p.byPaymentMethod).toEqual({});
    expect(p.refundToOriginalMethod).toBe(true);
  });

  it('parse JSON métodos', () => {
    const p = parseReturnPolicyRow({
      window_days: 5,
      by_payment_method_json: '{"cash":3}',
      refund_to_original_method: 0,
      allow_turn_closed_with_auth: 1,
    });
    expect(p.byPaymentMethod.cash).toBe(3);
    expect(p.refundToOriginalMethod).toBe(false);
    expect(p.allowTurnClosedWithAuth).toBe(true);
  });
});
