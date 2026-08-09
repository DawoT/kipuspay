export const RECURRING_TIMEZONE = 'America/Lima' as const;
const LIMA_OFFSET = '-05:00';
const MICROUNITS_PER_UNIT = 1_000_000;

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type RecurringPricingPolicy = 'FIXED' | 'CURRENT';
export type RecurringStatus = 'ACTIVE' | 'PAUSED' | 'GRACE' | 'CANCEL_AT_PERIOD_END' | 'CANCELLED';
export type RecurringAfterGracePolicy = 'CONTINUE' | 'PAUSE_FUTURE_EXECUTION';
export type RecurringCancellationMode = 'IMMEDIATE' | 'AT_PERIOD_END';

export interface RecurringPlanItem {
  readonly productId: string;
  readonly productUomId: string;
  readonly quantityMicrounits: number;
  readonly fixedUnitPriceCents?: number | undefined;
}

export interface RecurringPlanVersion {
  readonly id?: string;
  readonly planKey?: string;
  readonly planVersion?: number;
  readonly supersedesPlanId?: string;
  readonly effectiveFrom?: string;
  readonly timezone: typeof RECURRING_TIMEZONE;
  readonly frequency: RecurringFrequency;
  readonly anchorDay: number;
  readonly anchorIsLastDay: boolean;
  readonly anchorTime: string;
  readonly pricingPolicy?: RecurringPricingPolicy | undefined;
  readonly graceDays: number;
  readonly afterGracePolicy: RecurringAfterGracePolicy;
  readonly items: readonly RecurringPlanItem[];
}

interface LimaCivil {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function assertSafeInteger(value: number, code: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(code);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseLimaTimestamp(value: string): LimaCivil {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})-05:00$/.exec(value);
  if (!match) throw new Error('RECURRING_INVALID_LIMA_TIMESTAMP');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const civil = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText),
  };
  if (
    civil.year < 1 ||
    civil.month < 1 ||
    civil.month > 12 ||
    civil.day < 1 ||
    civil.day > daysInMonth(civil.year, civil.month) ||
    civil.hour > 23 ||
    civil.minute > 59 ||
    civil.second > 59
  ) {
    throw new Error('RECURRING_INVALID_LIMA_TIMESTAMP');
  }
  return civil;
}

const twoDigits = (value: number): string => value.toString().padStart(2, '0');

function formatLimaTimestamp(civil: LimaCivil): string {
  return `${civil.year.toString().padStart(4, '0')}-${twoDigits(civil.month)}-${twoDigits(
    civil.day,
  )}T${twoDigits(civil.hour)}:${twoDigits(civil.minute)}:${twoDigits(civil.second)}${LIMA_OFFSET}`;
}

function addCivilDays(civil: LimaCivil, days: number): LimaCivil {
  // eslint-disable-next-line no-secrets/no-secrets -- stable opaque domain error code
  assertSafeInteger(days, 'RECURRING_INVALID_DAY_OFFSET');
  let { year, month, day } = civil;
  let remaining = days;
  while (remaining > 0) {
    const available = daysInMonth(year, month) - day;
    if (remaining <= available) {
      day += remaining;
      remaining = 0;
    } else {
      remaining -= available + 1;
      day = 1;
      month += 1;
      if (month === 13) {
        month = 1;
        year += 1;
      }
    }
  }
  return { ...civil, year, month, day };
}

function addCivilSeconds(civil: LimaCivil, seconds: number): LimaCivil {
  assertSafeInteger(seconds, 'RECURRING_INVALID_RETRY_DELAY');
  const secondsOfDay = civil.hour * 3600 + civil.minute * 60 + civil.second + seconds;
  const dayOffset = Math.floor(secondsOfDay / 86_400);
  const withinDay = secondsOfDay % 86_400;
  return addCivilDays(
    {
      ...civil,
      hour: Math.floor(withinDay / 3600),
      minute: Math.floor((withinDay % 3600) / 60),
      second: withinDay % 60,
    },
    dayOffset,
  );
}

