import { describe, expect, it } from 'vitest';
import {
  assertItemCancelAuthorized,
  assertOrderBillable,
  assertOrderItemTransition,
  assertOrderTransition,
  DEFAULT_ORDER_STOCK_POLICY,
  planMarkItemsReady,
  planOrderStockDeltas,
  planOrderReadyAggregation,
  planSplitBill,
  resolveOrderStockPolicy,
} from './orders.js';

describe('orders lifecycle', () => {
  it('permite OPEN→FIRED→READY→PAID', () => {
    assertOrderTransition('OPEN', 'FIRED');
    assertOrderTransition('FIRED', 'READY');
    assertOrderTransition('READY', 'PAID');
  });

  it('rechaza transiciones inválidas de orden e ítem', () => {
    expect(() => assertOrderTransition('PAID', 'READY')).toThrow('ORDER_INVALID:PAID->READY');
    expect(() => assertOrderItemTransition('BILLED', 'CANCELLED')).toThrow(
      'ORDER_ITEM_INVALID:BILLED->CANCELLED',
    );
  });

  it('exige authz al cancelar READY', () => {
    expect(() => assertItemCancelAuthorized('READY', null)).toThrow('AUTH_TOKEN_REQUIRED');
    expect(() => assertItemCancelAuthorized('READY', 'supervisor')).not.toThrow();
    expect(() => assertItemCancelAuthorized('READY', '   ')).toThrow('AUTH_TOKEN_REQUIRED');
    expect(() => assertItemCancelAuthorized('CANCELLED', 'x')).toThrow(
      'ORDER_ITEM_ALREADY_CANCELLED',
    );
    expect(() => assertItemCancelAuthorized('BILLED', 'x')).toThrow('ORDER_ITEM_ALREADY_BILLED');
    expect(() => assertItemCancelAuthorized('PENDING', null)).not.toThrow();
  });
});

describe('planSplitBill', () => {
  const base = {
    orderId: 'o1',
    orderStatus: 'READY' as const,
    itemIds: ['i1', 'i2'],
    amountCentsByItem: new Map([
      ['i1', 1000],
      ['i2', 2500],
    ]),
  };

  it('parte sin solapar y suma cents', () => {
    const portions = planSplitBill({
      ...base,
      portions: [
        { saleId: 's1', itemIds: ['i1'] },
        { saleId: 's2', itemIds: ['i2'] },
      ],
    });
    expect(portions).toHaveLength(2);
    expect(portions[0]!.amountCents).toBe(1000);
    expect(portions[1]!.amountCents).toBe(2500);
  });

  it('acepta FIRED como cobrable', () => {
    const portions = planSplitBill({
      ...base,
      orderStatus: 'FIRED',
      portions: [{ saleId: 's1', itemIds: ['i1', 'i2'] }],
    });
    expect(portions[0]!.amountCents).toBe(3500);
  });

  it('rechaza overlap', () => {
    expect(() =>
      planSplitBill({
        ...base,
        itemIds: ['i1'],
        portions: [
          { saleId: 's1', itemIds: ['i1'] },
          { saleId: 's2', itemIds: ['i1'] },
        ],
      }),
    ).toThrow('SPLIT_ITEM_OVERLAP');
  });

  it('rechaza orden no cobrable', () => {
    expect(() =>
      planSplitBill({
        ...base,
        orderStatus: 'OPEN',
        portions: [{ saleId: 's1', itemIds: ['i1'] }],
      }),
    ).toThrow('ORDER_NOT_BILLABLE');
  });

  it('rechaza sin porciones', () => {
    expect(() => planSplitBill({ ...base, portions: [] })).toThrow('SPLIT_REQUIRES_PORTIONS');
  });

  it('rechaza saleId vacío', () => {
    expect(() =>
      planSplitBill({
        ...base,
        portions: [{ saleId: '  ', itemIds: ['i1'] }],
      }),
    ).toThrow('SPLIT_REQUIRES_SALE_ID');
  });

  it('rechaza porción vacía', () => {
    expect(() =>
      planSplitBill({
        ...base,
        portions: [{ saleId: 's1', itemIds: [] }],
      }),
    ).toThrow('SPLIT_EMPTY_PORTION');
  });

  it('rechaza ítem fuera de la orden', () => {
    expect(() =>
      planSplitBill({
        ...base,
        portions: [{ saleId: 's1', itemIds: ['i99'] }],
      }),
    ).toThrow('SPLIT_UNKNOWN_ITEM');
  });

  it('rechaza monto inválido', () => {
    expect(() =>
      planSplitBill({
        ...base,
        itemIds: ['i1'],
        portions: [{ saleId: 's1', itemIds: ['i1'] }],
        amountCentsByItem: new Map([['i1', -5]]),
      }),
    ).toThrow('INVALID_ITEM_AMOUNT');
    expect(() =>
      planSplitBill({
        ...base,
        itemIds: ['i1'],
        portions: [{ saleId: 's1', itemIds: ['i1'] }],
        amountCentsByItem: new Map([['i1', 5.5]]),
      }),
    ).toThrow('INVALID_ITEM_AMOUNT');
    expect(() =>
      planSplitBill({
        ...base,
        itemIds: ['i1'],
        portions: [{ saleId: 's1', itemIds: ['i1'] }],
        amountCentsByItem: new Map(),
      }),
    ).toThrow('INVALID_ITEM_AMOUNT');
  });

  it('rechaza split incompleto', () => {
    expect(() =>
      planSplitBill({
        ...base,
        portions: [{ saleId: 's1', itemIds: ['i1'] }],
      }),
    ).toThrow('SPLIT_INCOMPLETE');
  });
});

