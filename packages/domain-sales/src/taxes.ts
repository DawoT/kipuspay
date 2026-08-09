/**
 * Primitivas fiscales IGV — redondeo canónico por línea (Arquitectura §6).
 * Puro, sin D1. Dinero en cents.
 */

export const IGV_RATE_PER_MILLE = 180;

export function applyIgvCents(baseCents: number, ratePerMille: number): number {
  return Math.round((baseCents * ratePerMille) / 1000);
}
