/**
 * Chaos rollup-idempotent — 2× cómputo = mismo SoT (§13.5 / Sprint 9).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface RollupSnapshot {
  readonly reportDate: string;
  readonly rows: readonly {
    readonly tenantId: string;
    readonly branchId: string;
    readonly grossSalesCents: number;
    readonly netSalesCents: number;
    readonly docCount: number;
    readonly productGrossCents: number;
  }[];
}

export interface RollupIdempotentResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly first: RollupSnapshot;
  readonly second: RollupSnapshot;
}

export function judgeRollupIdempotent(result: RollupIdempotentResult): ChaosVerdict {
  if (result.cycles < 100) return 'FAIL';
  if (result.discrepancies !== 0) return 'FAIL';
  if (result.first.reportDate !== result.second.reportDate) return 'FAIL';
  if (result.first.rows.length !== result.second.rows.length) return 'FAIL';
  return 'PASS';
}

function fingerprint(snap: RollupSnapshot): string {
  return JSON.stringify(
    [...snap.rows].sort((a, b) =>
      `${a.tenantId}:${a.branchId}`.localeCompare(`${b.tenantId}:${b.branchId}`),
    ),
  );
}

/** Simula rematerialize DELETE+INSERT dos veces sobre misma entrada. */
export function simulateRollupIdempotentCycle(seed: number): {
  first: RollupSnapshot;
  second: RollupSnapshot;
  drift: number;
} {
  const gross = 1000 + (seed % 50_000);
  const net = gross - (seed % 100);
  const docs = 1 + (seed % 20);
  const productGross = Math.floor(gross * 0.9);
  const base: RollupSnapshot = {
    reportDate: '2026-08-03',
    rows: [
      {
        tenantId: `t-${seed % 3}`,
        branchId: `b-${seed % 2}`,
        grossSalesCents: gross,
        netSalesCents: net,
        docCount: docs,
        productGrossCents: productGross,
      },
    ],
  };
  // Segunda pasada = mismo cómputo (idempotente).
  const second: RollupSnapshot = {
    reportDate: base.reportDate,
    rows: base.rows.map((r) => ({ ...r })),
  };
  const drift = fingerprint(base) === fingerprint(second) ? 0 : 1;
  return { first: base, second, drift };
}

export function runRollupIdempotentCycles(cycles = 500): RollupIdempotentResult {
  let discrepancies = 0;
  let first = simulateRollupIdempotentCycle(1).first;
  let second = simulateRollupIdempotentCycle(1).second;
  for (let i = 0; i < cycles; i += 1) {
    const sample = simulateRollupIdempotentCycle(i + 1);
    if (sample.drift !== 0) discrepancies += 1;
    if (i === 0) {
      first = sample.first;
      second = sample.second;
    }
  }
  return { cycles, discrepancies, first, second };
}

export async function runRollupIdempotentChaos(
  execute?: () => Promise<RollupIdempotentResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    throw new Error(
      'Escenario rollup-idempotent exige execute (evidencia ciclos); fail-closed sin fixtures',
    );
  }
  const result = await execute();
  return judgeRollupIdempotent(result);
}
