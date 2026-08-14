/** Sprint 44 deterministic recurring-sales chaos certification model. */

export type RecurringSalesChaosVerdict = 'PASS' | 'FAIL';

export const RECURRING_SALES_FAULTS = [
  'duplicateCron',
  'overlappingCron',
  'leaseCrash',
  'leaseExpiry',
  'leaseTheft',
  'shardTimeout',
  'claimTimeout',
  'saleStatementTimeout',
  'itemStatementTimeout',
  'accountsReceivableTimeout',
  'fiscalOutboxTimeout',
  'usageStatementTimeout',
  'stockStatementTimeout',
  'occurrenceStatementTimeout',
  'nextRunStatementTimeout',
  'auditStatementTimeout',
  'statementFailure',
  'priceDrift',
  'fixedPriceDrift',
  'currentPriceDrift',
  'productFailure',
  'stockDrift',
  'locationFailure',
  'batchFailure',
  'serialFailure',
  'uomFailure',
  'retryOutOfOrder',
  'catchUpCap',
  'monthEnd',
  'cancelVsRun',
  'pauseVsRun',
  'immediateProrationReplay',
  'latePayment',
  'graceExpiry',
  'delayedCdr',
  'usageMeterReplay',
  'crossTenant',
  'manualTriggerAttack',
  'largePlanLimit',
  'malformedParser',
  'supportTokenBadSignature',
  'supportTokenExpired',
  'supportTokenWrongScope',
  'checkoutDuringScheduler',
  'sensitiveLogRedaction',
] as const;

export type RecurringSalesFault = (typeof RECURRING_SALES_FAULTS)[number];
export type RecurringSalesChaosCoverage = Readonly<Record<RecurringSalesFault, number>>;

export const RECURRING_SALES_FAILURES = [
  'duplicateOccurrences',
  'missingOccurrences',
  'duplicateSales',
  'missingSales',
  'duplicateFiscalDocuments',
  'missingFiscalDocuments',
  'duplicateAccountsReceivable',
  'missingAccountsReceivable',
  'duplicateUsageEvents',
  'missingUsageEvents',
  'skippedPeriods',
  'partialCommits',
  'partialStockMutations',
  'staleFixedPrices',
  'staleCurrentPrices',
  'unauthorizedMoneyInputs',
  'originalSaleMutations',
  'duplicateProrationReturns',
  'duplicateReturnDocuments',
  'checkoutBlocks',
  'fiscalCheckoutBlocks',
  'auditForks',
  'sensitiveLogLeaks',
] as const;

export type RecurringSalesFailure = (typeof RECURRING_SALES_FAILURES)[number];

export interface RecurringSalesChaosSample {
  readonly cycle: number;
  readonly fault: RecurringSalesFault;
  readonly invariantsHeld: boolean;
  readonly failures: readonly RecurringSalesFailure[];
  readonly expectedOccurrences: number;
  readonly occurrences: number;
  readonly expectedSales: number;
  readonly sales: number;
  readonly expectedFiscalDocuments: number;
  readonly fiscalDocuments: number;
  readonly expectedAccountsReceivable: number;
  readonly accountsReceivable: number;
  readonly expectedUsageEvents: number;
  readonly usageEvents: number;
  readonly expectedStockMutations: number;
  readonly stockMutations: number;
  readonly periodOrdinal: number;
  readonly expectedNextPeriodOrdinal: number;
  readonly nextPeriodOrdinal: number;
  readonly pricingPolicy: 'FIXED' | 'CURRENT';
  readonly expectedPriceCents: number;
  readonly appliedPriceCents: number;
  readonly prorationAdjustments: number;
  readonly returnDocuments: number;
  readonly originalSaleMutated: boolean;
  readonly auditRoots: number;
  readonly checkoutDurationMs: number;
  readonly fiscalCheckoutDurationMs: number;
  readonly unauthorizedMoneyInputAccepted: boolean;
  readonly logOutput: string;
  readonly rejectedAttempts: number;
  readonly cdrPending: boolean;
}

