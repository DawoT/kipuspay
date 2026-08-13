import { describe, expect, it } from 'vitest';
import {
  judgeInventorySerialAssignment,
  runInventorySerialAssignmentChaos,
  runInventorySerialAssignmentChaosScenario,
  type InventorySerialChaosResult,
} from './inventory-serial-assignment.js';

describe('inventory-serial-assignment chaos', () => {
  it('500 ciclos deterministas conservan identidad y microunits bajo concurrencia y replay', async () => {
    const first = runInventorySerialAssignmentChaos(500);
    const replay = runInventorySerialAssignmentChaos(500);

    expect(replay).toEqual(first);
    expect(first.cycles).toBe(500);
    expect(first.discrepancies).toBe(0);
    expect(first.duplicateOwnerships).toBe(0);
    expect(first.ghostSerials).toBe(0);
    expect(first.microunitDrift).toBe(0);
    expect(first.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          concurrentDoubleAssignmentRejected: true,
          duplicateAssignmentStatus: 422,
          retryIdempotent: true,
          reorderedDeliveryConverged: true,
          leaseReplayRejected: true,
          transferConserved: true,
          returnReleasedSerial: true,
          ownerCount: 1,
          ghostSerial: false,
          microunitDrift: 0,
        }),
      ]),
    );
    expect(judgeInventorySerialAssignment(first)).toBe('FAIL');
    await expect(runInventorySerialAssignmentChaosScenario()).resolves.toBe('FAIL');
    expect(judgeInventorySerialAssignment({ ...first, engineEvidenceVerified: true })).toBe('PASS');
  });

  it.each([
    ['propiedad duplicada', { duplicateOwnerships: 1 }],
    ['serie fantasma', { ghostSerials: 1 }],
    ['drift de microunits', { microunitDrift: 1 }],
    ['ciclo incompleto', { cycles: 499 }],
  ])('el juez rechaza %s', (_case, patch) => {
    const valid: InventorySerialChaosResult = {
      cycles: 500,
      discrepancies: 0,
      engineEvidenceVerified: true,
      duplicateOwnerships: 0,
      ghostSerials: 0,
      microunitDrift: 0,
      samples: [],
    };

    expect(judgeInventorySerialAssignment({ ...valid, ...patch })).toBe('FAIL');
  });
});
