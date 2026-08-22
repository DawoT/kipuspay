/**
 * Validación de entrada HTTP de cantidades en microunidades (US-05, CAL-01,
 * V-21): los 5 sitios que coaccionaban con `Number()` sobre
 * `*Microunits` aceptaban fail-open demostrado en runtime — '\u00A012' y
 * ' 12 ' pasaban como cantidad válida 12, true→1 y []→0 se enmascaraban con
 * checks >0 aguas abajo.
 *
 * AC3 — la regla de dominio vive UNA vez: una cantidad en microunidades es un
 * entero seguro ≥ mínimo del caso de uso. El mínimo lo declara el caso de uso
 * (`ENTERED_QUANTITY_RULE` mínimo 1 para cantidades ingresadas de
 * venta/compra/transferencia/picking; `COUNT_QUANTITY_RULE` mínimo 0 para el
 * conteo físico, donde confirmar 0 stock es válido). Los códigos HTTP por
 * endpoint son mapas estables de ESTE veredicto único, no reglas propias.
 *
 * Resultado discriminado {ok,microunits|errorName} con motivos estables:
 * - MICROUNITS_INPUT_INVALID: tipo no numérico o texto fuera de la gramática
 *   canónica ^[0-9]+$ (sin trim: ' 12 ' y '\u00A012' se rechazan);
 * - MICROUNITS_INPUT_OUT_OF_RANGE: número no entero seguro (NaN/Infinity/1.5)
 *   o bajo el mínimo del caso de uso, o dígito-texto que excede
 *   MAX_SAFE_INTEGER.
 */

export const MICROUNITS_INPUT_INVALID = 'MICROUNITS_INPUT_INVALID';
export const MICROUNITS_INPUT_OUT_OF_RANGE = 'MICROUNITS_INPUT_OUT_OF_RANGE';

export type MicrounitsInputErrorName =
  | 'MICROUNITS_INPUT_INVALID'
  | 'MICROUNITS_INPUT_OUT_OF_RANGE';

/** Resultado discriminado del parser único de microunidades (US-05). */
export type MicrounitsInputResult =
  | { ok: true; microunits: number }
  | { ok: false; errorName: MicrounitsInputErrorName };

/** Mínimo inclusive de la regla única (AC3): lo fija el caso de uso. */
export interface MicrounitsRule {
  readonly minimumInclusive: number;
}

/** Cantidades ingresadas (cotización, comanda, devolución a proveedor, transferencia, picking): > 0. */
export const ENTERED_QUANTITY_RULE: MicrounitsRule = { minimumInclusive: 1 };

/** Conteo físico: contar 0 es un resultado válido (≥ 0). */
export const COUNT_QUANTITY_RULE: MicrounitsRule = { minimumInclusive: 0 };

/**
 * Gramática canónica de texto de cantidades: dígitos ASCII sin signo ni
 * puntos y SIN ceros a la izquierda (US-01: '007' no duplica representaciones
 * del mismo monto; el cero legítimo es '0').
 */
const CANONICAL_COUNT_PATTERN = /^(0|[1-9][0-9]*)$/;

const INVALID: MicrounitsInputResult = { ok: false, errorName: MICROUNITS_INPUT_INVALID };

/**
 * Parser tipado fail-closed de microunidades (única definición de la regla
 * 0/negativos, AC3):
 * - number → entero seguro ≥ minimumInclusive; NaN/Infinity/1.5 son números
 *   fuera de rango, nunca se coaccionan;
 * - string → gramática canónica ^(0|[1-9][0-9]*)$ evaluada por dígitos SIN
 *   float (sin trim y sin Number/parseFloat, V-21): '12' pasa, ' 12 ',
 *   '\u00A012', '+12', '1e3', '007' se rechazan;
 * - cualquier otro tipo (boolean/array/null/undefined/object) → INVALID:
 *   el fail-open de la coerción silenciosa queda cerrado con 400 estable.
 */
export function parseMicrounitsInput(value: unknown, rule: MicrounitsRule): MicrounitsInputResult {
  if (typeof value === 'number') return microunitsFromInteger(value, rule);
  if (typeof value === 'string') {
    // Query params y strings de legado: solo dígitos canónicos, sin trim
    // (' 12 ' / '\u00A012' ya no equivalen a 12).
    if (!CANONICAL_COUNT_PATTERN.test(value)) return INVALID;
    const parsed = digitsToSafeInt(value);
    if (parsed === null) {
      return { ok: false, errorName: MICROUNITS_INPUT_OUT_OF_RANGE };
    }
    return microunitsFromInteger(parsed, rule);
  }
  return INVALID;
}

/** Regla única aplicada a un entero ya tipado (AC3): rango seguro + mínimo. */
function microunitsFromInteger(value: number, rule: MicrounitsRule): MicrounitsInputResult {
  if (!Number.isSafeInteger(value) || value < rule.minimumInclusive) {
    return { ok: false, errorName: MICROUNITS_INPUT_OUT_OF_RANGE };
  }
  return { ok: true, microunits: value };
}

/**
 * Dígitos → entero exacto sin float (mismo método de dígitos que money-input,
 * CAL-01): null si el texto excede MAX_SAFE_INTEGER. El valor jamás pasa por
 * Number()/parseFloat — la exactitud en montos grandes es parte del AC.
 */
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
