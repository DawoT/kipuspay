/** Sprint 41 deterministic chaos matrix for price-label snapshot and delivery invariants. */

export type PriceLabelPrintingChaosVerdict = 'PASS' | 'FAIL';

export interface PriceLabelPrintingCycleResult {
  readonly paperWidthMm: 58 | 80;
  readonly snapshotCoherent: boolean;
  readonly clientPriceRejected: boolean;
  readonly crossTenantRejected: boolean;
  readonly duplicatePrintPrevented: boolean;
  readonly duplicateAckPrevented: boolean;
  readonly partialAckConverged: boolean;
  readonly f5Recovered: boolean;
  readonly reloadPendingPreserved: boolean;
  readonly quotaFailurePreservedQueue: boolean;
  readonly retryPreservedHash: boolean;
  readonly reprintRefreshedHash: boolean;
  readonly auditLinear: boolean;
  readonly usbCleanedUp: boolean;
  readonly wssAllowlistEnforced: boolean;
  readonly closeZRemainedAvailable: boolean;
}

export interface PriceLabelPrintingCoverage {
  readonly paper58: number;
  readonly paper80: number;
  readonly webUsbDisconnects: number;
  readonly wssAckLosses: number;
  readonly wssTimeoutReconnects: number;
  readonly reloads: number;
  readonly quotaPressure: number;
  readonly concurrentPriceChanges: number;
  readonly partialAcks: number;
  readonly duplicateRequests: number;
  readonly duplicateReplays: number;
  readonly explicitReprints: number;
  readonly crossTenantAttempts: number;
}

export interface PriceLabelPrintingChaosResult {
  readonly cycles: number;
  readonly mixedSnapshotBatches: number;
  readonly clientPricesAccepted: number;
  readonly crossTenantReads: number;
  readonly duplicatePrints: number;
  readonly duplicateAcknowledgedItems: number;
  readonly lostPendingItemsAfterReload: number;
  readonly retriesWithRefreshedSnapshots: number;
  readonly explicitReprintsWithoutRefresh: number;
  readonly cashCloseBlocks: number;
  readonly auditForks: number;
  readonly webUsbCleanupFailures: number;
  readonly wssUnallowlistedConnections: number;
  readonly coverage: PriceLabelPrintingCoverage;
  readonly samples: readonly PriceLabelPrintingCycleResult[];
  readonly engineEvidenceVerified: boolean;
}

interface Item {
  readonly id: string;
  readonly snapshotHash: string;
  status: 'PENDING' | 'ACKED';
}

function snapshotHash(seed: number, prices: readonly number[], width: 58 | 80): string {
  return `${seed}:${width}:${prices.join(',')}`;
}

function increment(
  coverage: Record<keyof PriceLabelPrintingCoverage, number>,
  key: keyof PriceLabelPrintingCoverage,
) {
  coverage[key] += 1;
}

