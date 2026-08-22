/**
 * US-05 — Fixture COMPARTIDO: matriz de frontera parametrizada de cantidades
 * en *Microunits contra los 5 endpoints que las ingieren (los 5 sitios donde
 * vivía el `Number()` silencioso):
 *
 *  1. POST /api/sales/quotes                     — items[].enteredQuantityMicrounits
 *  2. POST /api/sales/layaways                   — items[].enteredQuantityMicrounits
 *  3. POST /api/purchasing/returns               — items[].enteredQuantityMicrounits
 *  4. POST /api/inventory/locations/transfer     — body.quantityMicrounits
 *  5. GET  /api/inventory/locations/picking      — query.quantityMicrounits (texto crudo)
 *
 * Cada celda declara su expected EXPLÍCITO (guard o aceptación con valor
 * exacto); el driver (`microunits-boundary-matrix.test.ts`) hace it.each de la
 * MISMA tabla contra los 5 endpoints y aserta status + body.code exactos por
 * celda. Sin esta matriz, el fail-open de '\u00A012' y true pasó desapercibido:
 * aquí toda frontera es una decisión documentada, nunca un accidente de
 * coerción (CAL-01/V-21, Arquitectura §13.3).
 */
import type { MicrounitParseErrorName } from './money-input.js';

/** Endpoint id canónico (path registrado en index.ts, contrato V-28). */
export type MicrounitsEndpointId =
  | 'POST /api/sales/quotes'
  | 'POST /api/sales/layaways'
  | 'POST /api/purchasing/returns'
  | 'POST /api/inventory/locations/transfer'
  | 'GET /api/inventory/locations/picking';

export interface MicrounitsBoundaryCell {
  /** id estable de la celda dentro de la matriz compartida. */
  readonly id: string;
  /** familia de frontera (documenta POR QUÉ existe la celda). */
  readonly group:
    | 'hostile-type'
    | 'non-canonical-text'
    | 'out-of-domain'
    | 'accepted-boundary';
  /** insumo crudo tal como llegaría del JSON body / query string. */
  readonly value: unknown;
  /**
   * Guard esperado de parseQuantityMicrounits; null = celda ACEPTADA (la ruta
   * sigue a la capa atómica con status 200 y SIN body.code).
   */
  readonly expectedGuard: MicrounitParseErrorName | null;
  /**
   * Solo celdas accepted: valor EXACTO en microunits que debe recibir la capa
   * atómica (identidad bit a bit, sin drift float — p. ej. MAX_SAFE_INTEGER).
   */
  readonly expectedMicrounits?: number;
}

/**
 * La matriz compartida. Orden por familia; cada entrada cita el comportamiento
 * que Number() silenciaba ([]→0, true→1, '0x10'→16, ' 12 '→12).
 */
