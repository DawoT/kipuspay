import { describe, expect, it } from 'vitest';
import {
  canonicalizePriceLabelSnapshots,
  compilePriceLabelTemplate,
  encodePriceLabelBarcode,
  hashPriceLabelPayload,
  hashPriceLabelSnapshots,
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

  it.each([
    { ...template, extra: true },
    {
      ...template,
      blocks: [
        ...template.blocks,
        { type: 'TEXT', field: 'product_name', align: 'CENTER', html: '<b>x</b>' },
      ],
    },
    { ...template, blocks: Array.from({ length: 17 }, () => template.blocks[0]) },
    { ...template, blocks: [{ type: 'SPACER', lines: 5 }] },
  ])('rejects arbitrary keys and bounded DSL violations', (candidate) => {
    expect(() => validatePriceLabelTemplate(candidate)).toThrow('PRICE_LABEL_TEMPLATE_NOT_ALLOWED');
  });

  it('canonically serializes ordered snapshots and hashes snapshots and payload with Web Crypto', async () => {
    const second = { ...snapshot, productId: 'product-2', priceCents: 2590 };
    expect(canonicalizePriceLabelSnapshots([snapshot, second])).toBe(
      JSON.stringify([
        {
          barcodeType: snapshot.barcodeType,
          barcodeValue: snapshot.barcodeValue,
          priceCents: snapshot.priceCents,
          productId: snapshot.productId,
          productName: snapshot.productName,
          templateVersion: snapshot.templateVersion,
        },
        {
          barcodeType: second.barcodeType,
          barcodeValue: second.barcodeValue,
          priceCents: second.priceCents,
          productId: second.productId,
          productName: second.productName,
          templateVersion: second.templateVersion,
        },
      ]),
    );
    await expect(hashPriceLabelSnapshots([snapshot, second])).resolves.toMatch(/^[a-f0-9]{64}$/);
    const bytes = compilePriceLabelTemplate(template, snapshot, 58);
    await expect(hashPriceLabelPayload(bytes)).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(await hashPriceLabelPayload(bytes)).toBe(await hashPriceLabelPayload(bytes));
  });

  it('rejects unbounded or non-integer authoritative snapshot values', () => {
    expect(() =>
      compilePriceLabelTemplate(template, { ...snapshot, productName: 'X'.repeat(121) }, 58),
    ).toThrow('PRICE_LABEL_SNAPSHOT_INVALID');
    expect(() =>
      compilePriceLabelTemplate(template, { ...snapshot, priceCents: 12.5 }, 58),
    ).toThrow('PRICE_LABEL_SNAPSHOT_INVALID');
  });

  it.each([58, 80] as const)('renders deterministic %dmm golden bytes', (paperWidthMm) => {
    const first = compilePriceLabelTemplate(template, snapshot, paperWidthMm);
    const replay = compilePriceLabelTemplate(template, snapshot, paperWidthMm);
    expect(replay).toEqual(first);
    expect(Array.from(first)).toMatchSnapshot();
  });

  it('does not add barcode or rendering runtime dependencies', async () => {
    const manifest = await import('../package.json');
    const runtimeDependencies = (manifest.default as { dependencies?: Record<string, string> })
      .dependencies;
    expect(runtimeDependencies ?? {}).toEqual({});
  });
});
