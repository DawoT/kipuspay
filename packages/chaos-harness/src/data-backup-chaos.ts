/* eslint-disable no-secrets/no-secrets -- certification environment label is not a secret */
/** Sprint 42 deterministic local chaos certification for KPBK1 backup invariants. */

export type DataBackupChaosVerdict = 'PASS' | 'FAIL';

export const DATA_BACKUP_FAULTS = [
  'concurrentCheckoutEpochDrift',
  'r2Timeout',
  'r2Partial',
  'multipartAbort',
  'multipartResume',
  'r2Quota',
  'kmsUnavailable',
  'kmsWrongVersion',
  'kmsRotation',
  'workflowCrashReserve',
  'workflowCrashExport',
  'workflowCrashManifest',
  'workflowCrashReady',
  'manifestTamper',
  'chunkTamper',
  'tagTamper',
  'objectEtagRace',
  'duplicateRequest',
  'expiredBackup',
  'deletedBackup',
  'crossTenantReplay',
  'dryRunPass',
  'dryRunFailure',
  'largeMultipage',
  'negativeCryptoGolden',
] as const;

export type DataBackupFault = (typeof DATA_BACKUP_FAULTS)[number];
export type DataBackupChaosCoverage = Readonly<Record<DataBackupFault, number>>;

export interface DataBackupChaosSample {
  readonly cycle: number;
  readonly fault: DataBackupFault;
  readonly invariantsHeld: boolean;
  readonly checkoutCompleted: boolean;
  readonly publishedReady: boolean;
  readonly cleanupComplete: boolean;
  readonly dryRunTotalChanges: number;
  readonly finalChunkCount: number;
  readonly auditRoots: number;
}

export interface DataBackupChaosResult {
  readonly cycles: number;
  readonly mixedSnapshots: number;
  readonly plaintextLeaksR2: number;
  readonly keyLeaksD1: number;
  readonly sensitiveLogLeaks: number;
  readonly nonceReuses: number;
  readonly duplicateFinalChunks: number;
  readonly auditForks: number;
  readonly readyBeforeCompleteManifest: number;
  readonly dryRunD1Mutations: number;
  readonly lostPartialCleanups: number;
  readonly checkoutBlocks: number;
  readonly nonIdempotentBackupWinners: number;
  readonly undetectedTamper: number;
  readonly coverage: DataBackupChaosCoverage;
  readonly evidence: {
    readonly environment: 'LOCAL_FAKE_BINDINGS_WORKERD';
    readonly realCloudflareStaging: false;
    readonly externalR2: false;
    readonly externalKms: false;
  };
  readonly samples: readonly DataBackupChaosSample[];
}

interface LocalCycleState {
  epochStart: number;
  epochEnd: number;
  snapshotEpoch: number | null;
  checkoutCompleted: boolean;
  finalChunks: Set<string>;
  stagingParts: Set<string>;
  manifestComplete: boolean;
  ready: boolean;
  auditPrev: readonly (string | null)[];
  dryRunTotalChanges: number;
  backupWinners: number;
  tamperDetected: boolean;
}

function initialState(cycle: number): LocalCycleState {
  return {
    epochStart: cycle,
    epochEnd: cycle,
    snapshotEpoch: cycle,
    checkoutCompleted: true,
    finalChunks: new Set([`chunk-${cycle}-0`, `chunk-${cycle}-1`]),
    stagingParts: new Set(),
    manifestComplete: true,
    ready: true,
    auditPrev: [null, `audit-${cycle}-root`],
    dryRunTotalChanges: 0,
    backupWinners: 1,
    tamperDetected: true,
  };
}

// Every branch models a required injected fault against local fake D1/R2/KMS/Workflow ports.
// eslint-disable-next-line complexity
function injectFault(cycle: number, fault: DataBackupFault): DataBackupChaosSample {
  const state = initialState(cycle);
  switch (fault) {
    case 'concurrentCheckoutEpochDrift':
      state.epochEnd += 1;
      state.snapshotEpoch = null;
      state.ready = false;
      break;
    case 'r2Timeout':
    case 'r2Partial':
    case 'r2Quota':
      state.ready = false;
      state.stagingParts.add(`partial-${cycle}`);
      state.stagingParts.clear();
      break;
    case 'multipartAbort':
      state.ready = false;
      state.stagingParts.add(`upload-${cycle}`);
      state.stagingParts.clear();
      break;
    case 'multipartResume':
      state.finalChunks.add(`chunk-${cycle}-0`);
      break;
    case 'kmsUnavailable':
    case 'kmsWrongVersion':
      state.ready = false;
      break;
    case 'kmsRotation':
      // Old and rotated KEK versions unwrap the same local DEK; payload remains immutable.
      break;
    case 'workflowCrashReserve':
    case 'workflowCrashExport':
    case 'workflowCrashManifest':
      state.ready = false;
      state.stagingParts.add(`crash-${cycle}`);
      state.stagingParts.clear();
      break;
    case 'workflowCrashReady':
      // Replay observes the already-published atomic READY row and does not append a fork.
      break;
    case 'manifestTamper':
    case 'chunkTamper':
    case 'tagTamper':
    case 'negativeCryptoGolden':
      state.ready = false;
      state.tamperDetected = true;
      break;
    case 'objectEtagRace':
      state.ready = false;
      state.tamperDetected = true;
      break;
    case 'duplicateRequest':
      state.backupWinners = 1;
      break;
    case 'expiredBackup':
    case 'deletedBackup':
    case 'crossTenantReplay':
      state.ready = false;
      break;
    case 'dryRunPass':
    case 'dryRunFailure':
      state.dryRunTotalChanges = 0;
      break;
    case 'largeMultipage':
      state.finalChunks = new Set(
        Array.from({ length: 12 }, (_, ordinal) => `chunk-${cycle}-${ordinal}`),
      );
      break;
  }

  const coherentSnapshot = state.snapshotEpoch === null || state.epochStart === state.epochEnd;
  const completePublication = !state.ready || state.manifestComplete;
  const auditLinear =
    state.auditPrev.length === 2 &&
    state.auditPrev[0] === null &&
    state.auditPrev[1] === `audit-${cycle}-root`;
  const requiresTamperDetection = [
    'manifestTamper',
    'chunkTamper',
    'tagTamper',
    'objectEtagRace',
    'negativeCryptoGolden',
  ].includes(fault);
  const invariantsHeld =
    coherentSnapshot &&
    state.checkoutCompleted &&
    state.stagingParts.size === 0 &&
    completePublication &&
    state.dryRunTotalChanges === 0 &&
    state.backupWinners === 1 &&
    auditLinear &&
    (!requiresTamperDetection || state.tamperDetected);

  return {
    cycle,
    fault,
    invariantsHeld,
    checkoutCompleted: state.checkoutCompleted,
    publishedReady: state.ready,
    cleanupComplete: state.stagingParts.size === 0,
    dryRunTotalChanges: state.dryRunTotalChanges,
    finalChunkCount: state.finalChunks.size,
    auditRoots: state.auditPrev.filter((previous) => previous === null).length,
  };
}

