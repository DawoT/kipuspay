import { describe, expect, it } from 'vitest';
import {
  aggregateSaleItems,
  assertOfflineSaleShape,
  computeNvLineTotals,
  InsufficientStockError,
  resolveIssuedAtMs,
  splitNvLinesByFefo,
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

  it('acepta identidad UOM exacta sin quantity legado', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            uomId: 'u-pack',
            enteredQuantityMicrounits: 2_000_000,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rechaza cantidad UOM no segura o sin uomId', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', enteredQuantityMicrounits: 1 }],
      }),
    ).toThrow('INVALID_UOM_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            uomId: 'u-pack',
            enteredQuantityMicrounits: Number.MAX_SAFE_INTEGER + 1,
          },
        ],
      }),
    ).toThrow('INVALID_UOM_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', uomId: 'u-pack', enteredQuantityMicrounits: 0 }],
      }),
    ).toThrow('INVALID_UOM_QUANTITY');
  });

  it('rechaza promotionIds mal formados', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 1, promotionIds: 'pr1' as never }],
      }),
    ).toThrow('INVALID_PROMOTION_IDS');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 1, promotionIds: [''] }],
      }),
    ).toThrow('INVALID_PROMOTION_IDS');
  });

  it('acepta item pre-resuelto server-side con cantidad fraccional (convert snapshot)', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            baseQuantityMicrounits: 1500000,
            resolvedUomCode: 'UND',
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
            serverUnitPriceCents: 1000,
          },
        ],
        payments: [{ paymentMethodId: 'pm1', amountCents: 1770 }],
      }),
    ).not.toThrow();
  });

  it('rechaza item pre-resuelto con base o factores inválidos', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            baseQuantityMicrounits: -1,
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            baseQuantityMicrounits: 1500000,
            resolvedFactorNumerator: 0,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 0,
            baseQuantityMicrounits: 1500000,
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            baseQuantityMicrounits: 1.5,
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: Number.NaN,
            baseQuantityMicrounits: 1500000,
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 0,
            baseQuantityMicrounits: 1500000,
            resolvedFactorNumerator: 1,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            baseQuantityMicrounits: 1500000,
            resolvedFactorNumerator: 'x' as never,
            resolvedFactorDenominator: 1,
          },
        ],
      }),
    ).toThrow('INVALID_RESOLVED_QUANTITY');
  });

  it('acepta item pre-resuelto con identidad UOM (uomId + entered + factores)', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [
          {
            productId: 'p1',
            quantity: 1.5,
            uomId: 'u-kg',
            enteredQuantityMicrounits: 1500,
            baseQuantityMicrounits: 1500000,
            resolvedUomCode: 'KG',
            resolvedFactorNumerator: 1000,
            resolvedFactorDenominator: 1,
            serverUnitPriceCents: 1000,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rechaza captureStatus inválido', () => {
    const badPay = {
      paymentMethodId: 'pm1',
      amountCents: 100,
      captureStatus: 'BOGUS',
    };
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        payments: [badPay as OfflineSalePayload['payments'][number]],
      }),
    ).toThrow(/INVALID_CAPTURE_STATUS/);
  });

  it('acepta captureStatus MANUAL', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        payments: [{ paymentMethodId: 'pm1', amountCents: 100, captureStatus: 'MANUAL' }],
      }),
    ).not.toThrow();
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
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 1, promotionIds: [''] }],
      }),
    ).toThrow(/INVALID_PROMOTION_IDS/);
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        items: [{ productId: 'p1', quantity: 1, promotionIds: ['promo-1'] }],
      }),
    ).not.toThrow();
  });

  it('acepta CPE 01 y rechaza tipo desconocido', () => {
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        documentType: '01',
      }),
    ).not.toThrow();
    expect(() =>
      assertOfflineSaleShape({
        ...basePayload(),
        documentType: '99' as 'NV',
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

describe('aggregateSaleItems', () => {
  it('fusiona ítems por (productId, uomId) sumando cantidades y base', () => {
    const items = [
      {
        productId: 'p1',
        quantity: 1,
        baseQuantityMicrounits: 1000000,
        enteredQuantityMicrounits: 1000000,
        resolvedFactorNumerator: 1,
        resolvedFactorDenominator: 1,
      },
      {
        productId: 'p1',
        quantity: 0.5,
        baseQuantityMicrounits: 500000,
        enteredQuantityMicrounits: 500000,
        resolvedFactorNumerator: 1,
        resolvedFactorDenominator: 1,
      },
      {
        productId: 'p2',
        quantity: 2,
        baseQuantityMicrounits: 2000000,
        resolvedFactorNumerator: 1,
        resolvedFactorDenominator: 1,
      },
    ];
    const merged = aggregateSaleItems(items);
    expect(merged).toHaveLength(2);
    const p1 = merged.find((item) => item.productId === 'p1')!;
    expect(p1.quantity).toBe(1.5);
    expect(p1.baseQuantityMicrounits).toBe(1500000);
    expect(p1.enteredQuantityMicrounits).toBe(1500000);
  });

  it('fusión con descuentos y promotionIds distintos', () => {
    const merged = aggregateSaleItems([
      {
        productId: 'p1',
        quantity: 1,
        baseQuantityMicrounits: 1000000,
        discountAmountCents: 10,
        promotionIds: ['pr1'],
      },
      {
        productId: 'p1',
        quantity: 1,
        baseQuantityMicrounits: 1000000,
        discountAmountCents: 5,
        promotionIds: ['pr2'],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.discountAmountCents).toBe(15);
    expect([...(merged[0]!.promotionIds ?? [])].sort()).toEqual(['pr1', 'pr2']);
  });

  it('no fusiona el mismo producto con uomId distinto', () => {
    const merged = aggregateSaleItems([
      { productId: 'p1', quantity: 1, uomId: 'u-und' },
      { productId: 'p1', quantity: 1, uomId: 'u-pack' },
      { productId: 'p1', quantity: 1 },
    ]);
    expect(merged).toHaveLength(3);
  });

  it('suma entered/base/descuento ausentes como 0', () => {
    const merged = aggregateSaleItems([
      { productId: 'p1', quantity: 1 },
      { productId: 'p1', quantity: 2 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quantity).toBe(3);
    expect(merged[0]!.enteredQuantityMicrounits).toBe(0);
    expect(merged[0]!.baseQuantityMicrounits).toBe(0);
    expect(merged[0]!.discountAmountCents).toBe(0);
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
      computeNvLineTotals(
        [{ productId: 'p1', uomId: 'pack', enteredQuantityMicrounits: 1_000_000 }],
        catalog,
      ),
    ).toThrow('INVALID_QUANTITY');
    expect(() =>
      computeNvLineTotals([{ productId: 'p1', quantity: 1, discountAmountCents: 200 }], catalog),
    ).toThrow(/DISCOUNT_EXCEEDS_SUBTOTAL/);
    expect(() => computeNvLineTotals([{ productId: 'missing', quantity: 1 }], catalog)).toThrow(
      /Product not found/,
    );
  });

  it('usa serverUnitPriceCents post-promo (nunca precio cliente HTTP)', () => {
    const catalog = new Map([['p1', { priceCents: 1000, costCents: 100 }]]);
    const totals = computeNvLineTotals(
      [{ productId: 'p1', quantity: 2, serverUnitPriceCents: 800, discountAmountCents: 100 }],
      catalog,
    );
    expect(totals.lines[0]!.unitPriceCents).toBe(800);
    expect(totals.totalTaxableCents).toBe(1500);
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

describe('splitNvLinesByFefo', () => {
  it('asigna batchId y conserva totales', () => {
    const totals = computeNvLineTotals(
      [{ productId: 'p1', quantity: 5 }],
      new Map([['p1', { priceCents: 1000, costCents: 200 }]]),
    );
    const split = splitNvLinesByFefo(
      totals.lines,
      new Map([
        [
          'p1',
          [
            { batchId: 'b-old', qty: 2 },
            { batchId: 'b-new', qty: 3 },
          ],
        ],
      ]),
    );
    expect(split).toHaveLength(2);
    expect(split[0]!.batchId).toBe('b-old');
    expect(split[1]!.batchId).toBe('b-new');
    expect(split.reduce((s, l) => s + l.totalCents, 0)).toBe(totals.totalAmountCents);
    expect(split.reduce((s, l) => s + l.quantity, 0)).toBe(5);
  });

  it('usa PMP snapshot como COGS', () => {
    const totals = computeNvLineTotals(
      [{ productId: 'p1', quantity: 1 }],
      new Map([['p1', { priceCents: 1180, costCents: 350 }]]),
    );
    expect(totals.lines[0]!.unitCostCents).toBe(350);
    expect(totals.totalCogsCents).toBe(350);
  });

  it('rechaza precio/costo inválidos y FEFO mismatch', () => {
    expect(() =>
      computeNvLineTotals(
        [{ productId: 'p1', quantity: 1 }],
        new Map([['p1', { priceCents: -1, costCents: 0 }]]),
      ),
    ).toThrow('INVALID_UNIT_PRICE');
    expect(() =>
      computeNvLineTotals(
        [{ productId: 'p1', quantity: 1 }],
        new Map([['p1', { priceCents: 100, costCents: -1 }]]),
      ),
    ).toThrow('INVALID_UNIT_COST');
    const totals = computeNvLineTotals(
      [{ productId: 'p1', quantity: 2 }],
      new Map([['p1', { priceCents: 100, costCents: 10 }]]),
    );
    expect(() =>
      splitNvLinesByFefo(totals.lines, new Map([['p1', [{ batchId: 'b', qty: 1 }]]])),
    ).toThrow('FEFO_QTY_MISMATCH');
    expect(splitNvLinesByFefo(totals.lines, new Map()).map((l) => l.batchId)).toEqual([null]);
  });
});
