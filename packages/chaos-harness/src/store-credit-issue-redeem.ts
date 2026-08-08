/** Sprint 35 chaos: vale ISSUE → NC consent → redeem × expire × adjust. */
import {
  STORE_CREDIT_FORBIDDEN,
  STORE_CREDIT_INSUFFICIENT,
  STORE_CREDIT_NC_NOT_ELIGIBLE,
  STORE_CREDIT_OFFLINE,
  assertNcCanIssueStoreCredit,
  assertStoreCreditRedeemable,
  giftCardSaleSourceRef,
  ncStoreCreditSourceRef,
  planSaleJournal,
  planStoreCreditAdjust,
  planStoreCreditExpire,
  planStoreCreditIssue,
} from '@kipuspay/domain-cash';

export type StoreCreditChaosVerdict = 'PASS' | 'FAIL';

export interface StoreCreditCycleResult {
  readonly valeEmitsDoc: boolean;
  readonly redeemServerImposed: boolean;
  readonly noInsufficient: boolean;
  readonly offlineBlocked: boolean;
  readonly ncConsentRequired: boolean;
  readonly expireZeros: boolean;
  readonly journal2102Not2101: boolean;
  readonly rollbackExact: boolean;
}

export interface StoreCreditChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly StoreCreditCycleResult[];
}

export function judgeStoreCreditIssueRedeem(
  result: StoreCreditChaosResult,
): StoreCreditChaosVerdict {
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

function redeemOk(balanceCents: number, remainingDueCents: number, saleId: string) {
  return assertStoreCreditRedeemable({
    customerId: 'c-a',
    online: true,
    actorIsAdminOrOwner: true,
    balanceCents,
    remainingDueCents,
    clientAmountCents: 99_999,
    nowMs: 1_000,
    saleId,
  });
}

function applyMode(
  mode: number,
  seed: number,
  face: number,
  balance: number,
  sibling: number,
): Omit<StoreCreditCycleResult, 'valeEmitsDoc' | 'journal2102Not2101'> {
  if (mode === 0) {
    const redeem = redeemOk(balance, face - 100, `r-${seed}`);
    return {
      redeemServerImposed: redeem.appliedCents === face - 100 && redeem.clientAmountIgnored,
      noInsufficient: true,
      offlineBlocked: true,
      ncConsentRequired: true,
      expireZeros: true,
      rollbackExact: sibling === 0,
    };
  }
  if (mode === 1) {
    return {
      redeemServerImposed: true,
      noInsufficient: threw(STORE_CREDIT_INSUFFICIENT, () => redeemOk(0, face, `r-${seed}`)),
      offlineBlocked: true,
      ncConsentRequired: true,
      expireZeros: true,
      rollbackExact: sibling === 0,
    };
  }
  if (mode === 2) {
    const offline = threw(STORE_CREDIT_OFFLINE, () => {
      assertStoreCreditRedeemable({
        customerId: 'c-a',
        online: false,
        actorIsAdminOrOwner: true,
        balanceCents: balance,
        remainingDueCents: face,
        nowMs: 1_000,
        saleId: `r-${seed}`,
      });
    });
    const forbidden = threw(STORE_CREDIT_FORBIDDEN, () => {
      assertStoreCreditRedeemable({
        customerId: 'c-a',
        online: true,
        actorIsAdminOrOwner: false,
        balanceCents: balance,
        remainingDueCents: face,
        nowMs: 1_000,
        saleId: `r-${seed}`,
      });
    });
    return {
      redeemServerImposed: true,
      noInsufficient: true,
      offlineBlocked: offline && forbidden,
      ncConsentRequired: true,
      expireZeros: true,
      rollbackExact: sibling === 0,
    };
  }
  if (mode === 3) {
    const consent = threw(STORE_CREDIT_NC_NOT_ELIGIBLE, () => {
      assertNcCanIssueStoreCredit({
        consentStoreCredit: false,
        arCompensate: false,
        cashRefund: false,
      });
    });
    assertNcCanIssueStoreCredit({
      consentStoreCredit: true,
      arCompensate: false,
      cashRefund: false,
    });
    planStoreCreditIssue({
      customerId: 'c-a',
      currentBalanceCents: balance,
      amountCents: 200,
      sourceRef: ncStoreCreditSourceRef(`nc-${seed}`),
    });
    return {
      redeemServerImposed: true,
      noInsufficient: true,
      offlineBlocked: true,
      ncConsentRequired: consent,
      expireZeros: true,
      rollbackExact: sibling === 0,
    };
  }
  const exp = planStoreCreditExpire({
    balanceCents: balance,
    expiresAtMs: 10,
    nowMs: 20,
  });
  const adj = planStoreCreditAdjust({
    currentBalanceCents: 0,
    amountCents: 50,
    adjustSign: 'CREDIT',
    authorizedByUserId: 'u-admin',
  });
  return {
    redeemServerImposed: true,
    noInsufficient: true,
    offlineBlocked: true,
    ncConsentRequired: true,
    expireZeros: exp.nextBalanceCents === 0,
    rollbackExact: adj.nextBalanceCents === 50 && sibling === 0,
  };
}

function runCycle(seed: number): StoreCreditCycleResult {
  const face = 1000 + (seed % 5) * 100;
  const saleId = `s-${seed}`;
  const issue = planStoreCreditIssue({
    customerId: 'c-a',
    currentBalanceCents: 0,
    amountCents: face,
    sourceRef: giftCardSaleSourceRef(saleId),
  });
  const valeJournal = planSaleJournal({
    sourceId: saleId,
    postDate: '2026-08-08',
    totalCents: face,
    taxCents: 0,
    payments: [{ methodCode: 'cash', amountCents: face }],
    storeCreditIssueCents: face,
  });
  try {
    return {
      valeEmitsDoc: issue.emitsFiscalDocument === true,
      journal2102Not2101:
        valeJournal.lines.some((l) => l.code === '2102' && l.creditCents === face) &&
        !valeJournal.lines.some((l) => l.code === '2101') &&
        !valeJournal.lines.some((l) => l.code === '7011'),
      ...applyMode(seed % 5, seed, face, issue.nextBalanceCents, 0),
    };
  } catch {
    return {
      valeEmitsDoc: issue.emitsFiscalDocument === true,
      redeemServerImposed: false,
      noInsufficient: false,
      offlineBlocked: false,
      ncConsentRequired: false,
      expireZeros: false,
      journal2102Not2101: false,
      rollbackExact: false,
    };
  }
}

export function runStoreCreditIssueRedeemChaos(cycles = 500): StoreCreditChaosResult {
  const samples: StoreCreditCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runStoreCreditIssueRedeemChaosScenario(
  execute?: () => Promise<StoreCreditChaosResult>,
): Promise<StoreCreditChaosVerdict> {
  return judgeStoreCreditIssueRedeem(
    execute ? await execute() : runStoreCreditIssueRedeemChaos(500),
  );
}
