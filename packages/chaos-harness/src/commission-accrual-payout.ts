/** Sprint 37 chaos: rate → accrual → reverse NC → payout Zero-Trust → double pay 422. */
import { planCommissionAccrueJournal, planCommissionPayJournal } from '@kipuspay/domain-cash';
import {
  COMMISSION_ALREADY_PAID,
  COMMISSION_FORBIDDEN,
  COMMISSION_NOTHING_TO_PAY,
  COMMISSION_PAYROLL_FORBIDDEN,
  assertCommissionNotPayroll,
  assertCommissionPayable,
  planCommissionAccrual,
  planCommissionPayout,
  planCommissionReverse,
  resolveCommissionRate,
  type CommissionRateRow,
} from '@kipuspay/domain-sales';

export type CommissionChaosVerdict = 'PASS' | 'FAIL';

export interface CommissionCycleResult {
  readonly ratePrecedence: boolean;
  readonly percentHalfUp: boolean;
  readonly noSellerZero: boolean;
  readonly ncReverse: boolean;
  readonly payoutServerGross: boolean;
  readonly doublePayBlocked: boolean;
  readonly payrollOos: boolean;
  readonly siblingIsolation: boolean;
  readonly journalAccruePay: boolean;
}

export interface CommissionChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly CommissionCycleResult[];
}

export function judgeCommissionAccrualPayout(
  result: CommissionChaosResult,
): CommissionChaosVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

function threw(code: string, run: () => void): boolean {
  try {
    run();
    return false;
  } catch (err) {
    return err instanceof Error && err.message === code;
  }
}

/* eslint-disable complexity -- chaos cycle multi-assert S37 */
function runCycle(seed: number): CommissionCycleResult {
  const sellerId = `seller-${seed % 3}`;
  const siblingSeller = `seller-${(seed % 3) + 3}`;
  const productId = `p-${seed % 5}`;
  const lineTotal = 10_000 + (seed % 17) * 100;
  const ratePercent = 5 + (seed % 4);
  const rates: CommissionRateRow[] = [
    {
      sellerId,
      productId: null,
      categoryId: null,
      ratePercent: 1,
      rateAmountCents: null,
    },
    {
      sellerId,
      productId,
      categoryId: null,
      ratePercent,
      rateAmountCents: null,
    },
    {
      sellerId: siblingSeller,
      productId: null,
      categoryId: null,
      ratePercent: 50,
      rateAmountCents: null,
    },
  ];

  const resolved = resolveCommissionRate(rates, sellerId, productId, null);
  const ratePrecedence = resolved?.productId === productId && resolved.ratePercent === ratePercent;

  const expected = Math.floor((lineTotal * ratePercent) / 100 + 0.5);
  const accrual = planCommissionAccrual({
    sellerId,
    lines: [{ productId, categoryId: null, lineTotalCents: lineTotal }],
    rates,
  });
  const percentHalfUp = accrual?.amountCents === expected;

  const noSeller = planCommissionAccrual({
    sellerId: null,
    lines: [{ productId, categoryId: null, lineTotalCents: lineTotal }],
    rates,
  });
  const noSellerZero = noSeller === null;

  const rev = planCommissionReverse({
    amountCents: accrual?.amountCents ?? expected,
    alreadyReversed: false,
  });
  const already = planCommissionReverse({
    amountCents: accrual?.amountCents ?? expected,
    alreadyReversed: true,
  });
  const ncReverse = rev.reverse === true && already.reverse === false;

  const openAccrual = accrual?.amountCents ?? expected;
  const payout = planCommissionPayout({
    sellerId,
    periodStartIso: '2026-08-01',
    periodEndIso: '2026-08-31',
    openAccrualCents: openAccrual,
    actorIsAdminOrOwner: true,
    clientGrossCents: openAccrual + 9_999,
  });
  const payoutServerGross = payout.grossCents === openAccrual && payout.clientGrossIgnored === true;

  const doublePayBlocked =
    threw(COMMISSION_ALREADY_PAID, () => {
      assertCommissionPayable({ status: 'PAID', actorIsAdminOrOwner: true });
    }) &&
    threw(COMMISSION_FORBIDDEN, () => {
      assertCommissionPayable({ status: 'OPEN', actorIsAdminOrOwner: false });
    }) &&
    threw(COMMISSION_NOTHING_TO_PAY, () => {
      planCommissionPayout({
        sellerId,
        periodStartIso: '2026-08-01',
        periodEndIso: '2026-08-31',
        openAccrualCents: 0,
        actorIsAdminOrOwner: true,
      });
    });

  const payrollOos = threw(COMMISSION_PAYROLL_FORBIDDEN, () => assertCommissionNotPayroll());

  const siblingAccrual = planCommissionAccrual({
    sellerId: siblingSeller,
    lines: [{ productId, categoryId: null, lineTotalCents: lineTotal }],
    rates,
  });
  const siblingIsolation =
    siblingAccrual != null &&
    siblingAccrual.sellerId === siblingSeller &&
    siblingAccrual.sellerId !== sellerId;

  const jAccrue = planCommissionAccrueJournal({
    sourceId: `a-${seed}`,
    postDate: '2026-08-08',
    amountCents: openAccrual,
  });
  const jPay = planCommissionPayJournal({
    sourceId: `p-${seed}`,
    postDate: '2026-08-31',
    amountCents: openAccrual,
  });
  const journalAccruePay =
    jAccrue.sourceType === 'COMMISSION' &&
    jAccrue.lines.some((l) => l.code === '6311' && l.debitCents === openAccrual) &&
    jAccrue.lines.some((l) => l.code === '2111' && l.creditCents === openAccrual) &&
    jPay.lines.some((l) => l.code === '2111' && l.debitCents === openAccrual) &&
    jPay.lines.some((l) => l.code === '1011' && l.creditCents === openAccrual);

  // Retry idempotent: same accrual plan twice yields same amount (domain pure).
  const retry = planCommissionAccrual({
    sellerId,
    lines: [{ productId, categoryId: null, lineTotalCents: lineTotal }],
    rates,
  });
  const idempotent = retry?.amountCents === accrual?.amountCents;

  return {
    ratePrecedence: ratePrecedence && idempotent,
    percentHalfUp: percentHalfUp === true,
    noSellerZero,
    ncReverse,
    payoutServerGross,
    doublePayBlocked,
    payrollOos,
    siblingIsolation,
    journalAccruePay,
  };
}

export function runCommissionAccrualPayoutChaos(cycles = 500): CommissionChaosResult {
  const samples: CommissionCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runCommissionAccrualPayoutChaosScenario(
  execute?: () => Promise<CommissionChaosResult>,
): Promise<CommissionChaosVerdict> {
  if (!execute) {
    return judgeCommissionAccrualPayout(runCommissionAccrualPayoutChaos(500));
  }
  return judgeCommissionAccrualPayout(await execute());
}
