/**
 * Validación tipada de cantidades en microunidades (US-04, CAL-01/V-21,
 * Arquitectura §13.3): una cantidad `*Microunits` llega como INTEGER entero
 * seguro ≥ 0 y jamás se coerciona con `Number()` — `Number(true)=1`,
 * `Number([])=0`, `Number(null)=0`, `Number('0x10')=16` silencian tipos
 * inválidos y degradan el entero a float (drift en diferencias de stock y en
 * costos derivados). Fail-closed y never-throw: resultado discriminado
 * `{ok, errorName}` con motivos estables, mismo contrato que
 * `parseMoneyToCents` para dinero (src/http/money-input.ts).
 *
 * Shape 400 compartido: toda ruta que valide un campo `*Microunits` del body
 * responde ante un tipo inválido exactamente QUANTITY_MICROUNITS_BAD_REQUEST
 * (400 estable, sin 500 ni NaN). Excepción documentada: GET
 * /api/inventory/locations/picking conserva su shape preexistente
 * `{ error: 'invalid picking query', code: 'BAD_REQUEST' }`.
 */

export type QuantityParseErrorName = 'INVALID_QUANTITY' | 'negative_zero' | 'quantity_out_of_range';

/** Resultado discriminado de parseQuantityMicrounits / parseQuantityMicrounitsQuery. */
export type QuantityParseResult =
  { ok: true; microunits: number } | { ok: false; errorName: QuantityParseErrorName };

/**
 * Shape 400 estable y compartido para `*Microunits` inválidos (US-04): las
 * rutas lo devuelven tal cual, sin filtrar detalles del valor recibido.
 */
export const QUANTITY_MICROUNITS_BAD_REQUEST = {
  error: 'invalid quantity microunits',
  code: 'INVALID_QUANTITY_MICROUNITS',
} as const;

/**
 * Valida una cantidad `*Microunits` del body JSON (fail-closed, sin coerción,
 * never-throw):
 * - solo `typeof value === 'number'` entero es válido (strings —incluido
 *   '42'—, booleanos, arrays, null y objetos → 'INVALID_QUANTITY');
 * - NaN / ±Infinity / fraccionarios → 'INVALID_QUANTITY' (no representan
 *   cantidad alguna y delatan un artefacto float);
 * - |valor| > MAX_SAFE_INTEGER → 'quantity_out_of_range' (el valor ya no es
 *   exacto: no se redondea silenciosamente);
 * - negativo → 'INVALID_QUANTITY' (una cantidad de stock es ≥ 0);
 * - -0 → 'negative_zero' (misma discriminación que el dinero, US-06).
 */
export function parseQuantityMicrounits(value: unknown): QuantityParseResult {
  if (typeof value !== 'number') return { ok: false, errorName: 'INVALID_QUANTITY' };
  if (!Number.isInteger(value)) return { ok: false, errorName: 'INVALID_QUANTITY' };
  if (Object.is(value, -0)) return { ok: false, errorName: 'negative_zero' };
  if (value < 0) return { ok: false, errorName: 'INVALID_QUANTITY' };
  if (value > Number.MAX_SAFE_INTEGER) return { ok: false, errorName: 'quantity_out_of_range' };
  return { ok: true, microunits: value };
}

/** Techo canónico como texto: '9007199254740991' (16 dígitos). */
const MAX_SAFE_TEXT = String(Number.MAX_SAFE_INTEGER);

/** Gramática canónica de una cantidad en query string: dígitos sin signo. */
const CANONICAL_UINT = /^(0|[1-9]\d*)$/;

/**
 * Valida la cantidad de un query param (`GET .../picking?quantityMicrounits=42`),
 * donde el valor llega siempre como string: gramática canónica de dígitos sin
 * ceros a la izquierda, sin signo, sin exponente ni prefijos hex ('0x10' se
 * rechaza; el parser legado `Number()` lo aceptaba como 16). Guard de longitud
 * ANTES de convertir: un texto más largo (o lexicográficamente mayor) que
 * MAX_SAFE_INTEGER → 'quantity_out_of_range', sin recorrer dígitos gigantes.
 * Conversión por aritmética de dígitos (prohibido parseFloat/Number, V-21);
 * el resultado queda verificado dentro del rango seguro por el guard.
 */
export function parseQuantityMicrounitsQuery(raw: string | undefined): QuantityParseResult {
  if (typeof raw !== 'string') return { ok: false, errorName: 'INVALID_QUANTITY' };
  const text = raw.trim();
  if (!CANONICAL_UINT.test(text)) return { ok: false, errorName: 'INVALID_QUANTITY' };
  if (
    text.length > MAX_SAFE_TEXT.length ||
    (text.length === MAX_SAFE_TEXT.length && text > MAX_SAFE_TEXT)
  ) {
    return { ok: false, errorName: 'quantity_out_of_range' };
  }
  let microunits = 0;
  for (const digit of text) microunits = microunits * 10 + (digit.charCodeAt(0) - 48);
  return { ok: true, microunits };
}

/**
 * Costo derivado `microunits × unitCostCents / 1_000_000` en cents con
 * aritmética exacta (auditoría US-04 de inventory-ops-routes.ts, diff_value_cents):
 * el producto directo desborda MAX_SAFE_INTEGER mucho antes de que los
 * operandos lo estén (10 000 unidades × 1 000 000 cents ya pierde centavos),
 * así que se separa parte entera y fracción de la cantidad y se redondea
 * half-up con enteros (`%` y resta son exactos en safe integers; jamás se
 * divide un no-múltiplo). Devuelve null (fail-closed) si algún operando no es
 * un entero seguro o si el resultado saldría del rango exacto: el llamador
 * rechaza con motivo estable en vez de persistir un centavo inventado.
 */
export function deriveMicrounitValueCents(
  microunits: number,
  unitCostCents: number,
): number | null {
  if (!Number.isSafeInteger(microunits) || !Number.isSafeInteger(unitCostCents)) return null;
  const whole = Math.trunc(microunits / 1_000_000);
  const frac = microunits - whole * 1_000_000; // exacto: |frac| < 1_000_000
  const cost = unitCostCents;
  if (cost === 0) return 0;
  // Guards de rango ANTES de multiplicar (verificar post-multiplicación no
  // sirve: el float ya perdió el valor verdadero).
  if (whole !== 0 && Math.abs(whole) > Math.floor(Number.MAX_SAFE_INTEGER / Math.abs(cost))) {
    return null;
  }
  const wholeCents = whole * cost; // exacto por el guard
  if (frac !== 0 && Math.abs(cost) > Math.floor(Number.MAX_SAFE_INTEGER / 1_000_000)) {
    return null; // frac × cost ≤ 999_999 × cost debe caber en safe integer
  }
  const scaled = frac * cost; // exacto por el guard
  // Redondeo half-up (hacia +∞, igual que Math.round) sin dividir floats:
  // cociente y resto por aritmética de enteros exacta.
  const remainder = ((scaled % 1_000_000) + 1_000_000) % 1_000_000;
  const quotient = (scaled - remainder) / 1_000_000;
  const fracCents = quotient + (remainder * 2 >= 1_000_000 ? 1 : 0);
  const total = wholeCents + fracCents;
  if (Math.abs(wholeCents) > Number.MAX_SAFE_INTEGER - Math.abs(fracCents)) return null;
  return Number.isSafeInteger(total) ? total : null;
}