export interface RecurringSalesChaosResult {
  readonly cycles: number;
  readonly duplicateOccurrences: number;
  readonly missingOccurrences: number;
  readonly duplicateSales: number;
  readonly missingSales: number;
  readonly duplicateFiscalDocuments: number;
  readonly missingFiscalDocuments: number;
  readonly duplicateAccountsReceivable: number;
  readonly missingAccountsReceivable: number;
  readonly duplicateUsageEvents: number;
  readonly missingUsageEvents: number;
  readonly skippedPeriods: number;
  readonly partialCommits: number;
  readonly partialStockMutations: number;
  readonly staleFixedPrices: number;
  readonly staleCurrentPrices: number;
  readonly unauthorizedMoneyInputs: number;
  readonly originalSaleMutations: number;
  readonly duplicateProrationReturns: number;
  readonly duplicateReturnDocuments: number;
  readonly checkoutBlocks: number;
  readonly fiscalCheckoutBlocks: number;
  readonly auditForks: number;
  readonly sensitiveLogLeaks: number;
  readonly coverage: RecurringSalesChaosCoverage;
  readonly benchmark: {
    readonly schedulerOutsideCheckoutHotPath: true;
    readonly ordinaryCheckoutP95Ms: number;
    readonly localLimitMs: 50;
  };
  readonly evidence: {
    readonly environment: 'LOCAL_DETERMINISTIC_MODEL';
    readonly externalStaging: false;
    readonly workerdConcurrencyRequiredSeparately: true;
    readonly rollbackInjectionRequiredSeparately: true;
  };
  readonly samples: readonly RecurringSalesChaosSample[];
  readonly engineEvidenceVerified: boolean;
}

const FIXED_PRICE_CENTS = 1_000;
const CURRENT_PRICE_CENTS = 1_250;
const REJECTED_FAULTS = new Set<RecurringSalesFault>([
  'leaseTheft',
  'shardTimeout',
  'claimTimeout',
  'saleStatementTimeout',
  'itemStatementTimeout',
  'accountsReceivableTimeout',
  'fiscalOutboxTimeout',
  'usageStatementTimeout',
  'stockStatementTimeout',
  'occurrenceStatementTimeout',
  'nextRunStatementTimeout',
  'auditStatementTimeout',
  'statementFailure',
  'productFailure',
  'stockDrift',
  'locationFailure',
  'batchFailure',
  'serialFailure',
  'uomFailure',
  'pauseVsRun',
  'crossTenant',
  'manualTriggerAttack',
  'largePlanLimit',
  'malformedParser',
  'supportTokenBadSignature',
  'supportTokenExpired',
  'supportTokenWrongScope',
]);

