import { describe, expect, it } from 'vitest';
import {
  AP_ALREADY_PAID,
  AP_INSUFFICIENT,
  INSUFFICIENT_STOCK,
  SUPPLIER_RETURN_ALREADY_CLOSED,
  SUPPLIER_RETURN_ALREADY_TERMINAL,
  SUPPLIER_RETURN_COST_MISMATCH,
  SUPPLIER_RETURN_INVALID_AMOUNT,
  SUPPLIER_RETURN_INVALID_STATUS,
  SUPPLIER_RETURN_ITEMS_REQUIRED,
  SUPPLIER_RETURN_QTY_EXCEEDED,
  assertSupplierReturnCancelAllowed,
  assertSupplierReturnClosable,
  assertSupplierReturnStockEnough,
  planSupplierReturnCreate,
} from './supplier-return.js';

const item = {
  productId: 'p1',
  baseQuantityMicrounits: 2_000_000,
  unitCostCents: 500,
  snapshotUnitCostCents: 500,
  receivedMicrounits: 4_000_000,
  invoicedMicrounits: 4_000_000,
  alreadyReturnedMicrounits: 0,
};

describe('planSupplierReturnCreate', () => {
  it('OPEN no emite CPE ni mueve stock', () => {
    const plan = planSupplierReturnCreate({ items: [item], reason: 'dañado' });
    expect(plan.status).toBe('OPEN');
    expect(plan.snapshotTotalCents).toBe(1000);
    expect(plan.emitsFiscalDocument).toBe(false);
    expect(plan.movesStock).toBe(false);
  });

  it('rechaza vacío o qty > recibida', () => {
    expect(() => planSupplierReturnCreate({ items: [], reason: 'x' })).toThrow(
      SUPPLIER_RETURN_ITEMS_REQUIRED,
    );
    expect(() => planSupplierReturnCreate({ items: [item], reason: '   ' })).toThrow(
      SUPPLIER_RETURN_ITEMS_REQUIRED,
    );
    expect(() =>
      planSupplierReturnCreate({
        items: [{ ...item, productId: '  ' }],
        reason: 'x',
      }),
    ).toThrow(SUPPLIER_RETURN_ITEMS_REQUIRED);
    expect(() =>
      planSupplierReturnCreate({
        items: [{ ...item, baseQuantityMicrounits: 5_000_000 }],
        reason: 'x',
      }),
    ).toThrow(SUPPLIER_RETURN_QTY_EXCEEDED);
    expect(() =>
      planSupplierReturnCreate({
        items: [{ ...item, invoicedMicrounits: 1_000_000 }],
        reason: 'x',
      }),
    ).toThrow(SUPPLIER_RETURN_QTY_EXCEEDED);
    expect(() =>
      planSupplierReturnCreate({
        items: [{ ...item, unitCostCents: -1 }],
        reason: 'x',
      }),
    ).toThrow(SUPPLIER_RETURN_INVALID_AMOUNT);
    expect(() =>
      planSupplierReturnCreate({
        items: [{ ...item, baseQuantityMicrounits: 0 }],
        reason: 'x',
      }),
    ).toThrow(SUPPLIER_RETURN_INVALID_AMOUNT);
  });
});

