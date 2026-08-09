import { describe, expect, it } from 'vitest';
import {
  assertVariantTopology,
  convertEnteredToBaseMicrounits,
  normalizeUomCode,
  QUANTITY_PRICE_INPUT_INVALID,
  QUANTITY_PRICE_OVERFLOW,
  QUANTITY_SCALE,
  resolveVariantUnitPriceCents,
  roundCentsFromMicrounitsCents,
} from './variants-uom.js';

describe('variants/uom quantity model', () => {
  it('converts two packs of twelve exactly', () => {
    expect(
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: 2 * QUANTITY_SCALE,
        factorNumerator: 12,
        factorDenominator: 1,
      }),
    ).toBe(24 * QUANTITY_SCALE);
  });

  it('rounds half-up to one base microunit', () => {
    expect(
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: 1,
        factorNumerator: 1,
        factorDenominator: 2,
      }),
    ).toBe(1);
  });

  it('rejects invalid factors and overflow', () => {
    expect(() =>
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: 0,
        factorNumerator: 1,
        factorDenominator: 1,
      }),
    ).toThrow('UOM_QUANTITY_INVALID');
    expect(() =>
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: 1,
        factorNumerator: 0,
        factorDenominator: 1,
      }),
    ).toThrow('UOM_FACTOR_INVALID');
    expect(() =>
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: 1,
        factorNumerator: 1,
        factorDenominator: 0,
      }),
    ).toThrow('UOM_FACTOR_INVALID');
    expect(() =>
      convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: Number.MAX_SAFE_INTEGER,
        factorNumerator: Number.MAX_SAFE_INTEGER,
        factorDenominator: 1,
      }),
    ).toThrow('QTY_OVERFLOW');
  });

  it('normalizes UOM codes', () => {
    expect(normalizeUomCode(' caja ')).toBe('CAJA');
    expect(() => normalizeUomCode('')).toThrow('UOM_CODE_INVALID');
    expect(() => normalizeUomCode('PACK_PACK_PACK')).toThrow('UOM_CODE_INVALID');
    expect(() => normalizeUomCode('CAJA!')).toThrow('UOM_CODE_INVALID');
  });

  it('rounds microunits × cents to cents half-up exactly', () => {
    expect(
      roundCentsFromMicrounitsCents({
        quantityMicrounits: QUANTITY_SCALE,
        unitPriceCents: 100,
      }),
    ).toBe(100);
    expect(
      roundCentsFromMicrounitsCents({
        quantityMicrounits: 500_000,
        unitPriceCents: 1,
      }),
    ).toBe(1);
    expect(
      roundCentsFromMicrounitsCents({
        quantityMicrounits: 1,
        unitPriceCents: 1,
      }),
    ).toBe(0);
  });

  it('rejects non-safe-integer quantity and price', () => {
    expect(() =>
      roundCentsFromMicrounitsCents({ quantityMicrounits: 1.5, unitPriceCents: 1 }),
    ).toThrow(QUANTITY_PRICE_INPUT_INVALID);
    expect(() =>
      roundCentsFromMicrounitsCents({ quantityMicrounits: -1, unitPriceCents: 1 }),
    ).toThrow(QUANTITY_PRICE_INPUT_INVALID);
    expect(() =>
      roundCentsFromMicrounitsCents({
        quantityMicrounits: QUANTITY_SCALE,
        unitPriceCents: -1,
      }),
    ).toThrow(QUANTITY_PRICE_INPUT_INVALID);
  });

  it('throws overflow when microunits × cents exceeds MAX_SAFE_INTEGER', () => {
    expect(() =>
      roundCentsFromMicrounitsCents({
        quantityMicrounits: Number.MAX_SAFE_INTEGER,
        unitPriceCents: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(QUANTITY_PRICE_OVERFLOW);
  });

  it('rejects self parent and nested variants', () => {
    expect(() =>
      assertVariantTopology({ productId: 'p1', parentProductId: null, parentHasParent: false }),
    ).not.toThrow();
    expect(() =>
      assertVariantTopology({ productId: 'p1', parentProductId: 'p1', parentHasParent: false }),
    ).toThrow('VARIANT_SELF_PARENT');
    expect(() =>
      assertVariantTopology({ productId: 'v2', parentProductId: 'v1', parentHasParent: true }),
    ).toThrow('VARIANT_NESTING_FORBIDDEN');
    expect(() =>
      assertVariantTopology({ productId: 'v1', parentProductId: 'p1', parentHasParent: false }),
    ).not.toThrow();
  });

  it('resolves variant price precedence: override → parent list → variant list', () => {
    expect(
      resolveVariantUnitPriceCents({
        variantListPriceCents: 900,
        parentListPriceCents: 800,
        variantOverrideCents: 700,
        parentCatalogPriceCents: 600,
      }),
    ).toBe(700);
    expect(
      resolveVariantUnitPriceCents({
        variantListPriceCents: 900,
        parentListPriceCents: 800,
        variantOverrideCents: null,
        parentCatalogPriceCents: 600,
      }),
    ).toBe(800);
    expect(
      resolveVariantUnitPriceCents({
        variantListPriceCents: 900,
        parentListPriceCents: null,
        variantOverrideCents: null,
        parentCatalogPriceCents: 600,
      }),
    ).toBe(900);
    expect(() =>
      resolveVariantUnitPriceCents({
        variantListPriceCents: -1,
        parentListPriceCents: null,
        variantOverrideCents: null,
        parentCatalogPriceCents: 600,
      }),
    ).toThrow('INVALID_UNIT_PRICE');
    expect(() =>
      resolveVariantUnitPriceCents({
        variantListPriceCents: null,
        parentListPriceCents: null,
        variantOverrideCents: null,
        parentCatalogPriceCents: 1.5,
      }),
    ).toThrow('INVALID_UNIT_PRICE');
  });
});
