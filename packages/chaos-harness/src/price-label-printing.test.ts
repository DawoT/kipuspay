import { describe, expect, it } from 'vitest';
import {
  judgePriceLabelPrinting,
  runPriceLabelPrintingChaos,
  type PriceLabelPrintingChaosResult,
} from './price-label-printing.js';

describe('price-label printing chaos contract', () => {
  it('500 cycles preserve snapshot, ACK convergence and cash availability', async () => {
    const first = await runPriceLabelPrintingChaos(500);
    const replay = await runPriceLabelPrintingChaos(500);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      cycles: 500,
      mixedSnapshotBatches: 0,
      clientPricesAccepted: 0,
      crossTenantReads: 0,
      duplicateAcknowledgedItems: 0,
      lostPendingItemsAfterReload: 0,
      retriesWithRefreshedSnapshots: 0,
      explicitReprintsWithoutRefresh: 0,
      cashCloseBlocks: 0,
      webUsbCleanupFailures: 0,
      wssUnallowlistedConnections: 0,
    });
    expect(first.samples).toHaveLength(500);
    expect(
      first.samples.every(
        (sample) =>
          sample.partialAckConverged &&
          sample.f5Recovered &&
          sample.quotaFailurePreservedQueue &&
          sample.retryPreservedHash &&
          sample.reprintRefreshedHash &&
          sample.closeZRemainedAvailable,
      ),
    ).toBe(true);
    expect(judgePriceLabelPrinting(first)).toBe('PASS');
  });

  it.each([
    ['short run', { cycles: 499 }],
    ['mixed snapshot', { mixedSnapshotBatches: 1 }],
    ['client price', { clientPricesAccepted: 1 }],
    ['cross tenant', { crossTenantReads: 1 }],
    ['duplicate ACK', { duplicateAcknowledgedItems: 1 }],
    ['F5 loss', { lostPendingItemsAfterReload: 1 }],
    ['cash blocked', { cashCloseBlocks: 1 }],
  ])('judge rejects %s', (_case, patch) => {
    const valid: PriceLabelPrintingChaosResult = {
      cycles: 500,
      mixedSnapshotBatches: 0,
      clientPricesAccepted: 0,
      crossTenantReads: 0,
      duplicateAcknowledgedItems: 0,
      lostPendingItemsAfterReload: 0,
      retriesWithRefreshedSnapshots: 0,
      explicitReprintsWithoutRefresh: 0,
      cashCloseBlocks: 0,
      webUsbCleanupFailures: 0,
      wssUnallowlistedConnections: 0,
      samples: [],
    };
    expect(judgePriceLabelPrinting({ ...valid, ...patch })).toBe('FAIL');
  });
});
