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
      duplicatePrints: 0,
      duplicateAcknowledgedItems: 0,
      lostPendingItemsAfterReload: 0,
      retriesWithRefreshedSnapshots: 0,
      explicitReprintsWithoutRefresh: 0,
      cashCloseBlocks: 0,
      auditForks: 0,
      webUsbCleanupFailures: 0,
      wssUnallowlistedConnections: 0,
    });
    expect(first.coverage).toEqual({
      paper58: 250,
      paper80: 250,
      webUsbDisconnects: 100,
      wssAckLosses: 100,
      wssTimeoutReconnects: 100,
      reloads: 100,
      quotaPressure: 100,
      concurrentPriceChanges: 100,
      partialAcks: 100,
      duplicateRequests: 100,
      duplicateReplays: 100,
      explicitReprints: 100,
      crossTenantAttempts: 100,
    });
    expect(first.samples).toHaveLength(500);
    expect(
      first.samples.every(
        (sample) =>
          sample.snapshotCoherent &&
          sample.clientPriceRejected &&
          sample.crossTenantRejected &&
          sample.duplicatePrintPrevented &&
          sample.duplicateAckPrevented &&
          sample.partialAckConverged &&
          sample.f5Recovered &&
          sample.reloadPendingPreserved &&
          sample.quotaFailurePreservedQueue &&
          sample.retryPreservedHash &&
          sample.reprintRefreshedHash &&
          sample.auditLinear &&
          sample.usbCleanedUp &&
          sample.wssAllowlistEnforced &&
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
    ['duplicate print', { duplicatePrints: 1 }],
    ['duplicate ACK', { duplicateAcknowledgedItems: 1 }],
    ['F5 loss', { lostPendingItemsAfterReload: 1 }],
    ['stale technical retry', { retriesWithRefreshedSnapshots: 1 }],
    ['stale explicit reprint', { explicitReprintsWithoutRefresh: 1 }],
    ['cash blocked', { cashCloseBlocks: 1 }],
    ['audit fork', { auditForks: 1 }],
    ['WebUSB cleanup', { webUsbCleanupFailures: 1 }],
    ['unallowlisted WSS', { wssUnallowlistedConnections: 1 }],
  ])('judge rejects %s', (_case, patch) => {
    const valid: PriceLabelPrintingChaosResult = {
      cycles: 500,
      mixedSnapshotBatches: 0,
      clientPricesAccepted: 0,
      crossTenantReads: 0,
      duplicatePrints: 0,
      duplicateAcknowledgedItems: 0,
      lostPendingItemsAfterReload: 0,
      retriesWithRefreshedSnapshots: 0,
      explicitReprintsWithoutRefresh: 0,
      cashCloseBlocks: 0,
      auditForks: 0,
      webUsbCleanupFailures: 0,
      wssUnallowlistedConnections: 0,
      coverage: {
        paper58: 250,
        paper80: 250,
        webUsbDisconnects: 100,
        wssAckLosses: 100,
        wssTimeoutReconnects: 100,
        reloads: 100,
        quotaPressure: 100,
        concurrentPriceChanges: 100,
        partialAcks: 100,
        duplicateRequests: 100,
        duplicateReplays: 100,
        explicitReprints: 100,
        crossTenantAttempts: 100,
      },
      samples: [],
    };
    expect(judgePriceLabelPrinting({ ...valid, ...patch })).toBe('FAIL');
  });
});