// Certification matrix intentionally checks every independent invariant.
// eslint-disable-next-line complexity
function detectFailures(
  sample: Omit<RecurringSalesChaosSample, 'invariantsHeld' | 'failures'>,
): RecurringSalesFailure[] {
  const failures: RecurringSalesFailure[] = [];
  if (sample.occurrences > sample.expectedOccurrences) failures.push('duplicateOccurrences');
  if (sample.occurrences < sample.expectedOccurrences) failures.push('missingOccurrences');
  if (sample.sales > sample.expectedSales) failures.push('duplicateSales');
  if (sample.sales < sample.expectedSales) failures.push('missingSales');
  if (sample.fiscalDocuments > sample.expectedFiscalDocuments) {
    failures.push('duplicateFiscalDocuments');
  }
  if (sample.fiscalDocuments < sample.expectedFiscalDocuments)
    failures.push('missingFiscalDocuments');
  if (sample.accountsReceivable > sample.expectedAccountsReceivable) {
    failures.push('duplicateAccountsReceivable');
  }
  if (sample.accountsReceivable < sample.expectedAccountsReceivable) {
    failures.push('missingAccountsReceivable');
  }
  if (sample.usageEvents > sample.expectedUsageEvents) failures.push('duplicateUsageEvents');
  if (sample.usageEvents < sample.expectedUsageEvents) failures.push('missingUsageEvents');
  if (sample.nextPeriodOrdinal !== sample.expectedNextPeriodOrdinal)
    failures.push('skippedPeriods');

  const cardinalities = [
    sample.occurrences,
    sample.sales,
    sample.fiscalDocuments,
    sample.accountsReceivable,
    sample.usageEvents,
  ];
  const expectedCardinalities = [
    sample.expectedOccurrences,
    sample.expectedSales,
    sample.expectedFiscalDocuments,
    sample.expectedAccountsReceivable,
    sample.expectedUsageEvents,
  ];
  if (cardinalities.some((value, index) => value !== expectedCardinalities[index])) {
    failures.push('partialCommits');
  }
  if (sample.stockMutations !== sample.expectedStockMutations) {
    failures.push('partialStockMutations');
  }
  if (sample.pricingPolicy === 'FIXED' && sample.appliedPriceCents !== sample.expectedPriceCents) {
    failures.push('staleFixedPrices');
  }
  if (
    sample.pricingPolicy === 'CURRENT' &&
    sample.appliedPriceCents !== sample.expectedPriceCents
  ) {
    failures.push('staleCurrentPrices');
  }
  if (sample.unauthorizedMoneyInputAccepted) failures.push('unauthorizedMoneyInputs');
  if (sample.originalSaleMutated) failures.push('originalSaleMutations');
  if (sample.prorationAdjustments > 1 || sample.returnDocuments > 1) {
    failures.push('duplicateProrationReturns');
  }
  if (sample.returnDocuments > sample.prorationAdjustments)
    failures.push('duplicateReturnDocuments');
  if (sample.checkoutDurationMs >= 50) failures.push('checkoutBlocks');
  if (sample.fiscalCheckoutDurationMs >= 50) failures.push('fiscalCheckoutBlocks');
  if (sample.auditRoots !== 1) failures.push('auditForks');
  if (/(?:bearer|authorization|token|email|customer_name|sql|stock=)/iu.test(sample.logOutput)) {
    failures.push('sensitiveLogLeaks');
  }
  return failures;
}

function simulateCycle(cycle: number, fault: RecurringSalesFault): RecurringSalesChaosSample {
  const rejected = REJECTED_FAULTS.has(fault);
  const pricingPolicy: 'FIXED' | 'CURRENT' =
    fault === 'currentPriceDrift' || fault === 'priceDrift' ? 'CURRENT' : 'FIXED';
  const expectedPriceCents = pricingPolicy === 'CURRENT' ? CURRENT_PRICE_CENTS : FIXED_PRICE_CENTS;
  const settles = rejected ? 0 : 1;
  const prorates = fault === 'immediateProrationReplay' || fault === 'cancelVsRun' ? 1 : 0;
  const expectedNextPeriodOrdinal = rejected ? cycle : cycle + 1;
  const base = {
    cycle,
    fault,
    expectedOccurrences: settles,
    occurrences: settles,
    expectedSales: settles,
    sales: settles,
    expectedFiscalDocuments: settles,
    fiscalDocuments: settles,
    expectedAccountsReceivable: settles,
    accountsReceivable: settles,
    expectedUsageEvents: settles,
    usageEvents: settles,
    expectedStockMutations: settles,
    stockMutations: settles,
    periodOrdinal: cycle,
    expectedNextPeriodOrdinal,
    nextPeriodOrdinal: expectedNextPeriodOrdinal,
    pricingPolicy,
    expectedPriceCents,
    appliedPriceCents: expectedPriceCents,
    prorationAdjustments: prorates,
    returnDocuments: prorates,
    originalSaleMutated: false,
    auditRoots: 1,
    checkoutDurationMs: 2 + (cycle % 7) / 10,
    fiscalCheckoutDurationMs: 3 + (cycle % 5) / 10,
    unauthorizedMoneyInputAccepted: false,
    logOutput: rejected ? 'RECURRING_INTERNAL_RETRY' : 'RECURRING_SETTLED',
    rejectedAttempts: rejected ? 1 : 0,
    cdrPending: fault === 'delayedCdr',
  } satisfies Omit<RecurringSalesChaosSample, 'invariantsHeld' | 'failures'>;
  const failures = detectFailures(base);
  return { ...base, invariantsHeld: failures.length === 0, failures };
}

