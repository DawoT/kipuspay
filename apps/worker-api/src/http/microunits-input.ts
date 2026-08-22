/**
 * Validación canónica de cantidades `*Microunits` en entrada HTTP (US-03,
 * "Matriz de frontera canónica: un parser, cinco sitios, veredictos
 * idénticos", CAL-01, V-21): los cinco sitios que coaccionaban con `Number()`
 * crudo convertían tipos inválidos en cantidades válidas (true→1, [5]→5,
 * '+1'→1, ' 42 '→42) y derivaban veredictos divergentes (422 UOM_*, 400,
 * 422). Aquí la validación es tipada y fail-closed:
 * - `number`: solo enteros finitos (un microunit es un entero; 1.5 no es una
 *   cantidad); negativos, -0 y |x| > MAX_SAFE_INTEGER → fuera de rango;
 * - `string`: solo texto canónico de dígitos `-?(0|[1-9]\d*)` (query strings
 *   del HTTP), sin `+`, sin espacios (a diferencia del dinero US-06, una
 *   cantidad no tolera `' 42 '`), sin decimales y sin ceros a la izquierda;
 * - cualquier otro tipo (boolean, array, objeto, null, undefined, bigint) →
 *   inválido. Nunca coacciona: devuelve un resultado discriminado
 *   {ok,errorName} con motivos estables (`MICROUNITS_INVALID` para
 *   tipo/forma, `MICROUNITS_OUT_OF_RANGE` para signo o rango) y el sitio
 *   HTTP responde 400 con ese código, idéntico en los cinco sitios.
 */

/** Motivos estables de rechazo de una cantidad en microunits (US-03). */
export type MicrounitsParseErrorName = 'MICROUNITS_INVALID' | 'MICROUNITS_OUT_OF_RANGE';

/** Resultado discriminado de parseMicrounits (US-03). */
export type MicrounitsParseResult =
  { ok: true; microunits: number } | { ok: false; errorName: MicrounitsParseErrorName };

/**
 * Convierte una cantidad `*Microunits` de entrada HTTP a entero seguro sin
 * coaccionar (US-03, V-21): number entero seguro ≥ 0 o texto canónico de
 * dígitos; cualquier otra forma → {ok:false} con motivo estable.
 */
export function parseMicrounits(value: unknown): MicrounitsParseResult {
  if (typeof value === 'number') return numberToMicrounits(value);
  if (typeof value !== 'string') return { ok: false, errorName: 'MICROUNITS_INVALID' };
  return digitsTextToMicrounits(value);
}

/** 400 estable e idéntico en los cinco sitios para un rechazo de microunits. */
export function microunitsErrorResult(errorName: MicrounitsParseErrorName): {
  status: 400;
  body: { error: MicrounitsParseErrorName; code: MicrounitsParseErrorName };
} {
  return { status: 400, body: { error: errorName, code: errorName } };
}

/**
 * number → microunits: entero seguro no negativo se preserva; no entero,
 * NaN o ±Infinity → MICROUNITS_INVALID; negativo (incluye -0) o sobre
 * MAX_SAFE_INTEGER → MICROUNITS_OUT_OF_RANGE.
 */
function numberToMicrounits(value: number): MicrounitsParseResult {
  if (!Number.isInteger(value)) return { ok: false, errorName: 'MICROUNITS_INVALID' };
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    return { ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' };
  }
  return { ok: true, microunits: value };
}

/** Gramática canónica de cantidades: signo opcional + 0|[1-9]\d* (sin decimales). */
const CANONICAL_MICROUNITS_PATTERN = /^-?(0|[1-9]\d*)$/;

/**
 * Texto (query string) → microunits por dígitos, sin parseFloat/Number
 * (V-21): la cadena debe respetar -?(0|[1-9]\d*) — '+1', ' 42 ', '5.0' y
 * '007' no son canónicos → MICROUNITS_INVALID; '-5' y desbordes de
 * MAX_SAFE_INTEGER → MICROUNITS_OUT_OF_RANGE.
 */
