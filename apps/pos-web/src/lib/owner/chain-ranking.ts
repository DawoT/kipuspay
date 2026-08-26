/** Ranking premium para cadenas multi-local — Modo Dueño.
 * Server es autoridad (daily_financial_rollups). Este helper solo ordena y decora
 * para UI premium sin ser fuente de verdad de montos. Cero jerga en etiquetas visibles.
 */

export interface ChainBranchInput {
  readonly branchId: string;
  readonly netSalesCents: number;
  readonly docCount: number;
  /** Solo si stock.transfers activo; 0 si no. */
  readonly pendingTransfers?: number;
  /** Solo si inventory.locations activo; 0 si no. */
  readonly lowStockAlerts?: number;
}

export interface ChainBranchView {
  readonly rank: number;
  readonly branchId: string;
  readonly netSalesCents: number;
  readonly docCount: number;
  /** Etiqueta premium en español, sin jerga técnica (V-27). */
  readonly badgeLabel: string;
  readonly badgeTone: 'lider' | 'alza' | 'estable';
  readonly pendingTransfers: number;
  readonly lowStockAlerts: number;
}

function badgeFor(rank: number, total: number): { label: string; tone: ChainBranchView['badgeTone'] } {
  if (rank === 1) return { label: 'Líder', tone: 'lider' };
  if (total > 3 && rank <= 3) return { label: 'En alza', tone: 'alza' };
  if (total === 3 && rank === 2) return { label: 'En alza', tone: 'alza' };
  return { label: 'Estable', tone: 'estable' };
}

/** Ordena por ventas (desc), desempate por docCount (desc) y branchId (asc) estable.
 * Asigna rank 1..N y badge premium. No muta input. Valida *_cents enteros (>=0).
 */
export function buildChainRanking(branches: readonly ChainBranchInput[]): ChainBranchView[] {
  const safe = branches.map((b) => ({
    branchId: String(b.branchId),
    netSalesCents: Number.isInteger(b.netSalesCents) && b.netSalesCents >= 0 ? b.netSalesCents : 0,
    docCount: Number.isInteger(b.docCount) && b.docCount >= 0 ? b.docCount : 0,
    pendingTransfers:
      Number.isInteger(b.pendingTransfers) && (b.pendingTransfers ?? 0) >= 0 ? (b.pendingTransfers ?? 0) : 0,
    lowStockAlerts:
      Number.isInteger(b.lowStockAlerts) && (b.lowStockAlerts ?? 0) >= 0 ? (b.lowStockAlerts ?? 0) : 0,
  }));

  const sorted = [...safe].sort((a, b) => {
    if (b.netSalesCents !== a.netSalesCents) return b.netSalesCents - a.netSalesCents;
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    return a.branchId.localeCompare(b.branchId);
  });

  return sorted.map((b, idx) => {
    const rank = idx + 1;
    const badge = badgeFor(rank, sorted.length);
    return {
      rank,
      branchId: b.branchId,
      netSalesCents: b.netSalesCents,
      docCount: b.docCount,
      badgeLabel: badge.label,
      badgeTone: badge.tone,
      pendingTransfers: b.pendingTransfers,
      lowStockAlerts: b.lowStockAlerts,
    };
  });
}

/** Helper para emptyState premium — verdadero si no hay ranking (server autoritativo). */
export function isChainRankingEmpty(ranked: readonly ChainBranchView[]): boolean {
  return ranked.length === 0;
}