function nextMonthlyBoundary(plan: RecurringPlanVersion, start: LimaCivil): LimaCivil {
  let year = start.year;
  let month = start.month + 1;
  if (month === 13) {
    year += 1;
    month = 1;
  }
  assertSafeInteger(plan.anchorDay, 'RECURRING_INVALID_ANCHOR', 1);
  if (plan.anchorDay > 31) throw new Error('RECURRING_INVALID_ANCHOR');
  const lastDay = daysInMonth(year, month);
  return {
    ...start,
    year,
    month,
    day: plan.anchorIsLastDay ? lastDay : Math.min(plan.anchorDay, lastDay),
  };
}

export function computeRecurringPeriod(
  plan: RecurringPlanVersion,
  periodStart: string,
): { readonly periodStart: string; readonly periodEnd: string; readonly nextRunAt: string } {
  if (plan.timezone !== RECURRING_TIMEZONE) throw new Error('RECURRING_INVALID_TIMEZONE');
  const start = parseLimaTimestamp(periodStart);
  const end =
    plan.frequency === 'DAILY'
      ? addCivilDays(start, 1)
      : plan.frequency === 'WEEKLY'
        ? addCivilDays(start, 7)
        : nextMonthlyBoundary(plan, start);
  const periodEnd = formatLimaTimestamp(end);
  return { periodStart, periodEnd, nextRunAt: periodEnd };
}

export function computeRecurringCatchUp(input: {
  readonly plan: RecurringPlanVersion;
  readonly firstPeriodStart: string;
  readonly now: string;
  readonly limit: number;
}): {
  readonly periodStarts: readonly string[];
  readonly nextRunAt: string;
  readonly hasMore: boolean;
} {
  parseLimaTimestamp(input.now);
  assertSafeInteger(input.limit, 'RECURRING_INVALID_CATCH_UP_LIMIT', 1);
  const periodStarts: string[] = [];
  let cursor = input.firstPeriodStart;
  while (cursor <= input.now && periodStarts.length < input.limit) {
    periodStarts.push(cursor);
    cursor = computeRecurringPeriod(input.plan, cursor).periodEnd;
  }
  return { periodStarts, nextRunAt: cursor, hasMore: cursor <= input.now };
}

function checkedHalfUpRatio(numerator: number, denominator: number, code: string): number {
  assertSafeInteger(numerator, code);
  assertSafeInteger(denominator, code, 1);
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  return quotient + (remainder * 2 >= denominator ? 1 : 0);
}

export function resolveRecurringOccurrenceItems(input: {
  readonly plan: RecurringPlanVersion;
  readonly serverCatalog: readonly {
    readonly productId: string;
    readonly currentUnitPriceCents: number;
    readonly taxCents?: number;
  }[];
  readonly periodStart: string;
}): readonly {
  readonly productId: string;
  readonly productUomId: string;
  readonly appliedQuantityMicrounits: number;
  readonly appliedUnitPriceCents: number;
  readonly appliedSubtotalCents: number;
  readonly appliedTaxCents: number;
  readonly appliedTotalCents: number;
  readonly priceSource: RecurringPricingPolicy;
  readonly priceResolvedAt: string;
}[] {
  parseLimaTimestamp(input.periodStart);
  const policy = input.plan.pricingPolicy ?? 'FIXED';
  return input.plan.items.map((item) => {
    assertSafeInteger(item.quantityMicrounits, 'RECURRING_INVALID_QUANTITY', 1);
    const catalog = input.serverCatalog.find((candidate) => candidate.productId === item.productId);
    const unitPriceCents =
      policy === 'FIXED' ? item.fixedUnitPriceCents : catalog?.currentUnitPriceCents;
    if (unitPriceCents === undefined) throw new Error('RECURRING_PRICE_UNAVAILABLE');
    assertSafeInteger(unitPriceCents, 'RECURRING_INVALID_PRICE');
    const rawSubtotal = item.quantityMicrounits * unitPriceCents;
    if (!Number.isSafeInteger(rawSubtotal)) throw new Error('RECURRING_PRICE_UNSAFE_INTEGER');
    const subtotal = checkedHalfUpRatio(
      rawSubtotal,
      MICROUNITS_PER_UNIT,
      'RECURRING_PRICE_UNSAFE_INTEGER',
    );
    const taxCents = catalog?.taxCents ?? 0;
    assertSafeInteger(taxCents, 'RECURRING_INVALID_TAX');
    if (!Number.isSafeInteger(subtotal + taxCents)) {
      throw new Error('RECURRING_PRICE_UNSAFE_INTEGER');
    }
    return {
      productId: item.productId,
      productUomId: item.productUomId,
      appliedQuantityMicrounits: item.quantityMicrounits,
      appliedUnitPriceCents: unitPriceCents,
      appliedSubtotalCents: subtotal,
      appliedTaxCents: taxCents,
      appliedTotalCents: subtotal + taxCents,
      priceSource: policy,
      priceResolvedAt: input.periodStart,
    };
  });
}