function digitsTextToMicrounits(value: string): MicrounitsParseResult {
  if (!CANONICAL_MICROUNITS_PATTERN.test(value)) {
    return { ok: false, errorName: 'MICROUNITS_INVALID' };
  }
  // Cantidad nunca negativa: '-5' y '-0' son fuera de rango (mismo veredicto
  // que sus equivalentes number -1/-0), no una coacción a valor válido.
  if (value.startsWith('-')) return { ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' };
  const parsed = digitsToSafeInt(value);
  if (parsed === null) return { ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' };
  return { ok: true, microunits: parsed };
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

/**
 * Techo de dígitos para el wire de query/body texto (US-04 hostile): 15 dígitos
 * caben en MAX_SAFE_INTEGER; el 16.º se corta antes de aritmética de dígitos.
 */
export const MAX_MICROUNITS_DIGITS = 15;

/** Firma del guard de longitud (espía/inyectable en tests hostiles). */
export type MicrounitsLengthGuard = (digits: string) => boolean;

/** Guard de longitud canónico: 1..MAX_MICROUNITS_DIGITS dígitos. */
export function microunitsLengthGuard(digits: string): boolean {
  return digits.length >= 1 && digits.length <= MAX_MICROUNITS_DIGITS;
}

/** Parser inyectable en rutas (default = parseMicrounitsInput). */
export type MicrounitsParser = (value: unknown) => MicrounitsParseResult;

/** Solo dígitos (formato cableado GET / body texto). */
const DIGITS_ONLY_PATTERN = /^\d+$/;

/**
 * Entrada HTTP de microunits con guard de longitud inyectable (US-04 hostile):
 * reutiliza la semántica fail-closed de `parseMicrounits` y corta overflow de
 * dígitos antes de convertir. Nunca invoca valueOf/toString del input.
 */
export function parseMicrounitsInput(
  value: unknown,
  lengthGuard: MicrounitsLengthGuard = microunitsLengthGuard,
): MicrounitsParseResult {
  if (typeof value === 'string' && DIGITS_ONLY_PATTERN.test(value)) {
    if (!lengthGuard(value)) return { ok: false, errorName: 'MICROUNITS_INVALID' };
    return digitsTextToMicrounits(value);
  }
  return parseMicrounits(value);
}

/**
 * Fixture de frontera canónica (US-03): un solo conjunto de casos compartido
 * por el parser y por el test cross-site de veredictos idénticos. Cada caso
 * fija el veredicto esperado para que los cinco sitios no puedan divergir.
 */
export interface MicrounitsBoundaryCase {
  name: string;
  value: unknown;
  ok: boolean;
  microunits?: number;
  errorName?: MicrounitsParseErrorName;
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export const MICROUNITS_BOUNDARY_FIXTURE: readonly MicrounitsBoundaryCase[] = [
  // válidos
  { name: 'cero', value: 0, ok: true, microunits: 0 },
  { name: 'entero unitario', value: 1, ok: true, microunits: 1 },
  { name: 'entero positivo', value: 42, ok: true, microunits: 42 },
  { name: 'MAX_SAFE_INTEGER', value: MAX_SAFE, ok: true, microunits: MAX_SAFE },
  { name: 'texto canónico', value: '42', ok: true, microunits: 42 },
  { name: 'texto cero', value: '0', ok: true, microunits: 0 },
  { name: 'texto MAX_SAFE_INTEGER', value: '9007199254740991', ok: true, microunits: MAX_SAFE },
  // tipo inválido (antes coaccionados a cantidades válidas por Number())
  { name: 'booleano true (antes true→1)', value: true, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'booleano false', value: false, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'array [5] (antes [5]→5)', value: [5], ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'array vacío', value: [], ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'objeto', value: { toString: () => '5' }, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'null', value: null, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'bigint', value: BigInt(5), ok: false, errorName: 'MICROUNITS_INVALID' },
  // texto no canónico ('+1'→1 y ' 42 '→42 eran coacciones silenciosas)
  { name: 'signo + (antes +1→1)', value: '+1', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'espacios (antes  42 →42)', value: ' 42 ', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'vacío', value: '', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'cero a la izquierda', value: '007', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'decimal texto', value: '5.0', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'notación científica', value: '1e3', ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'texto no numérico', value: 'abc', ok: false, errorName: 'MICROUNITS_INVALID' },
  // number no entero / no finito
  { name: 'float 1.5', value: 1.5, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'artefacto float', value: 0.1 + 0.2, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'NaN', value: Number.NaN, ok: false, errorName: 'MICROUNITS_INVALID' },
  { name: 'Infinity', value: Number.POSITIVE_INFINITY, ok: false, errorName: 'MICROUNITS_INVALID' },
  {
    name: '-Infinity',
    value: Number.NEGATIVE_INFINITY,
    ok: false,
    errorName: 'MICROUNITS_INVALID',
  },
  // rango
  { name: 'negativo', value: -1, ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' },
  { name: 'menos cero', value: -0, ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' },
  {
    name: 'sobre MAX_SAFE_INTEGER',
    value: MAX_SAFE + 1,
    ok: false,
    errorName: 'MICROUNITS_OUT_OF_RANGE',
  },
  { name: 'texto negativo', value: '-5', ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' },
  { name: 'texto menos cero', value: '-0', ok: false, errorName: 'MICROUNITS_OUT_OF_RANGE' },
  {
    name: 'texto sobre MAX_SAFE_INTEGER',
    value: '9007199254740992',
    ok: false,
    errorName: 'MICROUNITS_OUT_OF_RANGE',
  },
];
