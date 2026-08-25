/**
 * H5 (auditoría 0031) — días hábiles para el tope de anulación E-A.
 *
 * Regla SUNAT: la comunicación de anulación (NC motivo cat. 09 '01', error de
 * RUC/descripción) procede hasta el DÉCIMO DÍA HÁBIL del mes siguiente a la
 * emisión del CPE originario. Calendario Lima (UTC-5, sin DST).
 *
 * LIMITACIÓN DOCUMENTADA: v1 excluye solo sábados/domingos; NO modela feriados
 * de Perú. Un feriado entre semana cuenta como hábil → el tope calculado puede
 * ser UN día anterior al real en el peor caso (error conservador contra el
 * emisor, jamás a favor). Un job futuro puede inyectar calendario sin cambiar
 * el contrato.
 */

export const EA_DEADLINE_BUSINESS_DAYS = 10;

const LIMA_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

function isWeekendUtcMs(utcMs: number): boolean {
  const dow = new Date(utcMs).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Tope E-A: fin del décimo día hábil del mes siguiente al de emisión Lima
 * (23:59:59.999 Lima del 10° hábil), como ms UTC.
 */
export function tenthBusinessDayEndOfNextMonthLima(issuedAtMs: number): number {
  const lima = new Date(issuedAtMs - LIMA_OFFSET_MS);
  // Primer día (00:00 Lima) del mes SIGUIENTE al de emisión, en calendario Lima.
  let cursor = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() + 1, 1) + LIMA_OFFSET_MS;
  let counted = 0;
  while (counted < EA_DEADLINE_BUSINESS_DAYS) {
    if (!isWeekendUtcMs(cursor)) counted += 1;
    if (counted < EA_DEADLINE_BUSINESS_DAYS) cursor += DAY_MS;
  }
  // Fin del día Lima del 10° hábil → UTC.
  const d = new Date(cursor - LIMA_OFFSET_MS);
  return (
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999) + LIMA_OFFSET_MS
  );
}

/** ¿La NC E-A emitida en `nowMs` aún está dentro del tope del CPE `issuedAtMs`? */
export function isWithinEaAnulacionDeadline(issuedAtMs: number, nowMs: number): boolean {
  return nowMs <= tenthBusinessDayEndOfNextMonthLima(issuedAtMs);
}

/** Guard tipado E-A: rechazo dominio si el tope de 10° día hábil está vencido. */
export function assertEaAnulacionDeadline(input: {
  readonly originIssuedAtMs: number;
  readonly nowMs: number;
}): void {
  if (!isWithinEaAnulacionDeadline(input.originIssuedAtMs, input.nowMs)) {
    throw new Error('CREDIT_NOTE_EA_DEADLINE_EXCEEDED');
  }
}
