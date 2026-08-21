/**
 * Validación de entrada HTTP de dinero (CAL-01, Arquitectura §13.3):
 * los montos llegan como INTEGER cents y deben validarse con typeof
 * (Number(true)=1 y Number([])=0 silencian montos inválidos).
 * US-06: gramática canónica -?(0|[1-9]\d*)(\.\d{1,2})? — acepta strings
 * decimales y numbers float con ≤2 decimales (19.99 → 1999) sin ceros a la
 * izquierda (US-01: '007'/'01.50'/'00.01' se rechazan, no duplican
 * representaciones del mismo monto) y los convierte a cents
 * enteros con aritmética de dígitos (prohibido parseFloat/Number, V-21);
 * devuelve un resultado discriminado {ok,errorName} con motivos estables:
 * negative_zero / amount_out_of_range / INVALID_AMOUNT (fail-closed).
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

/**
 * Motivos estables de rechazo de un monto (US-06, CAL-01): códigos
 * máquina-legibles para el handler, no texto libre. `INVALID_AMOUNT` es el
 * genérico para insumo no parseable; `negative_zero` y `amount_out_of_range`
 * distinguen los dos fallos que el acceptance exige discriminar (motivo
 * distinguible en vez de un null mudo).
 */
export type MoneyParseErrorName = 'INVALID_AMOUNT' | 'negative_zero' | 'amount_out_of_range';

/** Resultado discriminado de parseMoneyToCents (US-06). */
export type MoneyParseResult =
  { ok: true; cents: number } | { ok: false; errorName: MoneyParseErrorName };

/**
 * Convierte dinero del body a INTEGER cents sin float (US-06, CAL-01, V-21):
 * - gramática canónica de strings: -?(0|[1-9]\d*)(\.\d{1,2})? ("10.50" →
 *   1050, "-5" → -500, "0.01" → 1) con aritmética de dígitos, máx 2
 *   decimales y sin ceros a la izquierda ('007' → 'INVALID_AMOUNT');
 * - number entero seguro → ya son cents (se preserva tal cual); -0 → rechazo
 *   con errorName 'negative_zero';
 * - number finito no entero → cents por su representación decimal solo si
 *   tiene ≤ 2 decimales; NaN/Infinity/artefactos float → 'INVALID_AMOUNT';
 * - |cents| fuera del rango seguro (9007199254740991) → 'amount_out_of_range';
 * - cualquier otro valor (booleano, array, no-numérico) → 'INVALID_AMOUNT'.
 */
export function parseMoneyToCents(value: unknown): MoneyParseResult {
  if (typeof value === 'number') return numberToCents(value);
  if (typeof value !== 'string') return { ok: false, errorName: 'INVALID_AMOUNT' };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: false, errorName: 'INVALID_AMOUNT' };
  return decimalTextToCents(trimmed);
}

/**
 * number → cents sin float: un entero seguro ya son cents (pero -0 es
 * negative_zero); un float finito se convierte solo si su representación
 * decimal tiene ≤ 2 decimales (fail-closed: un artefacto de coma flotante
 * como 0.1+0.2 jamás se redondea silenciosamente). Se usa
 * Number.isSafeInteger/Number.isFinite directos (no el type-guard
 * isMoneyInteger, cuyo predicado estrecharía value a never en este camino).
 */
function numberToCents(value: number): MoneyParseResult {
  if (Number.isSafeInteger(value)) {
    if (Object.is(value, -0)) return { ok: false, errorName: 'negative_zero' };
    return { ok: true, cents: value };
  }
  if (!Number.isFinite(value)) return { ok: false, errorName: 'INVALID_AMOUNT' };
  return decimalTextToCents(value.toString());
}

/** Gramática canónica de US-06/US-01: signo opcional + 0|[1-9]\d* + ≤2 decimales. */
const CANONICAL_MONEY_PATTERN = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/;

/**
 * "10.50"/"-5.5"/"10" → cents por dígitos con resultado discriminado: la
 * cadena debe respetar -?(0|[1-9]\d*)(\.\d{1,2})? (si no, 'INVALID_AMOUNT';
 * los ceros a la izquierda como '007' no son canónicos, US-01); |cents|
 * sobre MAX_SAFE_INTEGER → 'amount_out_of_range'; "-0"/"-0.00" →
 * 'negative_zero'. Sin parseFloat/Number: validación y aritmética solo de
 * dígitos.
 */
function decimalTextToCents(trimmed: string): MoneyParseResult {
  // "10." incompleto, "10,50"/"1e3"/"0x10"/"１００" y "+5" no son decimales
  // canónicos; validación puramente sobre la cadena.
  if (!CANONICAL_MONEY_PATTERN.test(trimmed)) {
    return { ok: false, errorName: 'INVALID_AMOUNT' };
  }
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const dot = unsigned.indexOf('.');
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? '' : unsigned.slice(dot + 1);
  const cents = digitsToSafeInt(whole + frac.padEnd(2, '0'));
  if (cents === null) return { ok: false, errorName: 'amount_out_of_range' };
  if (negative && cents === 0) return { ok: false, errorName: 'negative_zero' };
  return { ok: true, cents: negative ? -cents : cents };
}

/** Convierte una cadena de dígitos a número sin float; null si excede MAX_SAFE_INTEGER. */
function digitsToSafeInt(digits: string): number | null {
  let acc = 0;
  const max = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return null;
    if (acc > Math.floor((max - d) / 10)) return null;
    acc = acc * 10 + d;
  }
  return acc;
}
