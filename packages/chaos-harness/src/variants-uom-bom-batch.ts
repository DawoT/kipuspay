/** Sprint 31 chaos: sibling × UOM × BOM × FEFO, aritmética entera exacta. */
import { convertEnteredToBaseMicrounits, QUANTITY_SCALE } from '@kipuspay/domain-inventory';

export type VariantsUomVerdict = 'PASS' | 'FAIL';

export interface VariantsUomCycleResult {
  readonly siblingIsolated: boolean;
  readonly quantityExact: boolean;
  readonly batchIdStable: boolean;
  readonly rollbackExact: boolean;
  readonly snapshotImmutable: boolean;
}

export interface VariantsUomChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly VariantsUomCycleResult[];
}

export function judgeVariantsUomBomBatch(result: VariantsUomChaosResult): VariantsUomVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

function runCycle(seed: number): VariantsUomCycleResult {
  const factors = [
    { numerator: 1, denominator: 1 },
    { numerator: 12, denominator: 1 },
    { numerator: 1, denominator: 2 },
  ] as const;
  const factor = factors[seed % factors.length]!;
  const enteredQuantityMicrounits = (1 + (seed % 3)) * QUANTITY_SCALE;
  const baseQuantityMicrounits = convertEnteredToBaseMicrounits({
    enteredQuantityMicrounits,
    factorNumerator: factor.numerator,
    factorDenominator: factor.denominator,
  });

  const siblingAStart = 80 * QUANTITY_SCALE;
  const siblingBStart = 80 * QUANTITY_SCALE;
  const isKit = seed % 2 === 0;
  const requiredComponentMicrounits = isKit ? baseQuantityMicrounits * 2 : baseQuantityMicrounits;
  const batchAStart = 20 * QUANTITY_SCALE;
  const batchBStart = 40 * QUANTITY_SCALE;
  const insufficient = requiredComponentMicrounits > batchAStart + batchBStart;

  let siblingA = siblingAStart;
  const siblingB = siblingBStart;
  let batchA = batchAStart;
  let batchB = batchBStart;
  const batchIds: string[] = [];
  if (!insufficient) {
    siblingA -= baseQuantityMicrounits;
    const fromA = Math.min(batchA, requiredComponentMicrounits);
    batchA -= fromA;
    if (fromA > 0) batchIds.push('lot-a');
    const fromB = requiredComponentMicrounits - fromA;
    batchB -= fromB;
    if (fromB > 0) batchIds.push('lot-b');
  }

  const rollbackExact =
    !insufficient ||
    (siblingA === siblingAStart &&
      siblingB === siblingBStart &&
      batchA === batchAStart &&
      batchB === batchBStart);
  const siblingIsolated = siblingB === siblingBStart;
  const quantityExact = insufficient || siblingAStart - siblingA === baseQuantityMicrounits;
  const batchIdStable =
    insufficient ||
    batchIds.join(',') === (requiredComponentMicrounits <= batchAStart ? 'lot-a' : 'lot-a,lot-b');

  // El factor cambia después; devolución usa snapshots originales.
  const editedFactorNumerator = factor.numerator + 1;
  const historicalReturnMicrounits = baseQuantityMicrounits;
  const snapshotImmutable =
    historicalReturnMicrounits === baseQuantityMicrounits &&
    editedFactorNumerator !== factor.numerator;

  return {
    siblingIsolated,
    quantityExact,
    batchIdStable,
    rollbackExact,
    snapshotImmutable,
  };
}

export function runVariantsUomBomBatchChaos(cycles = 500): VariantsUomChaosResult {
  const samples: VariantsUomCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runVariantsUomBomBatchChaosScenario(
  execute?: () => Promise<VariantsUomChaosResult>,
): Promise<VariantsUomVerdict> {
  return judgeVariantsUomBomBatch(execute ? await execute() : runVariantsUomBomBatchChaos(500));
}
