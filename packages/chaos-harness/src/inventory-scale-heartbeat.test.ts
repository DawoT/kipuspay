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
          unstableRejected: true,
          suspendedForcedManual: true,
          reorderedRejected: true,
          corruptFrameRejected: true,
          duplicateReplayRejected: true,
          tokenReplayRejected: true,
          wrongTenantRejected: true,
          wrongTerminalRejected: true,
          tamperedPriceIgnored: true,
          tamperedWeightIgnored: true,
          exactReturnMicrounits: true,
        }),
      ]),
    );
    expect(new Set(first.samples.map((sample) => sample.protocol))).toEqual(
      new Set(['WEBHID', 'WEB_SERIAL', 'WEBUSB']),
    );
    expect(first.samples).toHaveLength(500);
    expect(
      first.samples.every(
        (sample) =>
          sample.acceptedWeightMicrounits > 0 &&
          sample.returnedWeightMicrounits === sample.acceptedWeightMicrounits,
      ),
    ).toBe(true);
    expect(judgeInventoryScaleHeartbeat(first)).toBe('FAIL');
    expect(judgeInventoryScaleHeartbeat({ ...first, engineEvidenceVerified: true })).toBe('PASS');
    await expect(runInventoryScaleHeartbeatChaosScenario()).resolves.toBe('FAIL');
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
      engineEvidenceVerified: true,
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
