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

export interface BriefingInput {
  readonly tenantId: string;
  readonly reportDate: string;
  readonly sales: { readonly grossSalesCents: number; readonly docCount: number };
  readonly breakage: readonly BreakageFact[];
  readonly cashExceptions: readonly CashExceptionFact[];
}

export interface Briefing {
  readonly reportDate: string;
  readonly bullets: readonly string[];
  readonly disclaimer: string;
}

export function buildBriefing(input: BriefingInput): Briefing {
  const sales = `Ventas del día: S/ ${input.sales.grossSalesCents} en ${input.sales.docCount} comprobantes.`;
  const breakage =
    input.breakage.length > 0
      ? `Queda poco stock de ${input.breakage[0]?.productName} (${input.breakage[0]?.daysCovered} días cubiertos; reponer ${input.breakage[0]?.suggestedReorderQty} unidades).`
      : 'Sin alertas de quiebre de stock.';
  const cash =
    input.cashExceptions.length > 0
      ? `Diferencia de caja en ${input.cashExceptions[0]?.branchCode}: S/ ${input.cashExceptions[0]?.diffCents}.`
      : 'Sin diferencias de caja pendientes.';
  return {
    reportDate: input.reportDate,
    bullets: [sales, breakage, cash],
    disclaimer: `Datos del día ${input.reportDate}, calculados por el servidor.`,
  };
}
