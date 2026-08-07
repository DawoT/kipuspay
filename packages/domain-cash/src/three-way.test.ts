import { describe, expect, it } from 'vitest';
import { assertThreeWayMatch, THREE_WAY_MISMATCH, THREE_WAY_QTY_MISMATCH } from './three-way.js';

const baseLine = {
  productId: 'p1',
  orderedQty: 10,
  receivedQty: 10,
  invoicedQty: 10,
  poUnitCostCents: 100,
  invoiceUnitCostCents: 100,
};

describe('assertThreeWayMatch', () => {
  it('match perfecto → CLOSED', () => {
    const plan = assertThreeWayMatch({
      lines: [baseLine],
      priceDiffOverride: false,
      invoiceTotalCents: 1000,
      invoiceIgvCents: 152,
    });
    expect(plan.status).toBe('CLOSED');
    expect(plan.apAmountCents).toBe(1000);
    expect(plan.requiresPriceDiffAudit).toBe(false);
  });

  it('facturación parcial de lo recibido → PARTIAL', () => {
    const plan = assertThreeWayMatch({
      lines: [{ ...baseLine, invoicedQty: 4 }],
      priceDiffOverride: false,
      invoiceTotalCents: 400,
      invoiceIgvCents: 0,
    });
    expect(plan.status).toBe('PARTIAL');
    expect(plan.matchedQty).toBe(4);
  });

  it('invoiced > received → THREE_WAY_QTY_MISMATCH', () => {
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, receivedQty: 5, invoicedQty: 6 }],
        priceDiffOverride: false,
        invoiceTotalCents: 600,
        invoiceIgvCents: 0,
      }),
    ).toThrow(THREE_WAY_QTY_MISMATCH);
  });

  it('precio distinto sin override → THREE_WAY_MISMATCH', () => {
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, invoiceUnitCostCents: 120 }],
        priceDiffOverride: false,
        invoiceTotalCents: 1200,
        invoiceIgvCents: 0,
      }),
    ).toThrow(THREE_WAY_MISMATCH);
  });

  it('override precio → audit + true-up', () => {
    const plan = assertThreeWayMatch({
      lines: [{ ...baseLine, invoiceUnitCostCents: 120 }],
      priceDiffOverride: true,
      invoiceTotalCents: 1200,
      invoiceIgvCents: 0,
    });
    expect(plan.requiresPriceDiffAudit).toBe(true);
    expect(plan.costTrueUpByProduct.get('p1')).toBe(20);
    expect(plan.apAmountCents).toBe(1200);
  });

  it('líneas vacías / total inválido / igv inválido', () => {
    expect(() =>
      assertThreeWayMatch({
        lines: [],
        priceDiffOverride: false,
        invoiceTotalCents: 100,
        invoiceIgvCents: 0,
      }),
    ).toThrow('THREE_WAY_REQUIRES_LINES');
    expect(() =>
      assertThreeWayMatch({
        lines: [baseLine],
        priceDiffOverride: false,
        invoiceTotalCents: 0,
        invoiceIgvCents: 0,
      }),
    ).toThrow('INVALID_INVOICE_TOTAL');
    expect(() =>
      assertThreeWayMatch({
        lines: [baseLine],
        priceDiffOverride: false,
        invoiceTotalCents: 1000,
        invoiceIgvCents: -1,
      }),
    ).toThrow('INVALID_INVOICE_IGV');
  });

  it('qty inválida / received > ordered / solo líneas qty 0', () => {
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, orderedQty: Number.NaN }],
        priceDiffOverride: false,
        invoiceTotalCents: 1000,
        invoiceIgvCents: 0,
      }),
    ).toThrow('INVALID_ORDERED_QTY');
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, receivedQty: 12 }],
        priceDiffOverride: false,
        invoiceTotalCents: 1000,
        invoiceIgvCents: 0,
      }),
    ).toThrow(THREE_WAY_QTY_MISMATCH);
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, invoicedQty: 0 }],
        priceDiffOverride: false,
        invoiceTotalCents: 1000,
        invoiceIgvCents: 0,
      }),
    ).toThrow('THREE_WAY_REQUIRES_LINES');
  });

  it('costos inválidos / total ≠ suma con override', () => {
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, poUnitCostCents: 1.5 }],
        priceDiffOverride: false,
        invoiceTotalCents: 1000,
        invoiceIgvCents: 0,
      }),
    ).toThrow('INVALID_PO_UNIT_COST');
    expect(() =>
      assertThreeWayMatch({
        lines: [{ ...baseLine, invoiceUnitCostCents: -1 }],
        priceDiffOverride: true,
        invoiceTotalCents: 1000,
        invoiceIgvCents: 0,
      }),
    ).toThrow('INVALID_INVOICE_UNIT_COST');
    expect(() =>
      assertThreeWayMatch({
        lines: [baseLine],
        priceDiffOverride: false,
        invoiceTotalCents: 999,
        invoiceIgvCents: 0,
      }),
    ).toThrow(THREE_WAY_MISMATCH);
    const plan = assertThreeWayMatch({
      lines: [baseLine],
      priceDiffOverride: true,
      invoiceTotalCents: 999,
      invoiceIgvCents: 0,
    });
    expect(plan.requiresPriceDiffAudit).toBe(true);
    expect(plan.apAmountCents).toBe(999);
  });

  it('recepción parcial de OC → PARTIAL', () => {
    const plan = assertThreeWayMatch({
      lines: [{ ...baseLine, receivedQty: 5, invoicedQty: 5 }],
      priceDiffOverride: false,
      invoiceTotalCents: 500,
      invoiceIgvCents: 0,
    });
    expect(plan.status).toBe('PARTIAL');
  });
});
