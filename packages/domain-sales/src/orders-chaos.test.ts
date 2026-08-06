/**
 * Chaos QA S19 — concurrencia split / cancel READY sin doble stock lógico.
 */
import { describe, expect, it } from 'vitest';
import {
  assertItemCancelAuthorized,
  assertOrderBillable,
  planOrderStockDeltas,
  planSplitBill,
} from './orders.js';

describe('chaos orders S19', () => {
  it('dos porciones del mismo split no solapan ni pierden ítems', () => {
    const itemIds = ['i1', 'i2', 'i3'];
    const amounts = new Map([
      ['i1', 1000],
      ['i2', 2000],
      ['i3', 500],
    ]);
    const a = planSplitBill({
      orderId: 'o1',
      orderStatus: 'READY',
      itemIds,
      amountCentsByItem: amounts,
      portions: [
        { saleId: 's1', itemIds: ['i1', 'i2'] },
        { saleId: 's2', itemIds: ['i3'] },
      ],
    });
    expect(a.reduce((n, p) => n + p.amountCents, 0)).toBe(3500);
    expect(() =>
      planSplitBill({
        orderId: 'o1',
        orderStatus: 'READY',
        itemIds,
        amountCentsByItem: amounts,
        portions: [
          { saleId: 's1', itemIds: ['i1'] },
          { saleId: 's2', itemIds: ['i1'] },
        ],
      }),
    ).toThrow('SPLIT_ITEM_OVERLAP');
  });

  it('stock deduct_on_sale una sola vez en bill (no en fire)', () => {
    const lines = [
      { productId: 'p1', quantity: 2 },
      { productId: 'p1', quantity: 1 },
    ];
    expect(planOrderStockDeltas({ policy: 'deduct_on_sale', phase: 'fire', lines })).toEqual([]);
    expect(planOrderStockDeltas({ policy: 'deduct_on_sale', phase: 'bill', lines })).toEqual([
      { productId: 'p1', qtyDelta: -3 },
    ]);
  });

  it('cancel READY exige authz; OPEN no billable', () => {
    expect(() => assertItemCancelAuthorized('READY', null)).toThrow('AUTH_TOKEN_REQUIRED');
    expect(() => assertOrderBillable('OPEN')).toThrow('ORDER_NOT_BILLABLE');
    expect(() => assertOrderBillable('PAID')).toThrow('ORDER_NOT_BILLABLE');
  });
});
