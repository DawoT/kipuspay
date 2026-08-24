/**
 * Catálogo 10 SUNAT — traducción motivo INTERNO → wire para ND `08`
 * (ADR-FISCAL-003 / Arquitectura §5.1 regla 5).
 *
 * La taxonomía interna de la ND es un vocabulario de producto; el XML que
 * viaja a SUNAT debe usar los códigos del catálogo 10 wire OFICIAL
 * ("Códigos de Motivos de las Notas de Débito Electrónicas", Anexo Nro. 8):
 *
 *   01 Intereses por mora · 02 Aumento en el valor
 *   03 Penalidades / otros conceptos · 11 Ajustes de operaciones de
 *   exportación · 12 Ajustes afectos al IVAP.
 *
 * Evidencia FL-1 (tmp-staff/homologacion-fl1-resultados.json, e-beta
 * 2026-08-24): el wire `06` NO existe en catálogo 10 — CDR 2172 "Valor no se
 * encuentra en el catalogo: 10 (valor 06)"; el wire `01` fue ACEPTADO
 * (FD01-00000004, CDR 0). Los códigos 04–09 pertenecen al catálogo 09 (NC),
 * no al 10.
 *
 * Fail-closed (ADR-FISCAL-008): un motivo interno sin contraparte wire
 * verificada produce error tipado ANTES de construir XML — jamás un
 * ResponseCode inventado ni un fallback silencioso. El interno `10` es válido
 * en la taxonomía interna pero carece de homologación e-beta; se bloquea con
 * error propio hasta su ciclo normativo/homologación.
 */

/** Par wire que viaja en `cac:DiscrepancyResponse` del DebitNote UBL. */
export interface NdMotiveWire {
  /** `cbc:ResponseCode` — código del catálogo 10 oficial. */
  readonly responseCode: string;
  /** `cbc:Description` — descripción oficial del código (e-beta exige el tag). */
  readonly description: string;
}

/**
 * Tabla de traducción interna→wire. Solo incluye motivos con contraparte
 * VERIFICADA contra el catálogo 10 oficial (`01`/`02`/`03` homologados por
 * identidad semántica; `01` además aceptado por e-beta en FD01-00000004).
 */
export const ND_MOTIVE_WIRE_CATALOG: Readonly<Record<string, NdMotiveWire>> = Object.freeze({
  '01': Object.freeze({ responseCode: '01', description: 'Intereses por mora' }),
  '02': Object.freeze({ responseCode: '02', description: 'Aumento en el valor' }),
  '03': Object.freeze({ responseCode: '03', description: 'Penalidades / otros conceptos' }),
});

/**
 * Motivos válidos en la taxonomía interna (ADR-FISCAL-003) sin contraparte
 * wire homologada contra SUNAT. Se bloquean en el borde wire hasta que el
 * ciclo normativo + homologación e-beta demuestre su código real.
 */
export const ND_MOTIVE_INTERNAL_PENDING_WIRE: ReadonlySet<string> = Object.freeze(new Set(['10']));

/** Motivo fuera de la taxonomía interna ND (`01`|`02`|`03`|`10`). */
export class UnknownNdMotiveError extends Error {
  readonly code = 'UNKNOWN_ND_MOTIVE';
  constructor(motiveCode: string) {
    super(
      `UNKNOWN_ND_MOTIVE: "${motiveCode}" no pertenece a la taxonomía interna ND (01|02|03|10)`,
    );
    this.name = 'UnknownNdMotiveError';
  }
}

/** Motivo interno válido pero sin código wire homologado (hoy: `10`). */
export class NdMotiveWireUnhomologatedError extends Error {
  readonly code = 'ND_MOTIVE_WIRE_UNHOMOLOGATED';
  constructor(motiveCode: string) {
    super(
      `ND_MOTIVE_WIRE_UNHOMOLOGATED: el motivo interno "${motiveCode}" no tiene ` +
        `código catálogo 10 verificado ante SUNAT — requiere homologación antes de emitir`,
    );
    this.name = 'NdMotiveWireUnhomologatedError';
  }
}

/**
 * Traduce un motivo INTERNO al par wire (ResponseCode + Description) del
 * catálogo 10. Pura y total: lanza error tipado para todo lo que no tenga
 * traducción verificada — nunca devuelve un wire inventado.
 */
export function translateNdMotiveToWire(motiveCode: string): NdMotiveWire {
  const wire = ND_MOTIVE_WIRE_CATALOG[motiveCode];
  if (wire !== undefined) return wire;
  if (ND_MOTIVE_INTERNAL_PENDING_WIRE.has(motiveCode)) {
    throw new NdMotiveWireUnhomologatedError(motiveCode);
  }
  throw new UnknownNdMotiveError(motiveCode);
}