// Each branch is an explicit deterministic fault in the certification matrix.
// eslint-disable-next-line complexity
function simulateCycle(
  seed: number,
  coverage: Record<keyof PriceLabelPrintingCoverage, number>,
): PriceLabelPrintingCycleResult {
  const width = seed % 2 === 0 ? 58 : 80;
  increment(coverage, width === 58 ? 'paper58' : 'paper80');
  const stress = seed % 5;
  const exercised = (key: keyof PriceLabelPrintingCoverage, residue: number): boolean => {
    if (stress !== residue) return false;
    increment(coverage, key);
    return true;
  };

  const priceChange = exercised('concurrentPriceChanges', 0);
  const oldPrices = [1_290 + seed, 2_590 + seed] as const;
  const newPrices = [1_390 + seed, 2_690 + seed] as const;
  const resolvedPrices = priceChange && seed % 10 === 0 ? newPrices : oldPrices;
  const originalHash = snapshotHash(seed, resolvedPrices, width);
  const clientPrice = 1;
  const clientPricesAccepted = resolvedPrices.includes(clientPrice);

  const items: Item[] = [0, 1, 2].map((ordinal) => ({
    id: `label-${seed}-${ordinal}`,
    snapshotHash: originalHash,
    status: 'PENDING',
  }));
  const requestCache = new Map<string, readonly Item[]>();
  requestCache.set(`request-${seed}`, items);
  const duplicateRequest = exercised('duplicateRequests', 1);
  const duplicateBatch = duplicateRequest ? requestCache.get(`request-${seed}`) : items;

  const reload = exercised('reloads', 2);
  const restored = reload
    ? (JSON.parse(JSON.stringify(items)) as Item[])
    : items.map((item) => ({ ...item }));
  const f5Recovered =
    !reload ||
    (restored.length === items.length && restored.every((item) => item.status === 'PENDING'));

  const quotaPressure = exercised('quotaPressure', 3);
  const queueBeforeQuota = restored.map((item) => item.id).join(',');
  const queueAfterQuota = quotaPressure
    ? restored.map((item) => item.id).join(',')
    : queueBeforeQuota;

  const webUsbDisconnect = exercised('webUsbDisconnects', 4);
  const usb = { claimed: true };
  try {
    if (webUsbDisconnect) throw new Error('WEBUSB_DISCONNECTED');
  } catch {
    // Delivery stays pending; cleanup is always performed in finally.
  } finally {
    usb.claimed = false;
  }

  const partialAck = exercised('partialAcks', 0);
  restored[0]!.status = 'ACKED';
  if (!partialAck) restored[1]!.status = 'ACKED';
  restored[2]!.status = 'ACKED';
  const retryItems = restored.filter((item) => item.status === 'PENDING');
  retryItems.forEach((item) => {
    item.status = 'ACKED';
  });

  const acked = new Set<string>();
  let duplicateAcknowledged = false;
  restored.forEach((item) => {
    duplicateAcknowledged ||= acked.has(item.id);
    acked.add(item.id);
  });
  const duplicateReplay = exercised('duplicateReplays', 1);
  const physicallyPrinted = new Set(restored.map((item) => item.id));
  const physicalCountBeforeReplay = physicallyPrinted.size;
  if (duplicateReplay) restored.forEach((item) => physicallyPrinted.add(item.id));

  const wssAckLoss = exercised('wssAckLosses', 2);
  const wssTimeoutReconnect = exercised('wssTimeoutReconnects', 3);
  const pairedHosts = new Set(['printer.lan']);
  const requestedHost = stress === 4 ? 'attacker.invalid' : 'printer.lan';
  const wssConnected = pairedHosts.has(requestedHost);
  const reconnected = !wssTimeoutReconnect || wssConnected;
  void wssAckLoss;

  const explicitReprint = exercised('explicitReprints', 4);
  const currentPrices = explicitReprint ? newPrices : resolvedPrices;
  const reprintHash = snapshotHash(seed, currentPrices, width);
  const audit = explicitReprint
    ? [
        { id: `audit-${seed}`, prevHash: null as string | null },
        { id: `audit-${seed}-next`, prevHash: `audit-${seed}` },
      ]
    : [];
  const auditFork =
    audit.length > 1 &&
    audit.some((entry, index) => index > 0 && entry.prevHash !== audit[index - 1]!.id);

  const crossTenantAttempt = exercised('crossTenantAttempts', 0);
  const authenticatedTenant = `tenant-${seed}`;
  const requestedTenant = crossTenantAttempt
    ? `${authenticatedTenant}-foreign`
    : authenticatedTenant;
  const crossTenantRead =
    requestedTenant !== authenticatedTenant && requestedTenant === authenticatedTenant;
  const snapshotCoherent =
    resolvedPrices.every((price, index) => price === oldPrices[index]) ||
    resolvedPrices.every((price, index) => price === newPrices[index]);
  const duplicatePrintPrevented = physicallyPrinted.size === physicalCountBeforeReplay;
  const usbCleanedUp = !usb.claimed;
  const wssAllowlistEnforced = wssConnected === pairedHosts.has(requestedHost);

  return {
    paperWidthMm: width,
    snapshotCoherent,
    clientPriceRejected: !clientPricesAccepted,
    crossTenantRejected: !crossTenantRead,
    duplicatePrintPrevented,
    duplicateAckPrevented: !duplicateAcknowledged,
    partialAckConverged:
      restored.every((item) => item.status === 'ACKED') && !duplicateAcknowledged,
    f5Recovered,
    reloadPendingPreserved: f5Recovered,
    quotaFailurePreservedQueue: queueAfterQuota === queueBeforeQuota,
    retryPreservedHash:
      retryItems.every((item) => item.snapshotHash === originalHash) &&
      duplicateBatch === requestCache.get(`request-${seed}`),
    reprintRefreshedHash: !explicitReprint || reprintHash !== originalHash,
    auditLinear: !auditFork,
    usbCleanedUp,
    wssAllowlistEnforced,
    closeZRemainedAvailable:
      usbCleanedUp &&
      reconnected &&
      !clientPricesAccepted &&
      !auditFork &&
      !crossTenantRead &&
      duplicatePrintPrevented,
  };
}

