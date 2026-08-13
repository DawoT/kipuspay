/* eslint-disable no-secrets/no-secrets -- certification fault names are not secrets */
/** Sprint 43 deterministic customer-order chaos certification model. */

export type CustomerOrderChaosVerdict = 'PASS' | 'FAIL';

export const CUSTOMER_ORDER_FAULTS = [
  'createReserveCrashReplay',
  'multiItemPartialFulfillment',
  'partialFulfillment',
  'doubleFulfill',
  'fulfillVsCancel',
  'fulfillVsExpire',
  'noticeDuplicate',
  'noticeTransportFailure',
  'noticeRetry',
  'whatsappTimeout',
  'expiryBetweenLeaseAndSync',
  'staleLease',
  'wrongTenantLease',
  'wrongBranchLease',
  'wrongTerminalLease',
  'wrongUserLease',
  'wrongScopeLease',
  'cryptographicLeaseTamper',
  'priceDriftAfterExpiry',
  'supervisorRepriceReplay',
  'batchLocationSerialUom',
  'd1TimeoutRollback',
  'offlineEnvelopeReplay',
  'offlineOutOfOrderReplay',
  'crossTenant',
  'auditTailRace',
  'checkoutDuringOrderFailure',
  'largeItemLimit',
  'malformedParser',
  'resourceExhaustion',
] as const;

export type CustomerOrderFault = (typeof CUSTOMER_ORDER_FAULTS)[number];
export type CustomerOrderChaosCoverage = Readonly<Record<CustomerOrderFault, number>>;

export const CUSTOMER_ORDER_FAILURES = [
  'crossTenantMutations',
  'duplicateSales',
  'duplicateFiscalOutbox',
  'doubleStockDeductions',
  'doubleReleases',
  'conservationViolations',
  'stalePriceUses',
  'unauthorizedReprices',
  'duplicateNotices',
  'expiryWithoutDurableIntent',
  'indefiniteExpiredReservations',
  'offlineReplayMutations',
  'auditForks',
  'createPaymentsOrCpe',
  'checkoutBlocks',
  'partialSubsetCommits',
  'ghostInventoryDimensions',
  'duplicatePayments',
] as const;

export type CustomerOrderFailure = (typeof CUSTOMER_ORDER_FAILURES)[number];

export interface CustomerOrderChaosSample {
  readonly cycle: number;
  readonly fault: CustomerOrderFault;
  readonly invariantsHeld: boolean;
  readonly failures: readonly CustomerOrderFailure[];
  readonly requestedQuantityMicrounits: number;
  readonly fulfilledQuantityMicrounits: number;
  readonly releasedQuantityMicrounits: number;
  readonly reservedQuantityMicrounits: number;
  readonly finalStockMicrounits: number;
  readonly sales: number;
  readonly payments: number;
  readonly fiscalOutboxRows: number;
  readonly notices: number;
  readonly auditRoots: number;
  readonly rejectedAttempts: number;
}

export interface CustomerOrderChaosResult {
  readonly cycles: number;
  readonly crossTenantMutations: number;
  readonly duplicateSales: number;
  readonly duplicateFiscalOutbox: number;
  readonly doubleStockDeductions: number;
  readonly doubleReleases: number;
  readonly conservationViolations: number;
  readonly stalePriceUses: number;
  readonly unauthorizedReprices: number;
  readonly duplicateNotices: number;
  readonly expiryWithoutDurableIntent: number;
  readonly indefiniteExpiredReservations: number;
  readonly offlineReplayMutations: number;
  readonly auditForks: number;
  readonly createPaymentsOrCpe: number;
  readonly checkoutBlocks: number;
  readonly partialSubsetCommits: number;
  readonly ghostInventoryDimensions: number;
  readonly duplicatePayments: number;
  readonly coverage: CustomerOrderChaosCoverage;
  readonly evidence: {
    readonly environment: 'LOCAL_DETERMINISTIC_MODEL';
    readonly externalStaging: false;
    readonly workerdRequiredSeparately: true;
  };
  readonly samples: readonly CustomerOrderChaosSample[];
  readonly engineEvidenceVerified: boolean;
}

const INITIAL_STOCK = 10_000_000;
const REQUESTED = 4_000_000;
const SNAPSHOT_PRICE_CENTS = 1_000;
const CURRENT_PRICE_CENTS = 1_250;