export const MICROUNITS_BOUNDARY_CELLS: readonly MicrounitsBoundaryCell[] = [
  // ── Tipos hostiles: Number() los coaccionaba en silencio ─────────────────
  { id: 'boolean-true', group: 'hostile-type', value: true, expectedGuard: 'INVALID_QUANTITY' },
  { id: 'boolean-false', group: 'hostile-type', value: false, expectedGuard: 'INVALID_QUANTITY' },
  { id: 'null', group: 'hostile-type', value: null, expectedGuard: 'INVALID_QUANTITY' },
  { id: 'undefined', group: 'hostile-type', value: undefined, expectedGuard: 'INVALID_QUANTITY' },
  { id: 'empty-array', group: 'hostile-type', value: [], expectedGuard: 'INVALID_QUANTITY' },
  { id: 'array-with-number', group: 'hostile-type', value: [5], expectedGuard: 'INVALID_QUANTITY' },
  { id: 'plain-object', group: 'hostile-type', value: {}, expectedGuard: 'INVALID_QUANTITY' },

  // ── Texto no canónico: sintaxis que Number() aceptaba como número ────────
  { id: 'empty-string', group: 'non-canonical-text', value: '', expectedGuard: 'INVALID_QUANTITY' },
  {
    id: 'blank-string',
    group: 'non-canonical-text',
    value: '   ',
    expectedGuard: 'INVALID_QUANTITY',
  },
  { id: 'letters', group: 'non-canonical-text', value: 'abc', expectedGuard: 'INVALID_QUANTITY' },
  // '0x10' → 16 con Number(): pasaba el isSafeInteger posterior.
  { id: 'hex-literal', group: 'non-canonical-text', value: '0x10', expectedGuard: 'INVALID_QUANTITY' },
  // '1e3' → 1000 con Number().
  {
    id: 'exponent-notation',
    group: 'non-canonical-text',
    value: '1e3',
    expectedGuard: 'INVALID_QUANTITY',
  },
  { id: 'explicit-plus', group: 'non-canonical-text', value: '+5', expectedGuard: 'INVALID_QUANTITY' },
  { id: 'negative-sign', group: 'non-canonical-text', value: '-1', expectedGuard: 'INVALID_QUANTITY' },
  // Cero a la izquierda: '007' duplicaría la representación de 7.
  {
    id: 'leading-zero',
    group: 'non-canonical-text',
    value: '007',
    expectedGuard: 'INVALID_QUANTITY',
  },
  // Decimal: microunits es un CONTEO entero, no un float.
  {
    id: 'decimal-string',
    group: 'non-canonical-text',
    value: '1.5',
    expectedGuard: 'INVALID_QUANTITY',
  },
  // Dígitos full-width U+FF11..: visualmente '100', no son ASCII \d.
  {
    id: 'fullwidth-digits',
    group: 'non-canonical-text',
    value: '１００',
    expectedGuard: 'INVALID_QUANTITY',
  },
  // Dígitos arábigos U+0661/U+0662: visualmente '12', no son ASCII \d.
  {
    id: 'arabic-indic-digits',
    group: 'non-canonical-text',
    value: '١٢',
    expectedGuard: 'INVALID_QUANTITY',
  },
  // Bidi RLO U+202E: invisible, no lo limpia trim(), jamás es cantidad.
  {
    id: 'bidi-override-prefix',
    group: 'non-canonical-text',
    value: '\u202E100',
    expectedGuard: 'INVALID_QUANTITY',
  },  // Inyección SQL embebida: fail-closed, jamás se interpreta.
  {
    id: 'sql-injection-payload',
    group: 'non-canonical-text',
    value: '1; DROP TABLE products--',
    expectedGuard: 'INVALID_QUANTITY',
  },

  // ── Fuera del dominio 1..MAX_SAFE_INTEGER (parseable pero inválido) ───────
  // 0: []→0 con Number() pasaba el isSafeInteger de la capa atómica.
  { id: 'zero-number', group: 'out-of-domain', value: 0, expectedGuard: 'QUANTITY_OUT_OF_RANGE' },
  { id: 'negative-number', group: 'out-of-domain', value: -1, expectedGuard: 'QUANTITY_OUT_OF_RANGE' },
  // -0 es safe integer para isSafeInteger: hay que distinguirlo explícito.
  { id: 'negative-zero', group: 'out-of-domain', value: -0, expectedGuard: 'QUANTITY_OUT_OF_RANGE' },
  {
    id: 'float-number',
    group: 'out-of-domain',
    value: 1.5,
    expectedGuard: 'QUANTITY_OUT_OF_RANGE',
  },
  { id: 'NaN', group: 'out-of-domain', value: Number.NaN, expectedGuard: 'QUANTITY_OUT_OF_RANGE' },
  {
    id: 'Infinity',
    group: 'out-of-domain',
    value: Number.POSITIVE_INFINITY,
    expectedGuard: 'QUANTITY_OUT_OF_RANGE',
  },
  {
    id: 'above-max-safe-integer',
    group: 'out-of-domain',
    value: Number.MAX_SAFE_INTEGER + 1,
    expectedGuard: 'QUANTITY_OUT_OF_RANGE',
  },
  {
    id: 'textual-zero',
    group: 'out-of-domain',
    value: '0',
    expectedGuard: 'QUANTITY_OUT_OF_RANGE',
  },
  {
    id: 'textual-above-max-safe-integer',
    group: 'out-of-domain',
    value: '9007199254740992',
    expectedGuard: 'QUANTITY_OUT_OF_RANGE',
  },

  // ── Frontera VÁLIDA: la guard NO sobre-rechaza (status 200, sin code) ────
  { id: 'minimal-one-microunit', group: 'accepted-boundary', value: 1, expectedGuard: null, expectedMicrounits: 1 },
  {
    id: 'canonical-decimal-string',
    group: 'accepted-boundary',
    value: '500000',
    expectedGuard: null,
    expectedMicrounits: 500_000,
  },
  // Espacios ASCII sí los limpia trim(): misma cantidad canónica 500000.
  {
    id: 'padded-canonical-string',
    group: 'accepted-boundary',
    value: ' 500000 ',
    expectedGuard: null,
    expectedMicrounits: 500_000,
  },
  // Exactitud en montos grandes: MAX_SAFE_INTEGER pasa bit a bit (number).
  {
    id: 'max-safe-integer-number',
    group: 'accepted-boundary',
    value: Number.MAX_SAFE_INTEGER,
    expectedGuard: null,
    expectedMicrounits: Number.MAX_SAFE_INTEGER,
  },
  {
    id: 'max-safe-integer-string',
    group: 'accepted-boundary',
    value: String(Number.MAX_SAFE_INTEGER),
    expectedGuard: null,
    expectedMicrounits: Number.MAX_SAFE_INTEGER,
  },
  // NBSP U+00A0 SÍ lo limpia trim() (WhiteSpace ECMAScript): '\u00A012' es
  // ACEPTADO como 12 — decisión EXPLÍCITA de esta matriz, no un accidente:
  // era el fail-open silencioso que ninguna prueba veía antes de US-05.
  {
    id: 'nbsp-prefixed-digits',
    group: 'accepted-boundary',
    value: '\u00A012',
    expectedGuard: null,
    expectedMicrounits: 12,
  },
];

