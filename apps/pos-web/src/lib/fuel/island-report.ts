/**
 * Grifos — Reporte de turno por isleta (premium #2, DESIGNED).
 * Stub puro que no toca D1 ni red: agrega despachos offline por isleta para el Z desglosado.
 * La UI final pedirá al API el desglose server-side; aquí el cálculo local para preview.
 */

export interface IslandDispatch {
  readonly islandId: string; // 'isla-1'|'isla-2'|...
  readonly fuelCode: string;
  readonly gallonsMicrounits: number;
  readonly totalCents: number;
  readonly paymentMethod: 'cash' | 'card' | 'qr';
}

export interface IslandTurnReport {
  readonly islandId: string;
  readonly dispatchCount: number;
  readonly totalCents: number;
  readonly totalGallons: number;
  readonly byPayment: Readonly<Record<string, number>>;
}

export function buildIslandReport(dispatches: readonly IslandDispatch[]): readonly IslandTurnReport[] {
  const byIsland = new Map<string, IslandDispatch[]>();
  for (const d of dispatches) {
    const list = byIsland.get(d.islandId) ?? [];
    list.push(d);
    byIsland.set(d.islandId, list);
  }
  const reports: IslandTurnReport[] = [];
  for (const [islandId, list] of byIsland) {
    const totalCents = list.reduce((s, x) => s + x.totalCents, 0);
    const totalGallons = list.reduce((s, x) => s + x.gallonsMicrounits, 0) / 1_000_000;
    const byPayment: Record<string, number> = {};
    for (const x of list) {
      byPayment[x.paymentMethod] = (byPayment[x.paymentMethod] ?? 0) + x.totalCents;
    }
    reports.push({
      islandId,
      dispatchCount: list.length,
      totalCents,
      totalGallons,
      byPayment,
    });
  }
  return reports.sort((a, b) => a.islandId.localeCompare(b.islandId));
}
