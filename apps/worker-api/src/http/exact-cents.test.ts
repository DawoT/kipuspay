import { describe, expect, it } from 'vitest';

import { diffValueCentsExact } from './exact-cents.js';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/** Verdad exacta BigInt de Math.round-semántica (mitad hacia +∞) para comparar. */
function bigintTruth(differenceMicrounits: number, unitCostCents: number): number {
  const product = BigInt(differenceMicrounits) * BigInt(unitCostCents);
  const SCALE = 1_000_000n;
  const q = product / SCALE;
  const cents =
    product >= 0n
      ? (product % SCALE) * 2n >= SCALE
        ? q + 1n
        : q
      : -(product % SCALE) * 2n > SCALE
        ? q - 1n
        : q;
  return Number(cents);
}

describe('diffValueCentsExact (US-03: costo derivado auditado, sin drift de centavos)', () => {
  it('montos chicos replican la semántica legacy de Math.round', () => {
    expect(diffValueCentsExact(0, 100)).toBe(0);
    expect(diffValueCentsExact(2_000_000, 125)).toBe(250);
    expect(diffValueCentsExact(-2_000_000, 125)).toBe(-250);
    expect(diffValueCentsExact(10_000_000 - 2_000_000, 100)).toBe(800);
  });

  it('redondeo mitad hacia +∞ idéntico a Math.round (incluido el caso asimétrico negativo)', () => {
    expect(diffValueCentsExact(1_500_000, 1)).toBe(2); // Math.round(1.5) === 2
    expect(diffValueCentsExact(-1_500_000, 1)).toBe(-1); // Math.round(-1.5) === -1
    expect(diffValueCentsExact(-1_600_000, 1)).toBe(-2); // Math.round(-1.6) === -2
    expect(diffValueCentsExact(-1_400_000, 1)).toBe(-1); // Math.round(-1.4) === -1
  });

  it('MAX_SAFE_INTEGER microunits × 1 cent es exacto', () => {
    // 9007199254740991 / 1e6 = 9007199254.740991 → mitad hacia +∞ → ...255
    expect(diffValueCentsExact(MAX_SAFE, 1)).toBe(9007199255);
  });

  it('MAX_SAFE_INTEGER microunits × 3 cents coincide con la verdad BigInt (producto > 2^53)', () => {
    expect(diffValueCentsExact(MAX_SAFE, 3)).toBe(bigintTruth(MAX_SAFE, 3));
    expect(diffValueCentsExact(MAX_SAFE, 3)).toBe(27021597764);
  });

  it('regresión de drift: el camino float64 previo perdía 1 cent con producto > 2^53', () => {
    const differenceMicrounits = 3002399752833333;
    const unitCostCents = 3;
    // El producto entero real es 9007199258499999 (> 2^53): float64 lo
    // redondeaba a ...500000 y Math.round derivaba 9007199259 en vez de
    // 9007199258 — un centavo de drift por línea de conteo.
    const legacyFloat64 = Math.round((differenceMicrounits * unitCostCents) / 1_000_000);
    expect(diffValueCentsExact(differenceMicrounits, unitCostCents)).toBe(
      bigintTruth(differenceMicrounits, unitCostCents),
    );
    expect(diffValueCentsExact(differenceMicrounits, unitCostCents)).toBe(9007199258);
    expect(diffValueCentsExact(differenceMicrounits, unitCostCents)).not.toBe(legacyFloat64);
  });

  it('fail-closed: entradas no enteras seguras lanzan MICROUNITS_COST_INPUT_INVALID', () => {
    expect(() => diffValueCentsExact(MAX_SAFE + 1, 1)).toThrow('MICROUNITS_COST_INPUT_INVALID');
    expect(() => diffValueCentsExact(1.5, 1)).toThrow('MICROUNITS_COST_INPUT_INVALID');
    expect(() => diffValueCentsExact(Number.NaN, 1)).toThrow('MICROUNITS_COST_INPUT_INVALID');
    expect(() => diffValueCentsExact(1, Number.POSITIVE_INFINITY)).toThrow(
      'MICROUNITS_COST_INPUT_INVALID',
    );
  });

  it('fail-closed: resultado fuera del rango seguro lanza MICROUNITS_COST_OUT_OF_RANGE', () => {
    expect(() => diffValueCentsExact(MAX_SAFE, 2_000_000)).toThrow('MICROUNITS_COST_OUT_OF_RANGE');
    expect(() => diffValueCentsExact(-MAX_SAFE, 2_000_000)).toThrow(
      'MICROUNITS_COST_OUT_OF_RANGE',
    );
  });
});
