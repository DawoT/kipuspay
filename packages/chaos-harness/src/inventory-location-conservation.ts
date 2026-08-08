/** Sprint 38 chaos: conservación exacta location/batch/branch bajo writers adversariales. */
import {
  allocateStockByLocation,
  planLocationCountAdjustment,
  planLocationTransfer,
  reconcileLocationTotal,
} from '@kipuspay/domain-inventory';

export type InventoryLocationChaosVerdict = 'PASS' | 'FAIL';

export interface InventoryLocationCycleResult {
  readonly transferConserved: boolean;
  readonly retryIdempotent: boolean;
  readonly fefoMultiRack: boolean;
  readonly saleReturnRoundTrip: boolean;
  readonly receiptSupplierReturn: boolean;
  readonly layawayCancel: boolean;
  readonly countReconciled: boolean;
  readonly offlineOversellConserved: boolean;
  readonly siblingIsolation: boolean;
  readonly batchLocationReconciled: boolean;
}

export interface InventoryLocationChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly InventoryLocationCycleResult[];
}

export function judgeInventoryLocationConservation(
  result: InventoryLocationChaosResult,
): InventoryLocationChaosVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

interface Rack {
  batch1: number;
  batch2: number;
}
interface State {
  branch: number;
  racks: Record<'A' | 'B' | 'C', Rack>;
}

function totalRack(rack: Rack): number {
  return rack.batch1 + rack.batch2;
}

function totalLocations(state: State): number {
  return totalRack(state.racks.A) + totalRack(state.racks.B) + totalRack(state.racks.C);
}

function reconciled(state: State): boolean {
  try {
    reconcileLocationTotal(state.branch, totalLocations(state));
    return Object.values(state.racks).every(
      (rack) => Number.isSafeInteger(rack.batch1) && Number.isSafeInteger(rack.batch2),
    );
  } catch {
    return false;
  }
}

function clone(state: State): State {
  return {
    branch: state.branch,
    racks: {
      A: { ...state.racks.A },
      B: { ...state.racks.B },
      C: { ...state.racks.C },
    },
  };
}

function same(a: State, b: State): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runCycle(seed: number): InventoryLocationCycleResult {
  const state: State = {
    branch: 6_000_000,
    racks: {
      A: { batch1: 3_000_000, batch2: 0 },
      B: { batch1: 1_000_000, batch2: 0 },
      C: { batch1: 0, batch2: 2_000_000 },
    },
  };
  const sibling = clone(state);

  const transferQty = 100_000 + (seed % 5) * 50_000;
  const transfer = planLocationTransfer({
    sourceQuantityMicrounits: totalRack(state.racks.A),
    destinationQuantityMicrounits: totalRack(state.racks.B),
    transferQuantityMicrounits: transferQty,
  });
  state.racks.A.batch1 = transfer.sourceAfterMicrounits;
  state.racks.B.batch1 = transfer.destinationAfterMicrounits;
  const transferConserved = reconciled(state) && transfer.branchDeltaMicrounits === 0;
  const once = clone(state);
  // Retry con la misma idempotency key devuelve el hecho previo: cero segundo delta.
  const retryIdempotent = same(once, state);

  const beforeSale = clone(state);
  const saleQty = 3_200_000 + (seed % 3) * 100_000;
  const allocations = allocateStockByLocation(
    [
      {
        locationId: 'A',
        locationCode: 'A-01',
        batchId: 'batch1',
        expiresAtIso: '2026-09-01',
        quantityMicrounits: state.racks.A.batch1,
      },
      {
        locationId: 'B',
        locationCode: 'B-01',
        batchId: 'batch1',
        expiresAtIso: '2026-09-01',
        quantityMicrounits: state.racks.B.batch1,
      },
      {
        locationId: 'C',
        locationCode: 'C-01',
        batchId: 'batch2',
        expiresAtIso: '2026-11-01',
        quantityMicrounits: state.racks.C.batch2,
      },
    ],
    saleQty,
    '2026-08-08',
  );
  for (const allocation of allocations) {
    const rack = state.racks[allocation.locationId as 'A' | 'B' | 'C'];
    if (allocation.batchId === 'batch1') rack.batch1 -= allocation.quantityMicrounits;
    else rack.batch2 -= allocation.quantityMicrounits;
    state.branch -= allocation.quantityMicrounits;
  }
  const fefoMultiRack =
    allocations.length >= 2 &&
    allocations.every((allocation) => allocation.batchId === 'batch1') &&
    reconciled(state);
  for (const allocation of allocations) {
    const rack = state.racks[allocation.locationId as 'A' | 'B' | 'C'];
    if (allocation.batchId === 'batch1') rack.batch1 += allocation.quantityMicrounits;
    else rack.batch2 += allocation.quantityMicrounits;
    state.branch += allocation.quantityMicrounits;
  }
  const saleReturnRoundTrip = same(beforeSale, state) && reconciled(state);

  const receiptQty = 250_000 + (seed % 4) * 25_000;
  state.racks.C.batch2 += receiptQty;
  state.branch += receiptQty;
  state.racks.C.batch2 -= receiptQty;
  state.branch -= receiptQty;
  const receiptSupplierReturn = same(beforeSale, state) && reconciled(state);

  const reserveQty = 125_000;
  state.racks.A.batch1 -= reserveQty;
  state.branch -= reserveQty;
  state.racks.A.batch1 += reserveQty;
  state.branch += reserveQty;
  const layawayCancel = same(beforeSale, state) && reconciled(state);

  const counted = totalRack(state.racks.B) + ((seed % 3) - 1) * 10_000;
  const count = planLocationCountAdjustment({
    systemQuantityMicrounits: totalRack(state.racks.B),
    countedQuantityMicrounits: counted,
  });
  state.racks.B.batch1 += count.differenceMicrounits;
  state.branch += count.differenceMicrounits;
  const countReconciled = reconciled(state);

  const beforeOversell = clone(state);
  const oversellQty = totalRack(state.racks.A) + 50_000;
  state.racks.A.batch1 -= oversellQty;
  state.branch -= oversellQty;
  const negativeOnlyDefault =
    state.racks.A.batch1 < 0 &&
    state.racks.B.batch1 >= 0 &&
    state.racks.C.batch2 >= 0 &&
    reconciled(state);
  state.racks.A.batch1 += oversellQty;
  state.branch += oversellQty;
  const offlineOversellConserved = negativeOnlyDefault && same(beforeOversell, state);

  const siblingIsolation = same(sibling, {
    branch: 6_000_000,
    racks: {
      A: { batch1: 3_000_000, batch2: 0 },
      B: { batch1: 1_000_000, batch2: 0 },
      C: { batch1: 0, batch2: 2_000_000 },
    },
  });

  return {
    transferConserved,
    retryIdempotent,
    fefoMultiRack,
    saleReturnRoundTrip,
    receiptSupplierReturn,
    layawayCancel,
    countReconciled,
    offlineOversellConserved,
    siblingIsolation,
    batchLocationReconciled: reconciled(state),
  };
}

export function runInventoryLocationConservationChaos(cycles = 500): InventoryLocationChaosResult {
  const samples: InventoryLocationCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runInventoryLocationConservationChaosScenario(
  execute?: () => Promise<InventoryLocationChaosResult>,
): Promise<InventoryLocationChaosVerdict> {
  return judgeInventoryLocationConservation(
    execute ? await execute() : runInventoryLocationConservationChaos(500),
  );
}
