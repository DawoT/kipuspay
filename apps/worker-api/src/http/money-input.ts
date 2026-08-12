/**
 * Validación de entrada HTTP de dinero (CAL-01, Arquitectura §13.3):
 * los montos llegan como INTEGER cents y deben validarse con typeof
 * (Number(true)=1 y Number([])=0 silencian montos inválidos).
 */

/** true si value es un entero seguro (dinero en cents o conteos). */
export function isMoneyInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** true si value es un número finito (ratios como ratePercent). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Convierte un ratio del body a número finito, o null si no lo es. */
export function parseFiniteNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

/** Convierte un montop del body a entero cents, o null si no es entero seguro. */
export function parseMoneyInteger(value: unknown): number | null {
  return isMoneyInteger(value) ? value : null;
}
