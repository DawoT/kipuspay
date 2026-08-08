/** Sprint 31 — variantes/UOM exactas (Arquitectura §5.3 regla 16 / ADR-0015). */

export const QUANTITY_SCALE = 1_000_000;
export const UOM_FACTOR_INVALID = 'UOM_FACTOR_INVALID';
export const UOM_CODE_INVALID = 'UOM_CODE_INVALID';
export const QTY_OVERFLOW = 'QTY_OVERFLOW';
export const VARIANT_SELF_PARENT = 'VARIANT_SELF_PARENT';
export const VARIANT_NESTING_FORBIDDEN = 'VARIANT_NESTING_FORBIDDEN';

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Convierte una cantidad ingresada a microunidades base, half-up determinista. */
export function convertEnteredToBaseMicrounits(input: {
  readonly enteredQuantityMicrounits: number;
  readonly factorNumerator: number;
  readonly factorDenominator: number;
}): number {
  if (!positiveSafeInteger(input.enteredQuantityMicrounits)) {
    throw new Error('UOM_QUANTITY_INVALID');
  }
  if (
    !positiveSafeInteger(input.factorNumerator) ||
    !positiveSafeInteger(input.factorDenominator)
  ) {
    throw new Error(UOM_FACTOR_INVALID);
  }

  const numerator = BigInt(input.enteredQuantityMicrounits) * BigInt(input.factorNumerator);
  const denominator = BigInt(input.factorDenominator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER) || rounded <= 0n) {
    throw new Error(QTY_OVERFLOW);
  }
  return Number(rounded);
}

export function normalizeUomCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!code || code.length > 12 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error(UOM_CODE_INVALID);
  }
  return code;
}

export function assertVariantTopology(input: {
  readonly productId: string;
  readonly parentProductId: string | null;
  readonly parentHasParent: boolean;
}): void {
  if (!input.parentProductId) return;
  if (input.productId === input.parentProductId) throw new Error(VARIANT_SELF_PARENT);
  if (input.parentHasParent) throw new Error(VARIANT_NESTING_FORBIDDEN);
}

function assertOptionalCents(value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_UNIT_PRICE');
  }
}

/** Precio de venta de la variante: override → lista padre → lista variante (spec regla 16; ADR-0015 §5). */
export function resolveVariantUnitPriceCents(input: {
  readonly variantListPriceCents: number | null;
  readonly parentListPriceCents: number | null;
  readonly variantOverrideCents: number | null;
  readonly parentCatalogPriceCents: number;
}): number {
  assertOptionalCents(input.variantListPriceCents);
  assertOptionalCents(input.parentListPriceCents);
  assertOptionalCents(input.variantOverrideCents);
  if (!Number.isSafeInteger(input.parentCatalogPriceCents) || input.parentCatalogPriceCents < 0) {
    throw new Error('INVALID_UNIT_PRICE');
  }
  return (
    input.variantOverrideCents ??
    input.parentListPriceCents ??
    input.variantListPriceCents ??
    input.parentCatalogPriceCents
  );
}
