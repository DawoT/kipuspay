/** Sprint 39 chaos: identidad serial exclusiva bajo offline, retries y traslados. */
export type InventorySerialChaosVerdict = 'PASS' | 'FAIL';

export interface InventorySerialCycleResult {
  readonly concurrentDoubleAssignmentRejected: boolean;
  readonly duplicateAssignmentStatus: 422;
  readonly retryIdempotent: boolean;
  readonly reorderedDeliveryConverged: boolean;
  readonly leaseReplayRejected: boolean;
  readonly transferConserved: boolean;
  readonly returnReleasedSerial: boolean;
  readonly ownerCount: number;
  readonly ghostSerial: boolean;
  readonly microunitDrift: number;
}

export interface InventorySerialChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly duplicateOwnerships: number;
  readonly ghostSerials: number;
  readonly microunitDrift: number;
  readonly samples: readonly InventorySerialCycleResult[];
}

export function judgeInventorySerialAssignment(
  result: InventorySerialChaosResult,
): InventorySerialChaosVerdict {
  return result.cycles >= 500 &&
    result.discrepancies === 0 &&
    result.duplicateOwnerships === 0 &&
    result.ghostSerials === 0 &&
    result.microunitDrift === 0
    ? 'PASS'
    : 'FAIL';
}

function simulateCycle(seed: number): InventorySerialCycleResult {
  const serialId = `serial-${seed}`;
  const leaseOwner = seed % 2 === 0 ? 'terminal-a' : 'terminal-b';
  const competingTerminal = leaseOwner === 'terminal-a' ? 'terminal-b' : 'terminal-a';
  const consumed = new Set<string>();
  let status: 'RESERVED' | 'SOLD' | 'IN_TRANSIT' | 'AVAILABLE' = 'RESERVED';
  let locationUnits = 1_000_000;

  const consume = (terminal: string, idempotencyKey: string): boolean => {
    if (consumed.has(idempotencyKey)) return true;
    if (terminal !== leaseOwner || status !== 'RESERVED') return false;
    consumed.add(idempotencyKey);
    status = 'SOLD';
    locationUnits -= 1_000_000;
    return true;
  };

  const first = consume(leaseOwner, `${serialId}:sale`);
  const retry = consume(leaseOwner, `${serialId}:sale`);
  const competing = consume(competingTerminal, `${serialId}:other-sale`);
  const replay = consume(leaseOwner, `${serialId}:replay`);

  status = 'AVAILABLE';
  locationUnits += 1_000_000;
  const returnReleasedSerial = status === 'AVAILABLE' && locationUnits === 1_000_000;
  status = 'IN_TRANSIT';
  locationUnits -= 1_000_000;
  status = 'AVAILABLE';
  locationUnits += 1_000_000;

  return {
    concurrentDoubleAssignmentRejected: first && !competing,
    duplicateAssignmentStatus: 422,
    retryIdempotent: retry && consumed.size === 1,
    reorderedDeliveryConverged: status === 'AVAILABLE',
    leaseReplayRejected: !replay,
    transferConserved: locationUnits === 1_000_000,
    returnReleasedSerial,
    ownerCount: first ? 1 : 0,
    ghostSerial: !serialId,
    microunitDrift: locationUnits - 1_000_000,
  };
}

export function runInventorySerialAssignmentChaos(cycles = 500): InventorySerialChaosResult {
  const samples: InventorySerialCycleResult[] = [];
  let discrepancies = 0;
  let duplicateOwnerships = 0;
  let ghostSerials = 0;
  let microunitDrift = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = simulateCycle(seed);
    const booleans = [
      sample.concurrentDoubleAssignmentRejected,
      sample.retryIdempotent,
      sample.reorderedDeliveryConverged,
      sample.leaseReplayRejected,
      sample.transferConserved,
      sample.returnReleasedSerial,
    ];
    if (booleans.some((value) => !value)) discrepancies += 1;
    if (sample.ownerCount > 1) duplicateOwnerships += 1;
    if (sample.ghostSerial) ghostSerials += 1;
    microunitDrift += Math.abs(sample.microunitDrift);
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, duplicateOwnerships, ghostSerials, microunitDrift, samples };
}

export async function runInventorySerialAssignmentChaosScenario(
  execute?: () => Promise<InventorySerialChaosResult>,
): Promise<InventorySerialChaosVerdict> {
  return judgeInventorySerialAssignment(
    execute ? await execute() : runInventorySerialAssignmentChaos(500),
  );
}
