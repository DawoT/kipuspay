/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- RED contract imports an intentionally missing module */
import { describe, expect, it } from 'vitest';
import {
  judgeInventoryScaleHeartbeat,
  runInventoryScaleHeartbeatChaos,
  runInventoryScaleHeartbeatChaosScenario,
  type InventoryScaleHeartbeatChaosResult,
} from './inventory-scale-heartbeat.js';

describe('inventory-scale-heartbeat chaos contract', () => {
  it('500 cycles converge across protocols, disconnects, stale heartbeats and offline replay', async () => {
    const first = runInventoryScaleHeartbeatChaos(500);
    const replay = runInventoryScaleHeartbeatChaos(500);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      cycles: 500,
      discrepancies: 0,
      silentZeroWeights: 0,
      staleReadingsAccepted: 0,
      duplicateMeasurements: 0,
      centParityDrift: 0,
      stockMicrounitDrift: 0,
    });
    expect(first.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocolNormalizationConverged: true,
          disconnectedForcedManual: true,
          staleAtTwoSecondsRejected: true,
          zeroNeverSynthesized: true,
          offlineServerParity: true,
          measurementIdentityPreserved: true,
        }),
      ]),
    );
    expect(judgeInventoryScaleHeartbeat(first)).toBe('PASS');
    await expect(runInventoryScaleHeartbeatChaosScenario()).resolves.toBe('PASS');
  });

  it.each([
    ['silent zero', { silentZeroWeights: 1 }],
    ['stale accepted', { staleReadingsAccepted: 1 }],
    ['duplicate measurement', { duplicateMeasurements: 1 }],
    ['cent drift', { centParityDrift: 1 }],
    ['stock drift', { stockMicrounitDrift: 1 }],
    ['short run', { cycles: 499 }],
  ])('the judge rejects %s', (_case, patch) => {
    const valid: InventoryScaleHeartbeatChaosResult = {
      cycles: 500,
      discrepancies: 0,
      silentZeroWeights: 0,
      staleReadingsAccepted: 0,
      duplicateMeasurements: 0,
      centParityDrift: 0,
      stockMicrounitDrift: 0,
      samples: [],
    };
    expect(judgeInventoryScaleHeartbeat({ ...valid, ...patch })).toBe('FAIL');
  });
});
