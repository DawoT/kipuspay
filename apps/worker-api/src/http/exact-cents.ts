/**
 * Aritmética exacta para el costo derivado microunits × cents (US-03,
 * CAL-01, V-21): el cálculo float64 `Math.round((d * u) / 1_000_000)` pierde
 * precisión cuando el producto intermedio supera 2^53 (p. ej.
 * MAX_SAFE_INTEGER microunits × 3 cents ya deriva en el doble). Aquí el
 * producto se hace en BigInt (exacto, sin drift de centavos), el redondeo
 * replica la semántica de Math.round (mitad hacia +∞) y el resultado se
 * audita con guard de rango: entradas no enteras seguras o un costo fuera
 * del rango seguro lanzan con código estable (fail-closed).
 */

/** Escala microunits → unidades: 1_000_000. */
const SCALE = 1_000_000n;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Costo derivado exacto en cents de una diferencia en microunits por su
 * costo unitario en cents (US-03): producto BigInt sin drift + redondeo
 * half-hacia-+∞ idéntico a Math.round + guard de rango seguro.
 *
 * Lanza (fail-closed, códigos estables que la ruta traduce a 422):
 * - 'MICROUNITS_COST_INPUT_INVALID': entrada no finita o no entero seguro;
 * - 'MICROUNITS_COST_OUT_OF_RANGE': |resultado| sobre MAX_SAFE_INTEGER.
 */
export function diffValueCentsExact(differenceMicrounits: number, unitCostCents: number): number {
  if (!Number.isSafeInteger(differenceMicrounits) || !Number.isSafeInteger(unitCostCents)) {
    throw new Error('MICROUNITS_COST_INPUT_INVALID');
  }
  const product = BigInt(differenceMicrounits) * BigInt(unitCostCents);
  let cents: bigint;
  if (product >= 0n) {
    // Mitad hacia arriba: Math.round(1.5) === 2.
    const q = product / SCALE;
    cents = (product % SCALE) * 2n >= SCALE ? q + 1n : q;
  } else {
    // Mitad hacia +∞: Math.round(-1.5) === -1 (no simétrico).
    const q = product / SCALE;
    cents = -(product % SCALE) * 2n > SCALE ? q - 1n : q;
  }
  if (cents > MAX_SAFE || cents < -MAX_SAFE) {
    throw new Error('MICROUNITS_COST_OUT_OF_RANGE');
  }
  return Number(cents);
}