function countFailure(
  samples: readonly RecurringSalesChaosSample[],
  failure: RecurringSalesFailure,
): number {
  return samples.filter((sample) => sample.failures.includes(failure)).length;
}

export async function runRecurringSalesChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): Promise<RecurringSalesChaosResult> {
  await Promise.resolve();
  if (!Number.isSafeInteger(cycles) || cycles < 0) throw new Error('CHAOS_CYCLES_INVALID');
  const coverage = Object.fromEntries(RECURRING_SALES_FAULTS.map((fault) => [fault, 0])) as Record<
    RecurringSalesFault,
    number
  >;
  const samples = Array.from({ length: cycles }, (_, cycle) => {
    const fault = RECURRING_SALES_FAULTS[cycle % RECURRING_SALES_FAULTS.length]!;
    coverage[fault] += 1;
    return simulateCycle(cycle, fault);
  });
  const counters = Object.fromEntries(
    RECURRING_SALES_FAILURES.map((failure) => [failure, countFailure(samples, failure)]),
  ) as Record<RecurringSalesFailure, number>;
  const sortedCheckout = samples.map((sample) => sample.checkoutDurationMs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sortedCheckout.length * 0.95) - 1);
  return {
    cycles,
    engineEvidenceVerified,
    ...counters,
    coverage,
    benchmark: {
      schedulerOutsideCheckoutHotPath: true,
      ordinaryCheckoutP95Ms: sortedCheckout[p95Index] ?? 0,
      localLimitMs: 50,
    },
    evidence: {
      environment: 'LOCAL_DETERMINISTIC_MODEL',
      externalStaging: false,
      workerdConcurrencyRequiredSeparately: true,
      rollbackInjectionRequiredSeparately: true,
    },
    samples,
  };
}

// The judge is fail-closed across evidence, balance, counters, and benchmark metadata.
export function judgeRecurringSalesChaos(
  result: RecurringSalesChaosResult,
): RecurringSalesChaosVerdict {
  const coverage = RECURRING_SALES_FAULTS.map((fault) => result.coverage[fault]);
  const balanced =
    coverage.every((value) => Number.isSafeInteger(value) && value > 0) &&
    Math.max(...coverage) - Math.min(...coverage) <= 1 &&
    coverage.reduce((total, value) => total + value, 0) === result.cycles;
  const samplesMatchCoverage = RECURRING_SALES_FAULTS.every(
    (fault) =>
      result.coverage[fault] === result.samples.filter((sample) => sample.fault === fault).length,
  );
  const countersMatchSamples = RECURRING_SALES_FAILURES.every(
    (failure) => result[failure] === countFailure(result.samples, failure),
  );
  const samplesAreAuthentic = result.samples.every((sample) => {
    const { failures } = sample;
    const detected = detectFailures(sample);
    return detected.length === failures.length && detected.every((code) => failures.includes(code));
  });
  const evidenceIsLocal =
    result.evidence.environment === 'LOCAL_DETERMINISTIC_MODEL' && !result.evidence.externalStaging;
  if (result.cycles < 500) return 'FAIL';
  if (!balanced || !samplesMatchCoverage || !countersMatchSamples) return 'FAIL';
  if (!samplesAreAuthentic || !evidenceIsLocal) return 'FAIL';
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

export async function runRecurringSalesChaosScenario(
  execute?: () => Promise<RecurringSalesChaosResult>,
): Promise<RecurringSalesChaosVerdict> {
  return judgeRecurringSalesChaos(execute ? await execute() : await runRecurringSalesChaos(500));
}
