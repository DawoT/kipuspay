import { describe, expect, it } from 'vitest';
import {
  assertOfflineSaleShape,
  computeNvLineTotals,
  InsufficientStockError,
  resolveIssuedAtMs,
  toLimaTimestamp,
  type OfflineSalePayload,
} from './offline-sale.js';

const basePayload = (): OfflineSalePayload => ({
  offlineSaleId: 'off-1',
  branchId: 'b1',
  cashRegisterSessionId: 's1',
  documentType: 'NV',
  series: 'NV01',
  clientDocumentType: '1',
  clientDocumentNumber: '00000000',
  clientName: 'Cliente',
  items: [{ productId: 'p1', quantity: 2 }],
  payments: [{ paymentMethodId: 'pm1', amountCents: 2360 }],
});

describe('assertOfflineSaleShape', () => {
  it('acepta payload NV mínimo', () => {
    expect(() => assertOfflineSaleShape(basePayload())).not.toThrow();
  });

  it('rechaza campos de cabecera vacíos', () => {
    expect(() => assertOfflineSaleShape({ ...basePayload(), offlineSaleId: '' })).toThrow(
      /MISSING_OFFLINE_SALE_ID/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), branchId: ' ' })).toThrow(
      /MISSING_BRANCH_ID/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), cashRegisterSessionId: '' })).toThrow(
      /MISSING_SESSION_ID/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), series: '' })).toThrow(
      /MISSING_SERIES/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), clientDocumentType: '' })).toThrow(
      /MISSING_CLIENT_DOC_TYPE/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), clientDocumentNumber: '' })).toThrow(
      /MISSING_CLIENT_DOC_NUMBER/,
    );
    expect(() => assertOfflineSaleShape({ ...basePayload(), clientName: '' })).toThrow(
      /MISSING_CLIENT_NAME/,
    );
  });

  it('rechaza items y payments inválidos', () => {
    expect(() => assertOfflineSaleShape({ ...basePayload(), items: [] })).toThrow(/EMPTY_ITEMS/);
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: '', quantity: 1 }],
      }),
    ).toThrow(/MISSING_PRODUCT_ID/);
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 0 }],
      }),
    ).toThrow(/INVALID_QUANTITY/);
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 1, discountAmountCents: -1 }],
      }),
    ).toThrow(/INVALID_DISCOUNT_CENTS/);
    expect(() => assertOfflineSaleShape({ ...basePayload(), payments: [] })).toThrow(
      /EMPTY_PAYMENTS/,
    );
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        payments: [{ paymentMethodId: '', amountCents: 1 }],
      }),
    ).toThrow(/MISSING_PAYMENT_METHOD/);
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        payments: [{ paymentMethodId: 'pm1', amountCents: 1.5 }],
      }),
    ).toThrow(/INVALID_PAYMENT_CENTS/);
  });

  it('rechaza documentType distinto de NV', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        documentType: '01' as 'NV',
      }),
    ).toThrow(/UNSUPPORTED_DOCUMENT_TYPE/);
  });
});

describe('resolveIssuedAtMs and lima stamp', () => {
  const now = Date.parse('2026-08-04T15:00:00.000Z');

  it('acepta issuedAt dentro de ±6h y usa now si falta', () => {
    expect(resolveIssuedAtMs('2026-08-04T14:00:00.000Z', now)).toBe(
      Date.parse('2026-08-04T14:00:00.000Z'),
    );
    expect(resolveIssuedAtMs(undefined, now)).toBe(now);
  });

  it('rechaza skew > 6h e issuedAt inválido', () => {
    expect(() => resolveIssuedAtMs('2026-08-03T01:00:00.000Z', now)).toThrow(
      /ISSUED_AT_SKEW_VIOLATION/,
    );
    expect(() => resolveIssuedAtMs('not-a-date', now)).toThrow(/INVALID_ISSUED_AT/);
  });

  it('formatea Lima UTC-5', () => {
    expect(toLimaTimestamp(Date.parse('2026-08-04T15:00:00.000Z'))).toBe('2026-08-04 10:00:00');
  });
});

describe('nv line totals', () => {
  it('calcula IGV 18% con Math.round', () => {
    const catalog = new Map([['p1', { priceCents: 1000, costCents: 400 }]]);
    const totals = computeNvLineTotals([{ productId: 'p1', quantity: 2 }], catalog);
    expect(totals.totalTaxableCents).toBe(2000);
    expect(totals.totalIgvCents).toBe(360);
    expect(totals.totalAmountCents).toBe(2360);
    expect(totals.totalCogsCents).toBe(800);
  });

  it('rechaza descuento excesivo y producto ausente', () => {
    const catalog = new Map([['p1', { priceCents: 100, costCents: 0 }]]);
    expect(() =>
      computeNvLineTotals([{ productId: 'p1', quantity: 1, discountAmountCents: 200 }], catalog),
    ).toThrow(/DISCOUNT_EXCEEDS_SUBTOTAL/);
    expect(() => computeNvLineTotals([{ productId: 'missing', quantity: 1 }], catalog)).toThrow(
      /Product not found/,
    );
  });
});

describe('InsufficientStockError', () => {
  it('expone productId / requested / available', () => {
    const err = new InsufficientStockError('p1', 5, 2);
    expect(err.productId).toBe('p1');
    expect(err.requested).toBe(5);
    expect(err.available).toBe(2);
    expect(err.name).toBe('InsufficientStockError');
  });
});
