/**
 * Primitivas fiscales IGV — redondeo canónico por línea (Arquitectura §6).
 * Puro, sin D1. Dinero en cents.
 */

export const IGV_RATE_PER_MILLE = 180;

export function applyIgvCents(baseCents: number, ratePerMille: number): number {
  return Math.round((baseCents * ratePerMille) / 1000);
}

/**
 * Desglose IGV 18 % desde un total con impuesto incluido (NC/ND).
 * taxable = round(total × 1000 / 1180); igv = total − taxable. Cero float.
 */
export function splitInclusiveIgvCents(totalCents: number): {
  readonly taxableCents: number;
  readonly igvCents: number;
} {
  const taxableCents = Math.round((totalCents * 1000) / 1180);
  return { taxableCents, igvCents: totalCents - taxableCents };
}