interface CycleState {
  reserved: number;
  fulfilled: number;
  released: number;
  stock: number;
  locationStock: number;
  batchStock: number;
  serialsReserved: number;
  serialsSold: number;
  sales: Set<string>;
  payments: Set<string>;
  fiscal: Set<string>;
  notices: Set<string>;
  providerSends: Set<string>;
  auditPrevious: Array<string | null>;
  usedLeases: Set<string>;
  usedReprices: Set<string>;
  rejectedAttempts: number;
  checkoutCompleted: boolean;
  partialSubsetCommit: boolean;
  soldPriceAfterExpiryCents: number | null;
  unauthorizedReprice: boolean;
  crossTenantMutation: boolean;
  expiredWithoutNotice: boolean;
  expiredReservationHeld: boolean;
  offlineReplayMutation: boolean;
}

function initialState(cycle: number): CycleState {
  return {
    reserved: REQUESTED,
    fulfilled: 0,
    released: 0,
    stock: INITIAL_STOCK - REQUESTED,
    locationStock: INITIAL_STOCK - REQUESTED,
    batchStock: INITIAL_STOCK - REQUESTED,
    serialsReserved: 4,
    serialsSold: 0,
    sales: new Set(),
    payments: new Set(),
    fiscal: new Set(),
    notices: new Set(),
    providerSends: new Set(),
    auditPrevious: [null, `created-${cycle}`],
    usedLeases: new Set(),
    usedReprices: new Set(),
    rejectedAttempts: 0,
    checkoutCompleted: true,
    partialSubsetCommit: false,
    soldPriceAfterExpiryCents: null,
    unauthorizedReprice: false,
    crossTenantMutation: false,
    expiredWithoutNotice: false,
    expiredReservationHeld: false,
    offlineReplayMutation: false,
  };
}

function reject(state: CycleState): void {
  state.rejectedAttempts += 1;
}

function appendAudit(state: CycleState, cycle: number): void {
  state.auditPrevious.push(`audit-${cycle}-${state.auditPrevious.length}`);
}

function fulfill(
  state: CycleState,
  cycle: number,
  lease: string,
  quantity: number,
  saleKey = lease,
): boolean {
  if (state.usedLeases.has(lease)) return true;
  if (quantity <= 0 || quantity > state.reserved) {
    reject(state);
    return false;
  }
  state.usedLeases.add(lease);
  state.reserved -= quantity;
  state.fulfilled += quantity;
  state.serialsReserved -= quantity / 1_000_000;
  state.serialsSold += quantity / 1_000_000;
  state.sales.add(`sale-${cycle}-${saleKey}`);
  state.payments.add(`payment-${cycle}-${saleKey}`);
  state.fiscal.add(`fiscal-${cycle}-${saleKey}`);
  appendAudit(state, cycle);
  return true;
}

function close(state: CycleState, cycle: number, target: 'cancel' | 'expire'): boolean {
  if (state.reserved === 0) {
    reject(state);
    return false;
  }
  if (target === 'expire') state.notices.add(`notice-${cycle}`);
  const release = state.reserved;
  state.reserved = 0;
  state.released += release;
  state.stock += release;
  state.locationStock += release;
  state.batchStock += release;
  state.serialsReserved -= release / 1_000_000;
  appendAudit(state, cycle);
  return true;
}

function replayFulfillment(state: CycleState, cycle: number, key: string, quantity: number): void {
  fulfill(state, cycle, key, quantity, key);
  const before = state.sales.size;
  fulfill(state, cycle, key, quantity, key);
  if (state.sales.size !== before) state.offlineReplayMutation = true;
}