/**
 * Expectativa EXACTA por celda (status HTTP + body.code) para un endpoint:
 * las 4 rutas body exponen el motivo discriminado del parser; picking colapsa
 * ambos motivos en su 400 genérico de query ('BAD_REQUEST') porque la condición
 * combina branchId/productId/cantidad en un solo guard (contrato US-01). Las
 * celdas aceptadas responden 200 sin body.code ni body.error.
 */
export interface ExpectedCellResponse {
  readonly status: number;
  readonly code: string | null;
}

export function expectedResponseFor(
  endpoint: MicrounitsEndpointId,
  cell: MicrounitsBoundaryCell,
): ExpectedCellResponse {
  if (cell.expectedGuard === null) return { status: 200, code: null };
  if (endpoint === 'GET /api/inventory/locations/picking') {
    return { status: 400, code: 'BAD_REQUEST' };
  }
  return { status: 400, code: cell.expectedGuard };
}

/**
 * Payload COMPLETO y válido para el endpoint con la celda inyectada en el
 * campo exacto donde el endpoint ingiere la cantidad: así cualquier rechazo
 * solo puede atribuirse a la celda (los demás campos nunca son la causa).
 * Picking recibe el objeto query (el handler consume texto crudo desde
 * index.ts, que ya no coacciona con Number()).
 */
export function boundaryRequestPayload(
  endpoint: MicrounitsEndpointId,
  cell: MicrounitsBoundaryCell,
): Record<string, unknown> {
  switch (endpoint) {
    case 'POST /api/sales/quotes':
      return {
        branchId: 'b1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: cell.value }],
      };
    case 'POST /api/sales/layaways':
      return {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: cell.value }],
      };
    case 'POST /api/purchasing/returns':
      return {
        purchaseReceiptId: 'pr1',
        reason: 'producto dañado',
        items: [{ productId: 'p1', enteredQuantityMicrounits: cell.value }],
      };
    case 'POST /api/inventory/locations/transfer':
      return {
        branchId: 'b1',
        sourceLocationId: 'loc-a',
        destinationLocationId: 'loc-b',
        productId: 'p1',
        quantityMicrounits: cell.value,
        idempotencyKey: `idem-${cell.id}`,
      };
    case 'GET /api/inventory/locations/picking':
      return { branchId: 'b1', productId: 'p1', quantityMicrounits: cell.value };
  }
}
