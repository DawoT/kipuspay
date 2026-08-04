/**
 * NRUS — omisión unitaria ≤ S/5 y consolidación en RC del día (FIS).
 * Cap = NRUS_UNITARY_OMISSION_CENTS (index.ts); no import circular.
 */

const NRUS_UNITARY_OMISSION_CENTS = 500;

export interface NrusOmitCandidate {
  readonly taxRegime: 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';
  readonly totalAmountCents: number;
  readonly documentType: string;
}

/** Ventas NRUS ≤ 500 cents pueden omitir CPE unitario y entrar consolidadas al RC. */
export function canOmitUnitaryNrus(c: NrusOmitCandidate): boolean {
  if (c.taxRegime !== 'NRUS') return false;
  if (c.documentType !== '03' && c.documentType !== '12') return false;
  return c.totalAmountCents <= NRUS_UNITARY_OMISSION_CENTS;
}

export interface NrusConsolidateLine {
  readonly saleId: string;
  readonly totalAmountCents: number;
}

export interface NrusConsolidatePlan {
  readonly omittedSaleIds: readonly string[];
  readonly consolidatedTotalCents: number;
}

/** Agrupa líneas omitidas para el RC del día (no inventa series). */
export function planNrusDailyConsolidation(
  lines: readonly NrusConsolidateLine[],
): NrusConsolidatePlan {
  let total = 0;
  const ids: string[] = [];
  for (const line of lines) {
    if (line.totalAmountCents <= 0) continue;
    if (line.totalAmountCents > NRUS_UNITARY_OMISSION_CENTS) continue;
    ids.push(line.saleId);
    total += line.totalAmountCents;
  }
  return { omittedSaleIds: ids, consolidatedTotalCents: total };
}