describe('assertOrderBillable', () => {
  it('acepta FIRED y READY', () => {
    expect(() => assertOrderBillable('FIRED')).not.toThrow();
    expect(() => assertOrderBillable('READY')).not.toThrow();
  });

  it('rechaza OPEN/PAID/CANCELLED', () => {
    expect(() => assertOrderBillable('OPEN')).toThrow('ORDER_NOT_BILLABLE');
    expect(() => assertOrderBillable('PAID')).toThrow('ORDER_NOT_BILLABLE');
    expect(() => assertOrderBillable('CANCELLED')).toThrow('ORDER_NOT_BILLABLE');
  });
});

describe('planMarkItemsReady', () => {
  it('marca FIRED→READY y valida transición', () => {
    expect(planMarkItemsReady([{ id: 'i1', status: 'FIRED' }])).toEqual([
      { id: 'i1', nextStatus: 'READY' },
    ]);
  });

  it('rechaza ítem no FIRED', () => {
    expect(() => planMarkItemsReady([{ id: 'i1', status: 'PENDING' }])).toThrow(
      'ORDER_ITEM_INVALID:PENDING->READY',
    );
  });
});

describe('planOrderReadyAggregation', () => {
  it('FIRED→READY cuando todos activos READY', () => {
    expect(
      planOrderReadyAggregation({
        orderStatus: 'FIRED',
        itemStatuses: ['READY', 'READY', 'CANCELLED'],
      }),
    ).toBe('READY');
  });

  it('no agrega si queda FIRED activo', () => {
    expect(
      planOrderReadyAggregation({
        orderStatus: 'FIRED',
        itemStatuses: ['READY', 'FIRED'],
      }),
    ).toBeNull();
  });

  it('no agrega si orden no FIRED', () => {
    expect(
      planOrderReadyAggregation({
        orderStatus: 'OPEN',
        itemStatuses: ['READY'],
      }),
    ).toBeNull();
  });
});

describe('order stock policy (§5.3 regla 7)', () => {
  it('default deduct_on_sale', () => {
    expect(DEFAULT_ORDER_STOCK_POLICY).toBe('deduct_on_sale');
    expect(resolveOrderStockPolicy(undefined)).toBe('deduct_on_sale');
    expect(resolveOrderStockPolicy('reserve_on_fired')).toBe('reserve_on_fired');
  });

  it('rechaza política desconocida', () => {
    expect(() => resolveOrderStockPolicy('weird')).toThrow('INVALID_STOCK_POLICY');
  });

  it('deduct_on_sale planifica deltas en cobro', () => {
    const plan = planOrderStockDeltas({
      policy: 'deduct_on_sale',
      phase: 'bill',
      lines: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p1', quantity: 1 },
      ],
    });
    expect(plan).toEqual([{ productId: 'p1', qtyDelta: -3 }]);
  });

  it('deduct_on_sale no mueve stock en fire', () => {
    expect(
      planOrderStockDeltas({
        policy: 'deduct_on_sale',
        phase: 'fire',
        lines: [{ productId: 'p1', quantity: 2 }],
      }),
    ).toEqual([]);
  });

  it('reserve_on_fired reserva en fire y no en bill', () => {
    expect(
      planOrderStockDeltas({
        policy: 'reserve_on_fired',
        phase: 'fire',
        lines: [{ productId: 'p1', quantity: 2 }],
      }),
    ).toEqual([{ productId: 'p1', qtyDelta: -2 }]);
    expect(
      planOrderStockDeltas({
        policy: 'reserve_on_fired',
        phase: 'bill',
        lines: [{ productId: 'p1', quantity: 2 }],
      }),
    ).toEqual([]);
  });
});