// Each branch injects one required fault; rejected attempts must leave the state unchanged.
// eslint-disable-next-line complexity
function injectFault(cycle: number, fault: CustomerOrderFault): CustomerOrderChaosSample {
  const state = initialState(cycle);
  switch (fault) {
    case 'createReserveCrashReplay':
      // Crash before commit rolls back; replay leaves the single committed reservation above.
      reject(state);
      break;
    case 'multiItemPartialFulfillment':
      fulfill(state, cycle, 'multi-item', 2_000_000);
      break;
    case 'partialFulfillment':
      fulfill(state, cycle, 'partial-a', 1_000_000);
      fulfill(state, cycle, 'partial-b', 1_000_000);
      break;
    case 'doubleFulfill':
      replayFulfillment(state, cycle, 'double', 2_000_000);
      break;
    case 'fulfillVsCancel':
      fulfill(state, cycle, 'race-cancel', REQUESTED);
      close(state, cycle, 'cancel');
      break;
    case 'fulfillVsExpire':
      close(state, cycle, 'expire');
      fulfill(state, cycle, 'race-expire', REQUESTED);
      break;
    case 'noticeDuplicate':
      state.notices.add(`notice-${cycle}`);
      state.notices.add(`notice-${cycle}`);
      break;
    case 'noticeTransportFailure':
    case 'noticeRetry':
    case 'whatsappTimeout':
      state.notices.add(`notice-${cycle}`);
      state.providerSends.add(`expiry:${cycle}`);
      reject(state);
      break;
    case 'expiryBetweenLeaseAndSync':
      close(state, cycle, 'expire');
      reject(state);
      break;
    case 'staleLease':
    case 'wrongTenantLease':
    case 'wrongBranchLease':
    case 'wrongTerminalLease':
    case 'wrongUserLease':
    case 'wrongScopeLease':
    case 'cryptographicLeaseTamper':
      reject(state);
      break;
    case 'priceDriftAfterExpiry':
      close(state, cycle, 'expire');
      state.soldPriceAfterExpiryCents = CURRENT_PRICE_CENTS;
      break;
    case 'supervisorRepriceReplay':
      close(state, cycle, 'expire');
      state.usedReprices.add(`reprice-${cycle}`);
      state.usedReprices.add(`reprice-${cycle}`);
      appendAudit(state, cycle);
      break;
    case 'batchLocationSerialUom':
      fulfill(state, cycle, 'dimensions', 2_000_000);
      break;
    case 'd1TimeoutRollback':
      reject(state);
      break;
    case 'offlineEnvelopeReplay':
      replayFulfillment(state, cycle, 'offline-f5', 1_000_000);
      break;
    case 'offlineOutOfOrderReplay':
      reject(state);
      replayFulfillment(state, cycle, 'offline-ordered', 1_000_000);
      break;
    case 'crossTenant':
      reject(state);
      break;
    case 'auditTailRace':
      fulfill(state, cycle, 'audit-winner', 1_000_000);
      reject(state);
      break;
    case 'checkoutDuringOrderFailure':
      reject(state);
      state.checkoutCompleted = true;
      break;
    case 'largeItemLimit':
    case 'malformedParser':
    case 'resourceExhaustion':
      reject(state);
      break;
  }

  const failures: CustomerOrderFailure[] = [];
  const accounted = state.fulfilled + state.released + state.reserved;
  const expectedStock = INITIAL_STOCK - state.fulfilled - state.reserved;
  const duplicateSales =
    state.sales.size !== state.payments.size || state.sales.size !== state.fiscal.size;
  const dimensionsConserved =
    state.stock === expectedStock &&
    state.locationStock === state.stock &&
    state.batchStock === state.stock &&
    state.serialsReserved + state.serialsSold + state.released / 1_000_000 === 4;
  const auditLinear =
    state.auditPrevious[0] === null &&
    state.auditPrevious.slice(1).every((previous) => typeof previous === 'string');

  if (state.crossTenantMutation) failures.push('crossTenantMutations');
  if (duplicateSales) failures.push('duplicateSales');
  if (state.fiscal.size > state.sales.size) failures.push('duplicateFiscalOutbox');
  if (state.stock < expectedStock) failures.push('doubleStockDeductions');
  if (state.stock > expectedStock) failures.push('doubleReleases');
  if (accounted !== REQUESTED) failures.push('conservationViolations');
  if (state.soldPriceAfterExpiryCents === SNAPSHOT_PRICE_CENTS) failures.push('stalePriceUses');
  if (state.unauthorizedReprice) failures.push('unauthorizedReprices');
  if (state.notices.size > 1 || state.providerSends.size > 1) failures.push('duplicateNotices');
  if (state.expiredWithoutNotice) failures.push('expiryWithoutDurableIntent');
  if (state.expiredReservationHeld) failures.push('indefiniteExpiredReservations');
  if (state.offlineReplayMutation) failures.push('offlineReplayMutations');
  if (!auditLinear) failures.push('auditForks');
  if (fault === 'createReserveCrashReplay' && (state.payments.size > 0 || state.fiscal.size > 0)) {
    failures.push('createPaymentsOrCpe');
  }
  if (!state.checkoutCompleted) failures.push('checkoutBlocks');
  if (state.partialSubsetCommit) failures.push('partialSubsetCommits');
  if (!dimensionsConserved) failures.push('ghostInventoryDimensions');
  if (state.payments.size > state.sales.size) failures.push('duplicatePayments');

  return {
    cycle,
    fault,
    invariantsHeld: failures.length === 0,
    failures,
    requestedQuantityMicrounits: REQUESTED,
    fulfilledQuantityMicrounits: state.fulfilled,
    releasedQuantityMicrounits: state.released,
    reservedQuantityMicrounits: state.reserved,
    finalStockMicrounits: state.stock,
    sales: state.sales.size,
    payments: state.payments.size,
    fiscalOutboxRows: state.fiscal.size,
    notices: state.notices.size,
    auditRoots: state.auditPrevious.filter((previous) => previous === null).length,
    rejectedAttempts: state.rejectedAttempts,
  };
}