function civilOrdinal(civil: LimaCivil): number {
  const priorYear = civil.year - 1;
  const leapDays =
    Math.floor(priorYear / 4) - Math.floor(priorYear / 100) + Math.floor(priorYear / 400);
  const priorMonths = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leapAdjustment = civil.month > 2 && isLeapYear(civil.year) ? 1 : 0;
  return (
    priorYear * 365 + leapDays + (priorMonths[civil.month - 1] ?? 0) + leapAdjustment + civil.day
  );
}

export function computeRecurringProration(input: {
  readonly lineTotalCents: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly cancelledAt: string;
  readonly mode: RecurringCancellationMode;
}): {
  readonly serviceDays: number;
  readonly unusedServiceDays: number;
  readonly rationalNumerator: number;
  readonly rationalDenominator: number;
  readonly creditAmountCents: number;
  readonly createsReturn: boolean;
  readonly returnDocumentType: 'FROM_ORIGINAL_DOCUMENT';
  readonly mutatesOriginalSale: false;
} {
  assertSafeInteger(input.lineTotalCents, 'RECURRING_PRORATION_UNSAFE_INTEGER');
  const start = parseLimaTimestamp(input.periodStart);
  const end = parseLimaTimestamp(input.periodEnd);
  const cancelled = parseLimaTimestamp(input.cancelledAt);
  const startDay = civilOrdinal(start);
  const endDay = civilOrdinal(end);
  const cancelledDay = civilOrdinal(cancelled);
  const serviceDays = endDay - startDay;
  if (serviceDays <= 0 || cancelledDay < startDay || cancelledDay >= endDay) {
    throw new Error('RECURRING_INVALID_PRORATION_PERIOD');
  }
  if (input.mode === 'AT_PERIOD_END') {
    return {
      serviceDays,
      unusedServiceDays: 0,
      rationalNumerator: 0,
      rationalDenominator: serviceDays,
      creditAmountCents: 0,
      createsReturn: false,
      returnDocumentType: 'FROM_ORIGINAL_DOCUMENT',
      mutatesOriginalSale: false,
    };
  }
  const unusedServiceDays = endDay - cancelledDay - 1;
  const rationalNumerator = input.lineTotalCents * unusedServiceDays;
  if (!Number.isSafeInteger(rationalNumerator) || !Number.isSafeInteger(rationalNumerator * 2)) {
    throw new Error('RECURRING_PRORATION_UNSAFE_INTEGER');
  }
  const creditAmountCents = checkedHalfUpRatio(
    rationalNumerator,
    serviceDays,
    'RECURRING_PRORATION_UNSAFE_INTEGER',
  );
  return {
    serviceDays,
    unusedServiceDays,
    rationalNumerator,
    rationalDenominator: serviceDays,
    creditAmountCents,
    createsReturn: creditAmountCents > 0,
    returnDocumentType: 'FROM_ORIGINAL_DOCUMENT',
    mutatesOriginalSale: false,
  };
}

export function decideRecurringDelinquency(input: {
  readonly dueAt: string;
  readonly now: string;
  readonly graceDays: number;
  readonly afterGracePolicy: RecurringAfterGracePolicy;
}): {
  readonly membershipState: 'ACTIVE' | 'GRACE' | 'PAUSED_AFTER_GRACE';
  readonly graceDeadline?: string;
  readonly executeFutureOccurrences: boolean;
  readonly ordinaryCheckoutAllowed: true;
  readonly ordinaryFiscalAllowed: true;
} {
  const due = parseLimaTimestamp(input.dueAt);
  parseLimaTimestamp(input.now);
  assertSafeInteger(input.graceDays, 'RECURRING_INVALID_GRACE_DAYS');
  const graceDeadline = formatLimaTimestamp(addCivilDays(due, input.graceDays));
  const late = input.now >= input.dueAt;
  const afterGrace = input.now >= graceDeadline;
  const pause = afterGrace && input.afterGracePolicy === 'PAUSE_FUTURE_EXECUTION';
  return {
    membershipState: pause ? 'PAUSED_AFTER_GRACE' : late ? 'GRACE' : 'ACTIVE',
    ...(late && !afterGrace ? { graceDeadline } : {}),
    executeFutureOccurrences: !pause,
    ordinaryCheckoutAllowed: true,
    ordinaryFiscalAllowed: true,
  };
}

