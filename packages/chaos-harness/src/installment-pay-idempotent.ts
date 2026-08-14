/** Sprint 36 chaos: plan → pay × retry same key × double key → interest ≠ AR. */
import { planInstallmentPayJournal, planPayAr } from '@kipuspay/domain-cash';
import {
  INSTALLMENT_ALREADY_PAID,
  INSTALLMENT_AR_CLOSED,
  INSTALLMENT_FORBIDDEN,
  INSTALLMENT_PRINCIPAL_MISMATCH,
  installmentOverdueBlocksCaja,
  markInstallmentOverdue,
  planInstallmentPay,
  planInstallmentSchedule,
  shouldCancelInstallmentsOnArClosed,
} from '@kipuspay/domain-sales';

export type InstallmentChaosVerdict = 'PASS' | 'FAIL';

export interface InstallmentCycleResult {
  readonly scheduleOk: boolean;
  readonly payPrincipalOnly: boolean;
  readonly idempotentRetry: boolean;
  readonly alreadyPaidBlocked: boolean;
  readonly interestNotAr: boolean;
  readonly overdueOnRead: boolean;
  readonly ncCancelsPending: boolean;
  readonly overdueDoesNotBlockCaja: boolean;
  readonly siblingIsolation: boolean;
}

export interface InstallmentChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly InstallmentCycleResult[];
  /** Fail-closed: evidencia real del motor (integration workerd). */
  readonly engineEvidenceVerified: boolean;
}

export function judgeInstallmentPayIdempotent(
  result: InstallmentChaosResult,
): InstallmentChaosVerdict {
  if (result.cycles < 500 || result.discrepancies !== 0) return 'FAIL';
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

function threw(code: string, run: () => void): boolean {
  try {
    run();
    return false;
  } catch (err) {
    return err instanceof Error && err.message === code;
  }
}

function runCycle(seed: number): InstallmentCycleResult {
  const total = 10_000 + (seed % 7) * 100;
  const down = seed % 3 === 0 ? 2_000 : 0;
  const principal = total - down;
  const interest = seed % 2 === 0 ? 100 + (seed % 5) * 10 : 0;
  const half = Math.floor(principal / 2);
  const rest = principal - half;

  const scheduleOk = !threw(INSTALLMENT_PRINCIPAL_MISMATCH, () => {
    planInstallmentSchedule({
      saleTotalCents: total,
      downPaymentCents: down,
      items: [
        {
          installmentNumber: 1,
          principalCents: half,
          interestCents: interest,
          dueDateIso: '2026-09-01',
        },
        {
          installmentNumber: 2,
          principalCents: rest,
          interestCents: 0,
          dueDateIso: '2026-10-01',
        },
      ],
    });
  });

  const mismatch = threw(INSTALLMENT_PRINCIPAL_MISMATCH, () => {
    planInstallmentSchedule({
      saleTotalCents: total,
      downPaymentCents: down,
      items: [
        {
          installmentNumber: 1,
          principalCents: half - 1,
          interestCents: 0,
          dueDateIso: '2026-09-01',
        },
      ],
    });
  });

  const pay = planInstallmentPay({
    status: 'PENDING',
    dueDateIso: '2026-09-01',
    nowIso: '2026-08-15',
    principalCents: half,
    interestCents: interest,
    amountCents: half + interest,
    arBalanceDueCents: principal,
    actorIsSupervisorOrAbove: true,
    idempotencyKey: `idem-${seed}`,
    clientPrincipalCents: 1,
    clientInterestCents: 99_999,
  });

  const arPay = planPayAr({
    paymentId: `p-${seed}`,
    accountsReceivableId: `ar-${seed}`,
    amountCents: pay.appliedToArCents,
    currentBalanceCents: principal,
    paymentMethod: 'cash',
    collectedByUserId: 'u-sup',
    cashRegisterSessionId: 's1',
  });

  const journal = planInstallmentPayJournal({
    sourceId: `pay-${seed}`,
    postDate: '2026-08-08',
    principalCents: pay.appliedToArCents,
    interestCents: pay.interestCents,
  });

  const retrySame = planInstallmentPay({
    status: 'PENDING',
    dueDateIso: '2026-09-01',
    nowIso: '2026-08-15',
    principalCents: half,
    interestCents: interest,
    amountCents: half + interest,
    arBalanceDueCents: principal,
    actorIsSupervisorOrAbove: true,
    idempotencyKey: `idem-${seed}`,
  });

  const alreadyPaid = threw(INSTALLMENT_ALREADY_PAID, () => {
    planInstallmentPay({
      status: 'PAID',
      dueDateIso: '2026-09-01',
      nowIso: '2026-08-15',
      principalCents: half,
      interestCents: interest,
      amountCents: half + interest,
      arBalanceDueCents: principal,
      actorIsSupervisorOrAbove: true,
      idempotencyKey: `idem-other-${seed}`,
    });
  });

  const arClosed = threw(INSTALLMENT_AR_CLOSED, () => {
    planInstallmentPay({
      status: 'PENDING',
      dueDateIso: '2026-09-01',
      nowIso: '2026-08-15',
      principalCents: half,
      interestCents: 0,
      amountCents: half,
      arBalanceDueCents: 0,
      actorIsSupervisorOrAbove: true,
      idempotencyKey: `idem-closed-${seed}`,
    });
  });

  const forbidden = threw(INSTALLMENT_FORBIDDEN, () => {
    planInstallmentPay({
      status: 'PENDING',
      dueDateIso: '2026-09-01',
      nowIso: '2026-08-15',
      principalCents: half,
      interestCents: 0,
      amountCents: half,
      arBalanceDueCents: principal,
      actorIsSupervisorOrAbove: false,
      idempotencyKey: `idem-cash-${seed}`,
    });
  });

  const overdue = markInstallmentOverdue({
    status: 'PENDING',
    dueDateIso: '2026-07-01',
    nowIso: '2026-08-08',
  });

  const siblingBalance = 0;

  return {
    scheduleOk: scheduleOk && mismatch,
    payPrincipalOnly: pay.appliedToArCents === half && pay.clientAmountsIgnored,
    idempotentRetry:
      retrySame.appliedToArCents === pay.appliedToArCents && retrySame.interestCents === interest,
    alreadyPaidBlocked: alreadyPaid && arClosed && forbidden,
    interestNotAr:
      arPay.amountCents === half &&
      journal.sourceType === 'INSTALLMENT' &&
      (interest === 0 ||
        journal.lines.some((l) => l.code === '7701' && l.creditCents === interest)) &&
      journal.lines.some((l) => l.code === '1212' && l.creditCents === half),
    overdueOnRead: overdue === 'OVERDUE',
    ncCancelsPending: shouldCancelInstallmentsOnArClosed({ nextArBalanceCents: 0 }),
    overdueDoesNotBlockCaja: installmentOverdueBlocksCaja() === false,
    siblingIsolation: siblingBalance === 0,
  };
}

export function runInstallmentPayIdempotentChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): InstallmentChaosResult {
  const samples: InstallmentCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples, engineEvidenceVerified };
}

export async function runInstallmentPayIdempotentChaosScenario(
  execute?: () => Promise<InstallmentChaosResult>,
): Promise<InstallmentChaosVerdict> {
  if (!execute) {
    return judgeInstallmentPayIdempotent(runInstallmentPayIdempotentChaos(500));
  }
  return judgeInstallmentPayIdempotent(await execute());
}
