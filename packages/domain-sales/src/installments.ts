/**
 * Cuotas / pago en partes — Arquitectura §5.3 regla 21 / ADR-0020 / COM-06.
 * Puro, sin D1. Schedule sobre AR; solo principal reduce CxC.
 */

export const INSTALLMENT_SCHEDULE_REQUIRED = 'INSTALLMENT_SCHEDULE_REQUIRED';
export const INSTALLMENT_PRINCIPAL_MISMATCH = 'INSTALLMENT_PRINCIPAL_MISMATCH';
export const INSTALLMENT_INVALID_AMOUNT = 'INSTALLMENT_INVALID_AMOUNT';
export const INSTALLMENT_INVALID_STATUS = 'INSTALLMENT_INVALID_STATUS';
export const INSTALLMENT_ALREADY_PAID = 'INSTALLMENT_ALREADY_PAID';
export const INSTALLMENT_AR_CLOSED = 'INSTALLMENT_AR_CLOSED';
export const INSTALLMENT_IDEM_REQUIRED = 'INSTALLMENT_IDEM_REQUIRED';
export const INSTALLMENT_FORBIDDEN = 'INSTALLMENT_FORBIDDEN';

export type InstallmentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InstallmentScheduleItemInput {
  readonly installmentNumber: number;
  readonly principalCents: number;
  readonly interestCents: number;
  readonly dueDateIso: string;
}

export interface InstallmentScheduleItemPlan {
  readonly installmentNumber: number;
  readonly principalCents: number;
  readonly interestCents: number;
  readonly amountCents: number;
  readonly dueDateIso: string;
  readonly status: 'PENDING';
}

export interface InstallmentSchedulePlan {
  readonly schedulePrincipalCents: number;
  readonly downPaymentCents: number;
  readonly items: readonly InstallmentScheduleItemPlan[];
  readonly emitsFiscalDocument: false;
}

export interface InstallmentPayPlan {
  readonly appliedToArCents: number;
  readonly interestCents: number;
  readonly amountCents: number;
  readonly nextStatus: 'PAID';
  readonly clientAmountsIgnored: true;
}

function assertNonNegCents(amount: number, code: string): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(code);
}

function assertPositiveCents(amount: number, code: string): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(code);
}

/**
 * Valida el calendario: Σ principal = saldo programado (total − abono inicial);
 * amount = principal + interest (COM-06).
 */
export function planInstallmentSchedule(input: {
  readonly saleTotalCents: number;
  readonly downPaymentCents: number;
  readonly items: readonly InstallmentScheduleItemInput[];
}): InstallmentSchedulePlan {
  assertPositiveCents(input.saleTotalCents, INSTALLMENT_INVALID_AMOUNT);
  assertNonNegCents(input.downPaymentCents, INSTALLMENT_INVALID_AMOUNT);
  if (input.downPaymentCents >= input.saleTotalCents) {
    throw new Error(INSTALLMENT_INVALID_AMOUNT);
  }
  if (input.items.length === 0) throw new Error(INSTALLMENT_SCHEDULE_REQUIRED);

  const schedulePrincipalCents = input.saleTotalCents - input.downPaymentCents;
  let sumPrincipal = 0;
  const seen = new Set<number>();
  const items: InstallmentScheduleItemPlan[] = [];

  for (const raw of input.items) {
    if (!Number.isInteger(raw.installmentNumber) || raw.installmentNumber < 1) {
      throw new Error(INSTALLMENT_INVALID_AMOUNT);
    }
    if (seen.has(raw.installmentNumber)) throw new Error(INSTALLMENT_INVALID_AMOUNT);
    seen.add(raw.installmentNumber);
    assertNonNegCents(raw.principalCents, INSTALLMENT_INVALID_AMOUNT);
    assertNonNegCents(raw.interestCents, INSTALLMENT_INVALID_AMOUNT);
    if (raw.principalCents === 0 && raw.interestCents === 0) {
      throw new Error(INSTALLMENT_INVALID_AMOUNT);
    }
    if (!raw.dueDateIso.trim()) throw new Error(INSTALLMENT_INVALID_AMOUNT);
    const amountCents = raw.principalCents + raw.interestCents;
    assertPositiveCents(amountCents, INSTALLMENT_INVALID_AMOUNT);
    sumPrincipal += raw.principalCents;
    items.push({
      installmentNumber: raw.installmentNumber,
      principalCents: raw.principalCents,
      interestCents: raw.interestCents,
      amountCents,
      dueDateIso: raw.dueDateIso.slice(0, 10),
      status: 'PENDING',
    });
  }

  if (sumPrincipal !== schedulePrincipalCents) {
    throw new Error(INSTALLMENT_PRINCIPAL_MISMATCH);
  }

  return {
    schedulePrincipalCents,
    downPaymentCents: input.downPaymentCents,
    items,
    emitsFiscalDocument: false,
  };
}