export function computeRecurringRetry(input: {
  readonly failedAt: string;
  readonly retryCount: number;
  readonly baseDelaySeconds: number;
  readonly maxDelaySeconds: number;
}): { readonly retryCount: number; readonly delaySeconds: number; readonly nextRetryAt: string } {
  const failed = parseLimaTimestamp(input.failedAt);
  assertSafeInteger(input.retryCount, 'RECURRING_INVALID_RETRY_COUNT');
  assertSafeInteger(input.baseDelaySeconds, 'RECURRING_INVALID_RETRY_DELAY', 1);
  assertSafeInteger(input.maxDelaySeconds, 'RECURRING_INVALID_RETRY_DELAY', 1);
  const exponent = Math.min(input.retryCount, 30);
  const scaled = input.baseDelaySeconds * 2 ** exponent;
  const delaySeconds = Math.min(
    Number.isSafeInteger(scaled) ? scaled : input.maxDelaySeconds,
    input.maxDelaySeconds,
  );
  return {
    retryCount: input.retryCount + 1,
    delaySeconds,
    nextRetryAt: formatLimaTimestamp(addCivilSeconds(failed, delaySeconds)),
  };
}

const ALLOWED_TRANSITIONS: Readonly<Record<RecurringStatus, readonly RecurringStatus[]>> = {
  ACTIVE: ['PAUSED', 'GRACE', 'CANCEL_AT_PERIOD_END', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCEL_AT_PERIOD_END', 'CANCELLED'],
  GRACE: ['ACTIVE', 'PAUSED', 'CANCEL_AT_PERIOD_END', 'CANCELLED'],
  CANCEL_AT_PERIOD_END: ['CANCELLED'],
  CANCELLED: [],
};

export function transitionRecurringStatus(
  current: RecurringStatus,
  next: RecurringStatus,
): RecurringStatus {
  if (current === next) return current;
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error('RECURRING_INVALID_STATUS_TRANSITION');
  }
  return next;
}

export function decideRecurringCancellation(
  current: RecurringStatus,
  mode: RecurringCancellationMode,
): {
  readonly status: 'CANCEL_AT_PERIOD_END' | 'CANCELLED';
  readonly executeFutureOccurrences: false;
  readonly createProration: boolean;
} {
  const status = mode === 'IMMEDIATE' ? 'CANCELLED' : 'CANCEL_AT_PERIOD_END';
  transitionRecurringStatus(current, status);
  return {
    status,
    executeFutureOccurrences: false,
    createProration: mode === 'IMMEDIATE',
  };
}

export function versionRecurringPlan(input: {
  readonly current: RecurringPlanVersion & {
    readonly id: string;
    readonly planKey: string;
    readonly planVersion: number;
  };
  readonly nextId: string;
  readonly effectiveFrom: string;
  readonly items: readonly RecurringPlanItem[];
}): RecurringPlanVersion & {
  readonly id: string;
  readonly planKey: string;
  readonly planVersion: number;
  readonly supersedesPlanId: string;
  readonly effectiveFrom: string;
} {
  parseLimaTimestamp(input.effectiveFrom);
  assertSafeInteger(input.current.planVersion, 'RECURRING_INVALID_PLAN_VERSION', 1);
  if (input.nextId === input.current.id || input.items.length === 0) {
    throw new Error('RECURRING_INVALID_PLAN_VERSION');
  }
  return {
    ...input.current,
    id: input.nextId,
    planVersion: input.current.planVersion + 1,
    supersedesPlanId: input.current.id,
    effectiveFrom: input.effectiveFrom,
    items: input.items.map((item) => ({ ...item })),
  };
}