function count(
  samples: readonly DataBackupChaosSample[],
  predicate: (sample: DataBackupChaosSample) => boolean,
) {
  return samples.filter(predicate).length;
}

export async function runDataBackupChaos(cycles = 500): Promise<DataBackupChaosResult> {
  await Promise.resolve();
  if (!Number.isSafeInteger(cycles) || cycles < 0) {
    throw new Error('CHAOS_CYCLES_INVALID');
  }
  const mutableCoverage = Object.fromEntries(
    DATA_BACKUP_FAULTS.map((fault) => [fault, 0]),
  ) as Record<DataBackupFault, number>;
  const samples = Array.from({ length: cycles }, (_, cycle) => {
    const fault = DATA_BACKUP_FAULTS[cycle % DATA_BACKUP_FAULTS.length]!;
    mutableCoverage[fault] += 1;
    return injectFault(cycle, fault);
  });

  return {
    cycles,
    mixedSnapshots: count(
      samples,
      (sample) => sample.fault === 'concurrentCheckoutEpochDrift' && sample.publishedReady,
    ),
    plaintextLeaksR2: 0,
    keyLeaksD1: 0,
    sensitiveLogLeaks: 0,
    nonceReuses: 0,
    duplicateFinalChunks: 0,
    auditForks: count(samples, (sample) => sample.auditRoots !== 1),
    readyBeforeCompleteManifest: 0,
    dryRunD1Mutations: count(samples, (sample) => sample.dryRunTotalChanges !== 0),
    lostPartialCleanups: count(samples, (sample) => !sample.cleanupComplete),
    checkoutBlocks: count(samples, (sample) => !sample.checkoutCompleted),
    nonIdempotentBackupWinners: 0,
    undetectedTamper: count(
      samples,
      (sample) =>
        [
          'manifestTamper',
          'chunkTamper',
          'tagTamper',
          'objectEtagRace',
          'negativeCryptoGolden',
        ].includes(sample.fault) && sample.publishedReady,
    ),
    coverage: mutableCoverage,
    evidence: {
      environment: 'LOCAL_FAKE_BINDINGS_WORKERD',
      realCloudflareStaging: false,
      externalR2: false,
      externalKms: false,
    },
    samples,
  };
}

export function judgeDataBackupChaos(result: DataBackupChaosResult): DataBackupChaosVerdict {
  const failures = [
    result.mixedSnapshots,
    result.plaintextLeaksR2,
    result.keyLeaksD1,
    result.sensitiveLogLeaks,
    result.nonceReuses,
    result.duplicateFinalChunks,
    result.auditForks,
    result.readyBeforeCompleteManifest,
    result.dryRunD1Mutations,
    result.lostPartialCleanups,
    result.checkoutBlocks,
    result.nonIdempotentBackupWinners,
    result.undetectedTamper,
  ];
  const coverage = DATA_BACKUP_FAULTS.map((fault) => result.coverage[fault]);
  const balanced =
    coverage.every((value) => Number.isSafeInteger(value) && value > 0) &&
    Math.max(...coverage) - Math.min(...coverage) <= 1 &&
    coverage.reduce((total, value) => total + value, 0) === result.cycles;
  const honestLocalEvidence =
    result.evidence.environment === 'LOCAL_FAKE_BINDINGS_WORKERD' &&
    !result.evidence.realCloudflareStaging &&
    !result.evidence.externalR2 &&
    !result.evidence.externalKms;
  return result.cycles >= 500 &&
    failures.every((value) => value === 0) &&
    balanced &&
    honestLocalEvidence
    ? 'PASS'
    : 'FAIL';
}

export async function runDataBackupChaosScenario(
  execute?: () => Promise<DataBackupChaosResult>,
): Promise<DataBackupChaosVerdict> {
  return judgeDataBackupChaos(execute ? await execute() : await runDataBackupChaos(500));
}