export function markInstallmentOverdue(input: {
  readonly status: InstallmentStatus;
  readonly dueDateIso: string;
  readonly nowIso: string;
}): InstallmentStatus {
  if (input.status !== 'PENDING') return input.status;
  const today = input.nowIso.slice(0, 10);
  return today > input.dueDateIso.slice(0, 10) ? 'OVERDUE' : 'PENDING';
}

export function assertInstallmentPayable(input: {
  readonly status: InstallmentStatus;
  readonly dueDateIso: string;
  readonly nowIso: string;
  readonly arBalanceDueCents: number;
  readonly actorIsSupervisorOrAbove: boolean;
  readonly idempotencyKey: string;
}): InstallmentStatus {
  if (!input.actorIsSupervisorOrAbove) throw new Error(INSTALLMENT_FORBIDDEN);
  if (!input.idempotencyKey.trim()) throw new Error(INSTALLMENT_IDEM_REQUIRED);
  if (input.status === 'PAID') throw new Error(INSTALLMENT_ALREADY_PAID);
  if (input.status === 'CANCELLED') throw new Error(INSTALLMENT_INVALID_STATUS);
  if (!Number.isInteger(input.arBalanceDueCents) || input.arBalanceDueCents <= 0) {
    throw new Error(INSTALLMENT_AR_CLOSED);
  }
  const effective = markInstallmentOverdue({
    status: input.status,
    dueDateIso: input.dueDateIso,
    nowIso: input.nowIso,
  });
  if (effective !== 'PENDING' && effective !== 'OVERDUE') {
    throw new Error(INSTALLMENT_INVALID_STATUS);
  }
  return effective;
}

/**
 * Zero-Trust: montos salen de la fila servidor. Solo principal reduce AR (COM-06).
 */
export function planInstallmentPay(input: {
  readonly status: InstallmentStatus;
  readonly dueDateIso: string;
  readonly nowIso: string;
  readonly principalCents: number;
  readonly interestCents: number;
  readonly amountCents: number;
  readonly arBalanceDueCents: number;
  readonly actorIsSupervisorOrAbove: boolean;
  readonly idempotencyKey: string;
  readonly clientPrincipalCents?: number;
  readonly clientInterestCents?: number;
}): InstallmentPayPlan {
  assertInstallmentPayable(input);
  assertNonNegCents(input.principalCents, INSTALLMENT_INVALID_AMOUNT);
  assertNonNegCents(input.interestCents, INSTALLMENT_INVALID_AMOUNT);
  if (input.amountCents !== input.principalCents + input.interestCents) {
    throw new Error(INSTALLMENT_INVALID_AMOUNT);
  }
  assertPositiveCents(input.amountCents, INSTALLMENT_INVALID_AMOUNT);
  if (input.principalCents > input.arBalanceDueCents) {
    throw new Error(INSTALLMENT_AR_CLOSED);
  }
  void input.clientPrincipalCents;
  void input.clientInterestCents;
  return {
    appliedToArCents: input.principalCents,
    interestCents: input.interestCents,
    amountCents: input.amountCents,
    nextStatus: 'PAID',
    clientAmountsIgnored: true,
  };
}

/** NC full (AR → 0): cancelar PENDING|OVERDUE en el mismo batch. */
export function shouldCancelInstallmentsOnArClosed(input: {
  readonly nextArBalanceCents: number;
}): boolean {
  return input.nextArBalanceCents <= 0;
}

/** Atraso nunca corta la caja (GTM-22 / ADR-0020). */
export function installmentOverdueBlocksCaja(): false {
  return false;
}
