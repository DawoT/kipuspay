/**
 * Resumen Diario (RC) — FIS-03: un RC por emisor/día (tenant_id + summary_date).
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

/** Agrupa boletas del día; branch_id NO es clave del RC. */
export function planDailySummary(
  tenantId: string,
  summaryDate: string,
  boletas: readonly BoletaForRc[],
): DailySummaryPlan {
  assertRcKeyIsEmisorDay(tenantId, summaryDate);
  const saleIds: string[] = [];
  const voidSaleIds: string[] = [];
  for (const b of boletas) {
    if (b.documentType !== '03' && b.documentType !== '12') continue;
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
