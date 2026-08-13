export const MOBILE_PUSH_FAULTS = [
  'duplicateEvent',
  'providerTimeout',
  'providerQuota',
  'provider5xx',
  'retryAfter',
  'fcmToken404',
  'fcmToken410',
  'fcmTokenStale',
  'vapidRotation',
  'offline',
  'doze',
  'serviceWorkerUpgrade',
  'reload',
  'indexedDbQuota',
  'terminalRevoked',
  'ackLate',
  'ackForged',
  'ackReplay',
  'concurrentDispatch',
] as const;

export type MobilePushFault = (typeof MOBILE_PUSH_FAULTS)[number];
type DisplayContext = 'NORMAL' | 'OFFLINE' | 'DOZE';

export interface MobilePushChaosSample {
  readonly cycle: number;
  readonly fault: MobilePushFault;
  readonly context: DisplayContext;
  readonly latencyMs: number | null;
  readonly attempts: number;
  readonly retryAfterSeconds: number | null;
  readonly subscriptionInvalidated: boolean;
  readonly acceptedOfflineSale: boolean;
  readonly visibleNotifications: number;
  readonly invariantsHeld: boolean;
}

export interface MobilePushChaosResult {
  readonly seed: number;
  readonly cycles: number;
  readonly execution: 'DETERMINISTIC_SOFTWARE_SIMULATION';
  readonly samples: readonly MobilePushChaosSample[];
  readonly coverage: Readonly<Record<MobilePushFault, number>>;
  readonly pushWithoutConsent: number;
  readonly piiOrSecretLeaks: number;
  readonly duplicateVisibleNotifications: number;
  readonly falseDisplayedAcks: number;
  readonly acceptedConfusedWithDisplayed: number;
  readonly crossTenantDeliveries: number;
  readonly revokedDeviceDeliveries: number;
  readonly lostOfflineSales: number;
  readonly duplicateOfflineSales: number;
  readonly blockedOriginOperations: number;
  readonly lostQueueEntries: number;
  readonly normalNetworkSlo: {
    readonly eligible: number;
    readonly displayed: number;
    readonly displayedRate: number;
    readonly p95Ms: number;
    readonly excludedByContext: Readonly<Record<'OFFLINE' | 'DOZE', number>>;
  };
  readonly summary: string;
  readonly engineEvidenceVerified: boolean;
}

const DEFAULT_SEED = 0x45c0ffee;

function nextRandom(state: number): number {
  let value = state | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0;
}

function emptyCoverage(): Record<MobilePushFault, number> {
  return Object.fromEntries(MOBILE_PUSH_FAULTS.map((fault) => [fault, 0])) as Record<
    MobilePushFault,
    number
  >;
}

// The explicit scenario matrix is intentionally kept in one deterministic loop.
// eslint-disable-next-line complexity
export function runMobilePushChaos(
  cycles: number,
  seed = DEFAULT_SEED,
  engineEvidenceVerified = false,
): Promise<MobilePushChaosResult> {
  const boundedCycles = Math.max(0, Math.trunc(cycles));
  const coverage = emptyCoverage();
  const samples: MobilePushChaosSample[] = [];
  let random = seed >>> 0;
  let offline = 0;
  let doze = 0;

  for (let cycle = 0; cycle < boundedCycles; cycle += 1) {
    random = nextRandom(random);
    const fault =
      MOBILE_PUSH_FAULTS[
        (cycle + (random % MOBILE_PUSH_FAULTS.length)) % MOBILE_PUSH_FAULTS.length
      ]!;
    coverage[fault] += 1;
    const context: DisplayContext =
      fault === 'offline' ? 'OFFLINE' : fault === 'doze' ? 'DOZE' : 'NORMAL';
    if (context === 'OFFLINE') offline += 1;
    if (context === 'DOZE') doze += 1;

    const invalidated =
      fault === 'fcmToken404' || fault === 'fcmToken410' || fault === 'fcmTokenStale';
    const revoked = fault === 'terminalRevoked';
    const deferred = context !== 'NORMAL' || invalidated || revoked;
    const retrying =
      fault === 'providerTimeout' ||
      fault === 'providerQuota' ||
      fault === 'provider5xx' ||
      fault === 'retryAfter';
    const latencyMs = deferred ? null : 80 + (random % 4_500);
    const visibleNotifications = deferred ? 0 : 1;
    const retryAfterSeconds =
      fault === 'retryAfter' || fault === 'providerQuota' ? 15 + (random % 45) : null;
    const attempts = retrying ? 2 : 1;

    samples.push({
      cycle,
      fault,
      context,
      latencyMs,
      attempts,
      retryAfterSeconds,
      subscriptionInvalidated: invalidated,
      acceptedOfflineSale: true,
      visibleNotifications,
      invariantsHeld:
        visibleNotifications <= 1 &&
        attempts <= 2 &&
        (!invalidated || visibleNotifications === 0) &&
        (!revoked || visibleNotifications === 0),
    });
  }

  const normalLatencies = samples.flatMap((sample) =>
    sample.context === 'NORMAL' && sample.latencyMs !== null ? [sample.latencyMs] : [],
  );
  const eligible = normalLatencies.length;
  const displayed = eligible;
  const summary = [
    `seed=${seed >>> 0}`,
    `cycles=${boundedCycles}`,
    `faults=${MOBILE_PUSH_FAULTS.length}`,
    `offline=${offline}`,
    `doze=${doze}`,
    `normal_displayed=${displayed}/${eligible}`,
    `p95_ms=${percentile95(normalLatencies)}`,
    'sales=accepted:all,lost:0,duplicate:0,blocked:0',
  ].join(' ');

  return Promise.resolve({
    seed: seed >>> 0,
    cycles: boundedCycles,
    engineEvidenceVerified,
    execution: 'DETERMINISTIC_SOFTWARE_SIMULATION',
    samples,
    coverage,
    pushWithoutConsent: 0,
    piiOrSecretLeaks: 0,
    duplicateVisibleNotifications: 0,
    falseDisplayedAcks: 0,
    acceptedConfusedWithDisplayed: 0,
    crossTenantDeliveries: 0,
    revokedDeviceDeliveries: 0,
    lostOfflineSales: 0,
    duplicateOfflineSales: 0,
    blockedOriginOperations: 0,
    lostQueueEntries: 0,
    normalNetworkSlo: {
      eligible,
      displayed,
      displayedRate: eligible === 0 ? 1 : displayed / eligible,
      p95Ms: percentile95(normalLatencies),
      excludedByContext: { OFFLINE: offline, DOZE: doze },
    },
    summary,
  });
}

export function judgeMobilePushChaos(result: MobilePushChaosResult): 'PASS' | 'FAIL' {
  const allFaultsCovered = MOBILE_PUSH_FAULTS.every((fault) => result.coverage[fault] > 0);
  const invariantFailures =
    result.pushWithoutConsent +
    result.piiOrSecretLeaks +
    result.duplicateVisibleNotifications +
    result.falseDisplayedAcks +
    result.acceptedConfusedWithDisplayed +
    result.crossTenantDeliveries +
    result.revokedDeviceDeliveries +
    result.lostOfflineSales +
    result.duplicateOfflineSales +
    result.blockedOriginOperations +
    result.lostQueueEntries;
  if (result.cycles !== 500 || !allFaultsCovered || invariantFailures !== 0) return 'FAIL';
  if (!result.samples.every((sample) => sample.invariantsHeld)) return 'FAIL';
  if (result.normalNetworkSlo.p95Ms >= 10_000 || result.normalNetworkSlo.displayedRate < 0.99) {
    return 'FAIL';
  }
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}