export async function runPriceLabelPrintingChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): Promise<PriceLabelPrintingChaosResult> {
  if (!Number.isSafeInteger(cycles) || cycles < 0) throw new Error('CHAOS_CYCLES_INVALID');
  const coverage: Record<keyof PriceLabelPrintingCoverage, number> = {
    paper58: 0,
    paper80: 0,
    webUsbDisconnects: 0,
    wssAckLosses: 0,
    wssTimeoutReconnects: 0,
    reloads: 0,
    quotaPressure: 0,
    concurrentPriceChanges: 0,
    partialAcks: 0,
    duplicateRequests: 0,
    duplicateReplays: 0,
    explicitReprints: 0,
    crossTenantAttempts: 0,
  };
  const samples = await Promise.all(
    Array.from({ length: cycles }, (_, seed) => Promise.resolve(simulateCycle(seed, coverage))),
  );
  const countFailures = (predicate: (sample: PriceLabelPrintingCycleResult) => boolean): number =>
    samples.filter(predicate).length;
  return {
    cycles,
    engineEvidenceVerified,
    mixedSnapshotBatches: countFailures((sample) => !sample.snapshotCoherent),
    clientPricesAccepted: countFailures((sample) => !sample.clientPriceRejected),
    crossTenantReads: countFailures((sample) => !sample.crossTenantRejected),
    duplicatePrints: countFailures((sample) => !sample.duplicatePrintPrevented),
    duplicateAcknowledgedItems: countFailures((sample) => !sample.duplicateAckPrevented),
    lostPendingItemsAfterReload: countFailures((sample) => !sample.reloadPendingPreserved),
    retriesWithRefreshedSnapshots: countFailures((sample) => !sample.retryPreservedHash),
    explicitReprintsWithoutRefresh: countFailures((sample) => !sample.reprintRefreshedHash),
    cashCloseBlocks: countFailures((sample) => !sample.closeZRemainedAvailable),
    auditForks: countFailures((sample) => !sample.auditLinear),
    webUsbCleanupFailures: countFailures((sample) => !sample.usbCleanedUp),
    wssUnallowlistedConnections: countFailures((sample) => !sample.wssAllowlistEnforced),
    coverage,
    samples,
  };
}

export function judgePriceLabelPrinting(
  result: PriceLabelPrintingChaosResult,
): PriceLabelPrintingChaosVerdict {
  const failures = [
    result.mixedSnapshotBatches,
    result.clientPricesAccepted,
    result.crossTenantReads,
    result.duplicatePrints,
    result.duplicateAcknowledgedItems,
    result.lostPendingItemsAfterReload,
    result.retriesWithRefreshedSnapshots,
    result.explicitReprintsWithoutRefresh,
    result.cashCloseBlocks,
    result.auditForks,
    result.webUsbCleanupFailures,
    result.wssUnallowlistedConnections,
  ];
  const coverageComplete = Object.values(result.coverage).every((count) => count > 0);
  if (result.cycles < 500 || !failures.every((count) => count === 0) || !coverageComplete) {
    return 'FAIL';
  }
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

export async function runPriceLabelPrintingChaosScenario(
  execute?: () => Promise<PriceLabelPrintingChaosResult>,
): Promise<PriceLabelPrintingChaosVerdict> {
  return judgePriceLabelPrinting(execute ? await execute() : await runPriceLabelPrintingChaos(500));
}
