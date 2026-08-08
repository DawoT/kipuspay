/**
 * Sprint 32 chaos: asientos balanceados y export flag-on ≡ buildAccountingEntries.
 * El read-only de la UI se verifica en worker-api (journal-routes POST/PATCH → 403);
 * aquí solo se garantiza la bit-consistencia del mapeo GL entre journal y export.
 */
import { planLayawayDepositJournal, planSaleJournal } from '@kipuspay/domain-cash';
import { buildAccountingEntries } from '@kipuspay/domain-integrations';

export type JournalChaosVerdict = 'PASS' | 'FAIL';

export interface JournalCycleResult {
  readonly balanced: boolean;
  readonly saleMatchesExport: boolean;
  readonly layawayUses2101: boolean;
}

export interface JournalChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly JournalCycleResult[];
}

export function judgeJournalBalanceExport(result: JournalChaosResult): JournalChaosVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

function runCycle(seed: number): JournalCycleResult {
  const totalCents = 10_000 + (seed % 5) * 118;
  const taxCents = Math.round((totalCents * 18) / 118);
  const useAnticipo = seed % 4 === 0;
  const cash = seed % 3 === 0 ? totalCents : Math.floor(totalCents / 2);
  const credit = totalCents - cash;
  const payments: { methodCode: string; amountCents: number }[] = useAnticipo
    ? [{ methodCode: 'anticipo', amountCents: totalCents }]
    : credit > 0
      ? [
          { methodCode: seed % 2 === 0 ? 'cash' : 'yape', amountCents: cash },
          { methodCode: 'credit', amountCents: credit },
        ]
      : [{ methodCode: 'cash', amountCents: cash }];
  const sale = planSaleJournal({
    sourceId: `s${seed}`,
    postDate: '2026-08-07',
    totalCents,
    taxCents,
    payments,
  });
  const exportEntries = buildAccountingEntries([
    {
      saleId: `s${seed}`,
      branchId: 'b1',
      soldAt: '2026-08-07 10:00:00',
      totalCents,
      taxCents,
      payments,
      arBalanceCents: credit,
    },
  ]);
  const journalSigned = sale.lines.map((line) => ({
    gl: line.code,
    amount: line.debitCents > 0 ? line.debitCents : -line.creditCents,
  }));
  const exportSigned = exportEntries.map((entry) => ({
    gl: entry.glAccount,
    amount: entry.amountCents,
  }));
  const saleMatchesExport =
    JSON.stringify(
      journalSigned.sort((a, b) => a.gl.localeCompare(b.gl) || a.amount - b.amount),
    ) ===
    JSON.stringify(exportSigned.sort((a, b) => a.gl.localeCompare(b.gl) || a.amount - b.amount));
  const deposit = planLayawayDepositJournal({
    sourceId: `d${seed}`,
    postDate: '2026-08-07',
    amountCents: 500 + (seed % 7),
  });
  return {
    balanced: sale.balancedCents === 0 && deposit.balancedCents === 0,
    saleMatchesExport,
    layawayUses2101: deposit.lines.some((line) => line.code === '2101'),
  };
}

export function runJournalBalanceExportChaos(cycles = 500): JournalChaosResult {
  const samples: JournalCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runJournalBalanceExportChaosScenario(
  execute?: () => Promise<JournalChaosResult>,
): Promise<JournalChaosVerdict> {
  return judgeJournalBalanceExport(execute ? await execute() : runJournalBalanceExportChaos(500));
}
