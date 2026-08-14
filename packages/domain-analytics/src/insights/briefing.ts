/**
 * Sprint 49 — Morning Briefing determinista (Arquitectura §5.3 regla 33).
 * 3 viñetas (ventas, quiebre, excepciones de caja) construidas SOLO con hechos
 * de D1 y copy fijo en español, sin LLM y sin jerga. La UI las presenta con
 * banner de antigüedad, nunca como en vivo.
 */

export interface BreakageFact {
  readonly productName: string;
  readonly daysCovered: number;
  readonly suggestedReorderQty: number;
}

export interface CashExceptionFact {
  readonly branchCode: string;
  readonly diffCents: number;
}

/** Edge 1C (Sprint 51): un tramo de cash_register_shifts con diferencia ≠ 0. */
export interface CashShiftFact {
  readonly operator: string;
  readonly cashDiffCents: number;
}

export interface BriefingInput {
  readonly tenantId: string;
  readonly reportDate: string;
  readonly sales: { readonly grossSalesCents: number; readonly docCount: number };
  readonly breakage: readonly BreakageFact[];
  readonly cashExceptions: readonly CashExceptionFact[];
  readonly cashShifts?: readonly CashShiftFact[];
}

export interface Briefing {
  readonly reportDate: string;
  readonly bullets: readonly string[];
  readonly disclaimer: string;
}

export function buildBriefing(input: BriefingInput): Briefing {
  const sales = `Ventas del día: ${formatSoles(input.sales.grossSalesCents)} en ${input.sales.docCount} comprobantes.`;
  const breakage =
    input.breakage.length > 0
      ? `Queda poco stock de ${input.breakage[0]?.productName} (${input.breakage[0]?.daysCovered} días cubiertos; reponer ${input.breakage[0]?.suggestedReorderQty} unidades).`
      : 'Sin alertas de quiebre de stock.';
  const cash =
    input.cashExceptions.length > 0
      ? `Diferencia de caja en ${input.cashExceptions[0]?.branchCode}: ${formatSoles(input.cashExceptions[0]?.diffCents ?? 0)}.`
      : 'Sin diferencias de caja pendientes.';
  const cashShifts = input.cashShifts ?? [];
  const shifts =
    cashShifts.length > 0
      ? `Por turnos: ${cashShifts
          .map((shift) => {
            const sign = shift.cashDiffCents >= 0 ? 'faltan' : 'sobran';
            return `${shift.operator}: ${sign} ${formatSoles(Math.abs(shift.cashDiffCents))}`;
          })
          .join(', ')}.`
      : null;
  return {
    reportDate: input.reportDate,
    bullets: [sales, breakage, cash, ...(shifts ? [shifts] : [])],
    disclaimer: `Datos del día ${input.reportDate}, calculados por el servidor.`,
  };
}

/** S49-H5: cents → soles formateados (entero + 2 decimales, display server-side). */
export function formatSoles(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const soles = Math.floor(abs / 100);
  const rest = abs % 100;
  return `S/ ${sign}${soles}.${String(rest).padStart(2, '0')}`;
}