describe('assertSupplierReturnClosable', () => {
  it('close desde OPEN descuenta CxP y no emite CPE', () => {
    const plan = assertSupplierReturnClosable({
      status: 'OPEN',
      items: [item],
      priceDiffOverride: false,
      ap: { status: 'OPEN', balanceDueCents: 2000 },
    });
    expect(plan.movesStock).toBe(true);
    expect(plan.emitsFiscalDocument).toBe(false);
    expect(plan.apDeltaCents).toBe(1000);
    expect(plan.nextApBalanceCents).toBe(1000);
    expect(plan.nextApStatus).toBe('PARTIALLY_PAID');
  });

  it('sin AP solo mueve stock', () => {
    const plan = assertSupplierReturnClosable({
      status: 'OPEN',
      items: [item],
      priceDiffOverride: false,
      ap: null,
    });
    expect(plan.apDeltaCents).toBe(0);
    expect(plan.nextApBalanceCents).toBeNull();
  });

  it('AP pagado o saldo insuficiente → 422', () => {
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [item],
        priceDiffOverride: false,
        ap: { status: 'PAID', balanceDueCents: 0 },
      }),
    ).toThrow(AP_ALREADY_PAID);
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [item],
        priceDiffOverride: false,
        ap: { status: 'OPEN', balanceDueCents: 500 },
      }),
    ).toThrow(AP_INSUFFICIENT);
  });

  it('costo distinto exige override auditado', () => {
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [{ ...item, unitCostCents: 600 }],
        priceDiffOverride: false,
      }),
    ).toThrow(SUPPLIER_RETURN_COST_MISMATCH);
    const plan = assertSupplierReturnClosable({
      status: 'OPEN',
      items: [{ ...item, unitCostCents: 600 }],
      priceDiffOverride: true,
      authorizedByUserId: 'u-admin',
      ap: null,
    });
    expect(plan.requiresPriceDiffAudit).toBe(true);
  });

  it('close-once: CLOSED rechaza', () => {
    expect(() =>
      assertSupplierReturnClosable({
        status: 'CLOSED',
        items: [item],
        priceDiffOverride: false,
      }),
    ).toThrow(SUPPLIER_RETURN_ALREADY_CLOSED);
    expect(() =>
      assertSupplierReturnClosable({
        status: 'CANCELLED',
        items: [item],
        priceDiffOverride: false,
      }),
    ).toThrow(SUPPLIER_RETURN_INVALID_STATUS);
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [],
        priceDiffOverride: false,
      }),
    ).toThrow(SUPPLIER_RETURN_ITEMS_REQUIRED);
  });

  it('override sin authz o AP saldo inválido', () => {
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [{ ...item, unitCostCents: 600 }],
        priceDiffOverride: true,
        authorizedByUserId: null,
      }),
    ).toThrow(SUPPLIER_RETURN_COST_MISMATCH);
    expect(() =>
      assertSupplierReturnClosable({
        status: 'OPEN',
        items: [item],
        priceDiffOverride: false,
        ap: { status: 'OPEN', balanceDueCents: 1.5 },
      }),
    ).toThrow(AP_INSUFFICIENT);
    const paidOff = assertSupplierReturnClosable({
      status: 'OPEN',
      items: [item],
      priceDiffOverride: false,
      ap: { status: 'OPEN', balanceDueCents: 1000 },
    });
    expect(paidOff.nextApStatus).toBe('PAID');
    expect(paidOff.nextApBalanceCents).toBe(0);
  });
});

describe('cancel / stock', () => {
  it('cancel solo OPEN; CLOSED → terminal', () => {
    expect(() => assertSupplierReturnCancelAllowed({ status: 'OPEN' })).not.toThrow();
    expect(() => assertSupplierReturnCancelAllowed({ status: 'CLOSED' })).toThrow(
      SUPPLIER_RETURN_ALREADY_TERMINAL,
    );
    expect(() => assertSupplierReturnCancelAllowed({ status: 'CANCELLED' })).toThrow(
      SUPPLIER_RETURN_ALREADY_TERMINAL,
    );
  });

  it('stock insuficiente', () => {
    expect(() =>
      assertSupplierReturnStockEnough({
        stockMicrounits: 1_000_000,
        outboundMicrounits: 2_000_000,
      }),
    ).toThrow(INSUFFICIENT_STOCK);
    expect(() =>
      assertSupplierReturnStockEnough({
        stockMicrounits: 1.5,
        outboundMicrounits: 1_000_000,
      }),
    ).toThrow(SUPPLIER_RETURN_INVALID_AMOUNT);
    expect(() =>
      assertSupplierReturnStockEnough({
        stockMicrounits: 2_000_000,
        outboundMicrounits: 1_000_000,
      }),
    ).not.toThrow();
  });
});
