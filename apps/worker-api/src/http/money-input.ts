/**
 * Validación de entrada HTTP de dinero (CAL-01, Arquitectura §13.3):
 * los montos llegan como INTEGER cents y deben validarse con typeof
 * (Number(true)=1 y Number([])=0 silencian montos inválidos).
 * US-01: acepta además strings decimales y numbers float con ≤2 decimales
 * (19.99 → 1999) y los convierte a cents enteros con aritmética de dígitos
 * (prohibido parseFloat/Number sobre montos, V-21).
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
 * Convierte dinero del body a INTEGER cents sin float (US-01, US-10, CAL-01,
 * V-21):
 * - number entero seguro → ya son cents (se preserva tal cual);
 * - number finito no entero → cents por su representación decimal
 *   ("19.99" → 1999, "1.5" → 150) solo si tiene ≤ 2 decimales; sin aritmética
 *   float ni parseFloat/Number; NaN/Infinity/artefactos float → null;
 * - string decimal ("10.50" → 1050, "10" → 1000, "0.01" → 1) → cents con
 *   aritmética de dígitos, máx 2 decimales, sin parseFloat/Number;
 * - string negativo (US-10/AC1): un único signo '-' inicial compone cents
 *   negativos ("-19.99" → -1999, "-5" → -500); el cero negativo ("-0",
 *   "-0.00") se rechaza fall-closed (AC1); '+' y demás signos no se aceptan;
 * - cualquier otro valor (booleano, array, no-numérico) → null.
 */
export function parseMoneyToCents(value: unknown): number | null {
  if (typeof value === 'number') return numberToCents(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return decimalTextToCents(trimmed);
}

/**
 * number → cents sin float: un entero seguro ya son cents; un float finito se
 * convierte solo si su representación decimal tiene ≤ 2 decimales (fail-closed:
 * un artefacto de coma flotante como 0.1+0.2 jamás se redondea silenciosamente).
 * Se usa Number.isSafeInteger/Number.isFinite directos (no el type-guard
 * isMoneyInteger, cuyo predicado estrecharía value a never en este camino).
 */
function numberToCents(value: number): number | null {
  if (Number.isSafeInteger(value)) return value;
  if (!Number.isFinite(value)) return null;
  return decimalTextToCents(value.toString());
}

/**
 * "10.50"/"10.5"/"10" → cents por dígitos; null si no es decimal válido.
 * US-10/AC1: admite un único signo '-' inicial ("-19.99" → -1999, "-5" → -500);
 * el cero negativo ("-0", "-0.00") se rechaza — un monto cero no lleva signo.
 */
function decimalTextToCents(trimmed: string): number | null {
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const dot = unsigned.indexOf('.');
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? '' : unsigned.slice(dot + 1);
  // "10." incompleto y más de 2 decimales son inválidos; "10,50"/"1e3"/"+5" no son dígitos.
  if (whole === '' || frac.length > 2) return null;
  if (dot !== -1 && frac === '') return null;
  if (!isDigitsOnly(whole)) return null;
  if (dot !== -1 && !isDigitsOnly(frac)) return null;
  const cents = digitsToSafeInt(whole + frac.padEnd(2, '0'));
  if (cents === null) return null;
  // AC1: '-0' (y '-0.00') no son montos válidos — el cero no lleva signo.
  if (negative && cents === 0) return null;
  return negative ? -cents : cents;
}

/** true si s es no vacía y solo contiene dígitos ASCII 0-9. */
function isDigitsOnly(s: string): boolean {
  if (s === '') return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
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
