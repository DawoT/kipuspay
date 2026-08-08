import { describe, expect, it } from 'vitest';
import {
  compilePriceLabelTemplate,
  encodePriceLabelBarcode,
  validatePriceLabelTemplate,
  type PriceLabelSnapshot,
} from './price-labels.js';

const snapshot: PriceLabelSnapshot = {
  productId: 'product-1',
  productName: 'CAFÉ ORGÁNICO 500G',
  priceCents: 1290,
  barcodeType: 'EAN13',
  barcodeValue: '4006381333931',
  templateVersion: 1,
};

const template = {
  dslVersion: 'PRICE_LABEL_V1',
  blocks: [
    { type: 'TEXT', field: 'product_name', align: 'CENTER' },
    { type: 'PRICE', field: 'price', align: 'RIGHT' },
    { type: 'BARCODE', field: 'barcode', align: 'CENTER' },
  ],
} as const;

describe('Sprint 41 price-label template contract', () => {
  it.each([
    ['EAN8', '96385074'],
    ['EAN13', '4006381333931'],
    ['CODE128', 'SKU-ABC-123'],
  ] as const)('validates and encodes %s without a runtime dependency', (kind, value) => {
    expect(Array.from(encodePriceLabelBarcode(kind, value))).toMatchSnapshot();
  });

  it.each([
    ['EAN8', '96385075'],
    ['EAN8', '123'],
    ['EAN13', '4006381333932'],
    ['EAN13', 'ABCDEFGHIJKLM'],
    ['CODE128', ''],
    ['CODE128', 'A\u0000B'],
    ['CODE128', 'X'.repeat(81)],
  ] as const)('rejects invalid %s payload %j', (kind, value) => {
    expect(() => encodePriceLabelBarcode(kind, value)).toThrow(/BARCODE_/);
  });

  it('rejects unknown DSL versions, nodes, fields and executable content', () => {
    expect(() =>
      validatePriceLabelTemplate({
        dslVersion: 'PRICE_LABEL_V2',
        blocks: [{ type: 'SCRIPT', field: 'window.fetch("https://attacker.invalid")' }],
      }),
    ).toThrow('PRICE_LABEL_TEMPLATE_NOT_ALLOWED');
  });

  it.each([58, 80] as const)('renders deterministic %dmm golden bytes', (paperWidthMm) => {
    const first = compilePriceLabelTemplate(template, snapshot, paperWidthMm);
    const replay = compilePriceLabelTemplate(template, snapshot, paperWidthMm);
    expect(replay).toEqual(first);
    expect(Array.from(first)).toMatchSnapshot();
  });

  it('does not add barcode or rendering runtime dependencies', async () => {
    const manifest = await import('../package.json');
    expect(manifest.default.dependencies ?? {}).toEqual({});
  });
});