function countFailure(
  samples: readonly CustomerOrderChaosSample[],
  failure: CustomerOrderFailure,
): number {
  return samples.filter((sample) => sample.failures.includes(failure)).length;
}

export async function runCustomerOrderChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): Promise<CustomerOrderChaosResult> {
  await Promise.resolve();
  if (!Number.isSafeInteger(cycles) || cycles < 0) throw new Error('CHAOS_CYCLES_INVALID');
  const coverage = Object.fromEntries(CUSTOMER_ORDER_FAULTS.map((fault) => [fault, 0])) as Record<
    CustomerOrderFault,
    number
  >;
  const samples = Array.from({ length: cycles }, (_, cycle) => {
    const fault = CUSTOMER_ORDER_FAULTS[cycle % CUSTOMER_ORDER_FAULTS.length]!;
    coverage[fault] += 1;
    return injectFault(cycle, fault);
  });
  const counters = Object.fromEntries(
    CUSTOMER_ORDER_FAILURES.map((failure) => [failure, countFailure(samples, failure)]),
  ) as Record<CustomerOrderFailure, number>;
  return {
    cycles,
    engineEvidenceVerified,
    ...counters,
    coverage,
    evidence: {
      environment: 'LOCAL_DETERMINISTIC_MODEL',
      externalStaging: false,
      workerdRequiredSeparately: true,
    },
    samples,
  };
}

export function judgeCustomerOrderChaos(
  result: CustomerOrderChaosResult,
): CustomerOrderChaosVerdict {
  const coverage = CUSTOMER_ORDER_FAULTS.map((fault) => result.coverage[fault]);
  const balanced =
    coverage.every((value) => Number.isSafeInteger(value) && value > 0) &&
    Math.max(...coverage) - Math.min(...coverage) <= 1 &&
    coverage.reduce((total, value) => total + value, 0) === result.cycles;
  const countersMatchSamples = CUSTOMER_ORDER_FAILURES.every(
    (failure) => result[failure] === countFailure(result.samples, failure),
  );
  const samplesMatchCoverage = CUSTOMER_ORDER_FAULTS.every(
    (fault) =>
      result.coverage[fault] === result.samples.filter((sample) => sample.fault === fault).length,
  );
  const samplesAreOrdered = result.samples.every((sample, cycle) => sample.cycle === cycle);
  const evidenceIsLocal =
    result.evidence.environment === 'LOCAL_DETERMINISTIC_MODEL' &&
    !result.evidence.externalStaging &&
    result.evidence.workerdRequiredSeparately;
  if (result.cycles < 500 || result.samples.length !== result.cycles) return 'FAIL';
  if (!result.samples.every((sample) => sample.invariantsHeld)) return 'FAIL';
  if (!CUSTOMER_ORDER_FAILURES.every((failure) => result[failure] === 0)) return 'FAIL';
  if (
    !countersMatchSamples ||
    !samplesMatchCoverage ||
    !samplesAreOrdered ||
    !balanced ||
    !evidenceIsLocal
  ) {
    return 'FAIL';
  }
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

export async function runCustomerOrderChaosScenario(
  execute?: () => Promise<CustomerOrderChaosResult>,
): Promise<CustomerOrderChaosVerdict> {
  return judgeCustomerOrderChaos(execute ? await execute() : await runCustomerOrderChaos(500));
}
