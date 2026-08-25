/**
 * Resumen Diario (RC) — FIS-03: un RC por emisor/día (tenant_id + summary_date).
 * H1 (auditoría 0031): además de boletas (03/12), el RC lleva las NC/ND
 * (07/08) vinculadas a boletas — regla SUNAT §5.2 (nunca XML unitario).
 */

export interface BoletaForRc {
  readonly saleId: string;
  readonly branchId: string;
  readonly documentType: string;
  readonly totalAmountCents: number;
  readonly voidStatus: string;
  readonly issuedAtMs: number;
}

export interface DailySummaryPlan {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly saleIds: readonly string[];
  readonly ticketCount: number;
  readonly voidSaleIds: readonly string[];
}

export function assertRcKeyIsEmisorDay(tenantId: string, summaryDate: string): void {
  if (!tenantId.trim()) throw new Error('RC_TENANT_REQUIRED');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) throw new Error('RC_DATE_INVALID');
}

/** Documentos que viajan dentro del sobre RC (spec §5.2). */
const RC_LINE_DOCUMENT_TYPES: ReadonlySet<string> = new Set(['03', '12', '07', '08']);

/** Agrupa boletas y notas sobre boletas del día; branch_id NO es clave del RC. */
export function planDailySummary(
  tenantId: string,
  summaryDate: string,
  boletas: readonly BoletaForRc[],
): DailySummaryPlan {
  assertRcKeyIsEmisorDay(tenantId, summaryDate);
  const saleIds: string[] = [];
  const voidSaleIds: string[] = [];
  for (const b of boletas) {
    if (!RC_LINE_DOCUMENT_TYPES.has(b.documentType)) continue;
    saleIds.push(b.saleId);
    if (b.voidStatus === 'VOID_PENDING_RC' || b.voidStatus === 'VOIDED') {
      voidSaleIds.push(b.saleId);
    }
  }
  if (saleIds.length === 0) throw new Error('RC_NO_BOLETAS');
  return {
    tenantId,
    summaryDate,
    saleIds,
    ticketCount: saleIds.length,
    voidSaleIds,
  };
}

/** Arqueo Z nunca dispara RC. */
export function cashCloseMustNotTriggerRc(): false {
  return false;
}
