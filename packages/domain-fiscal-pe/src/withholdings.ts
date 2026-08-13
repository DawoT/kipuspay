/**
 * Percepciones / Retenciones / Detracciones — Backlog v10 P1c
 * (Arquitectura §5.2c, ADR-FISCAL-005).
 *
 * Tasas cerradas por catálogo (basis points, INTEGER), redondeo en cents
 * server-side. La percepción se cobra con la venta a cliente agente; la
 * retención se descuenta al pagar a proveedor sujeto; la detracción registra
 * la operación sujeta hasta el depósito. Puro: sin D1, sin deps de red.
 */

/** Percepción: tasas por categoría (porcentaje en basis points). */
export const PERCEPTION_RATES = { goods: 200, other: 50 } as const;

/** Retención: tasas por categoría (basis points). */
export const RETENTION_RATES = { goods: 300, services: 600, commissions: 1200 } as const;

/** Detracción: tasas por categoría del anexo 2 (basis points). */
export const DETRACTION_RATES = { transport: 400, goods: 400, service: 1200 } as const;

export type PerceptionCategory = keyof typeof PERCEPTION_RATES;
export type RetentionCategory = keyof typeof RETENTION_RATES;
export type DetractionCategory = keyof typeof DETRACTION_RATES;

/** Redondeo de la base al entero más cercano (server-side, invariante 1/7). */
function roundedAmountCents(baseAmountCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
    throw new Error('INVALID_BASE_AMOUNT');
  }
  if (!Number.isInteger(rateBps) || rateBps <= 0) {
    throw new Error('INVALID_RATE');
  }
  return Math.round((baseAmountCents * rateBps) / 10_000);
}

export function computePerceptionCents(
  baseAmountCents: number,
  category: PerceptionCategory,
): number {
  return roundedAmountCents(baseAmountCents, PERCEPTION_RATES[category]);
}

export function computeRetentionCents(
  baseAmountCents: number,
  category: RetentionCategory,
): number {
  return roundedAmountCents(baseAmountCents, RETENTION_RATES[category]);
}

export function computeDetractionCents(
  baseAmountCents: number,
  category: DetractionCategory,
): number {
  return roundedAmountCents(baseAmountCents, DETRACTION_RATES[category]);
}

export function assertPerceptionCategory(category: string): PerceptionCategory {
  if (!(category in PERCEPTION_RATES)) throw new Error('INVALID_PERCEPTION_CATEGORY');
  return category as PerceptionCategory;
}

export function assertRetentionCategory(category: string): RetentionCategory {
  if (!(category in RETENTION_RATES)) throw new Error('INVALID_RETENTION_CATEGORY');
  return category as RetentionCategory;
}
