/**
 * Validación de entrada HTTP de cantidades en microunidades (CAL-01,
 * Arquitectura §13.3, objetivo V-21 de la capa de cantidades/costos):
 * los campos `*Microunits` son enteros seguros ≥ 0 y se validan por TIPO
 * (typeof), nunca con coerción `Number()`: `Number(true)=1`,
 * `Number([])=0`, `Number({valueOf(){return n}})=n` silencian basura
 * hostil. Fail-closed: cualquier tipo o forma no canónica produce
 * `{ ok: false, errorName: 'INVALID_MICROUNITS' }` → la ruta responde
 * 400 estable; jamás se invoca `valueOf`/`toString` del input (los objetos
 * circulares u hostiles no se recorren).
 */

/** Motivo estable de rechazo de una cantidad (máquina-legible). */
export type MicrounitsParseErrorName = 'INVALID_MICROUNITS';

/** Resultado discriminado de parseMicrounitsInput. */
export type MicrounitsParseResult =
  | { ok: true; microunits: number }
  | { ok: false; errorName: MicrounitsParseErrorName };

/**
 * Guard de longitud de la representación decimal: 15 dígitos máximo
 * mantiene la aritmética de dígitos dentro de MAX_SAFE_INTEGER
 * (9007199254740991 tiene 16 dígitos) sin pasar por float.
 */
export const MAX_MICROUNITS_DIGITS = 15;

/** Firma del guard de longitud (espía/inyectable en tests hostiles). */
export type MicrounitsLengthGuard = (digits: string) => boolean;

/** Guard de longitud canónico: 1..MAX_MICROUNITS_DIGITS dígitos. */
export function microunitsLengthGuard(digits: string): boolean {
  return digits.length >= 1 && digits.length <= MAX_MICROUNITS_DIGITS;
}

/** Parser de microunidades inyectable (las rutas lo aceptan como dependencia). */
export type MicrounitsParser = (value: unknown) => MicrounitsParseResult;

const INVALID: MicrounitsParseResult = { ok: false, errorName: 'INVALID_MICROUNITS' };

/** Solo dígitos decimales: el formato cableado de query params GET. */
const DIGITS_ONLY_PATTERN = /^\d+$/;

/**
 * Valida una cantidad `*Microunits` sin coerción (fail-closed):
 * - number entero seguro ≥ 0 → ok (`-0` y negativos → rechazo);
 * - string de dígitos canónicos que pasa el guard de longitud → ok vía
 *   aritmética de dígitos (sin `Number`/`parseFloat`, V-21);
 * - booleano, null, undefined, array, objeto (aunque traiga `valueOf`),
 *   NaN/Infinity/floats → INVALID_MICROUNITS, sin tocar el valor.
 */
export function parseMicrounitsInput(
  value: unknown,
  lengthGuard: MicrounitsLengthGuard = microunitsLengthGuard,
): MicrounitsParseResult {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0) return INVALID;
    return { ok: true, microunits: value };
  }
  if (typeof value === 'string' && DIGITS_ONLY_PATTERN.test(value) && lengthGuard(value)) {
    return { ok: true, microunits: digitsToMicrounits(value) };
  }
  return INVALID;
}

/** Dígitos → entero por aritmética de dígitos (el guard ya acotó la longitud). */
function digitsToMicrounits(digits: string): number {
  let acc = 0;
  for (let i = 0; i < digits.length; i++) {
    acc = acc * 10 + (digits.charCodeAt(i) - 48);
  }
  return acc;
}
