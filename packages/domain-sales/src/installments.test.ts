import { describe, expect, it } from 'vitest';
import {
  INSTALLMENT_ALREADY_PAID,
  INSTALLMENT_AR_CLOSED,
  INSTALLMENT_FORBIDDEN,
  INSTALLMENT_IDEM_REQUIRED,
  INSTALLMENT_INVALID_AMOUNT,
  INSTALLMENT_PRINCIPAL_MISMATCH,
  INSTALLMENT_SCHEDULE_REQUIRED,
  assertInstallmentPayable,
  installmentOverdueBlocksCaja,
  markInstallmentOverdue,
  planInstallmentPay,
  planInstallmentSchedule,
  shouldCancelInstallmentsOnArClosed,
} from './installments.js';

describe('planInstallmentSchedule', () => {
  it('acepta Σ principal = total − abono y amount = principal + interest', () => {
    const plan = planInstallmentSchedule({
      saleTotalCents: 10_000,
      downPaymentCents: 2_000,
      items: [
        {
          installmentNumber: 1,
          principalCents: 4_000,
          interestCents: 100,
          dueDateIso: '2026-09-01',
        },
        {
          installmentNumber: 2,
          principalCents: 4_000,
          interestCents: 0,
          dueDateIso: '2026-10-01',
        },
      ],
    });
    expect(plan.schedulePrincipalCents).toBe(8_000);
    expect(plan.items[0]?.amountCents).toBe(4_100);
    expect(plan.emitsFiscalDocument).toBe(false);
  });

  it('rechaza Σ principal ≠ saldo programado', () => {
    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 10_000,
        downPaymentCents: 0,
        items: [
          {
            installmentNumber: 1,
            principalCents: 9_000,
            interestCents: 0,
            dueDateIso: '2026-09-01',
          },
        ],
      }),
    ).toThrow(INSTALLMENT_PRINCIPAL_MISMATCH);
  });

  it('rechaza schedule vacío', () => {
    expect(() =>
      planInstallmentSchedule({ saleTotalCents: 1_000, downPaymentCents: 0, items: [] }),
    ).toThrow(INSTALLMENT_SCHEDULE_REQUIRED);
  });

  it('rechaza abono >= total', () => {
    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 1_000,
        downPaymentCents: 1_000,
        items: [
          {
            installmentNumber: 1,
            principalCents: 0,
            interestCents: 0,
            dueDateIso: '2026-09-01',
          },
        ],
      }),
    ).toThrow(INSTALLMENT_INVALID_AMOUNT);
  });

  it('expone schedulePrincipalCents para credit_limit en el adapter', () => {
    const plan = planInstallmentSchedule({
      saleTotalCents: 8_000,
      downPaymentCents: 0,
      items: [
        {
          installmentNumber: 1,
          principalCents: 8_000,
          interestCents: 0,
          dueDateIso: '2026-09-01',
        },
      ],
    });
    expect(plan.schedulePrincipalCents).toBe(8_000);
  });
});

describe('planInstallmentPay COM-06', () => {
  const base = {
    status: 'PENDING' as const,
    dueDateIso: '2026-09-01',
    nowIso: '2026-08-15',
    principalCents: 4_000,
    interestCents: 200,
    amountCents: 4_200,
    arBalanceDueCents: 8_000,
    actorIsSupervisorOrAbove: true,
    idempotencyKey: 'idem-1',
  };

  it('solo principal aplica a AR; ignora montos cliente', () => {
    const pay = planInstallmentPay({
      ...base,
      clientPrincipalCents: 1,
      clientInterestCents: 99_999,
    });
    expect(pay.appliedToArCents).toBe(4_000);
    expect(pay.interestCents).toBe(200);
    expect(pay.clientAmountsIgnored).toBe(true);
  });

  it('doble pay → ALREADY_PAID', () => {
    expect(() => planInstallmentPay({ ...base, status: 'PAID' })).toThrow(INSTALLMENT_ALREADY_PAID);
  });

  it('AR cerrado → INSTALLMENT_AR_CLOSED', () => {
    expect(() => planInstallmentPay({ ...base, arBalanceDueCents: 0 })).toThrow(
      INSTALLMENT_AR_CLOSED,
    );
  });

  it('cajero no cobra cuota', () => {
    expect(() =>
      assertInstallmentPayable({
        status: 'PENDING',
        dueDateIso: '2026-09-01',
        nowIso: '2026-08-15',
        arBalanceDueCents: 1_000,
        actorIsSupervisorOrAbove: false,
        idempotencyKey: 'k',
      }),
    ).toThrow(INSTALLMENT_FORBIDDEN);
  });

  it('exige idempotency key', () => {
    expect(() =>
      assertInstallmentPayable({
        status: 'PENDING',
        dueDateIso: '2026-09-01',
        nowIso: '2026-08-15',
        arBalanceDueCents: 1_000,
        actorIsSupervisorOrAbove: true,
        idempotencyKey: '  ',
      }),
    ).toThrow(INSTALLMENT_IDEM_REQUIRED);
  });
});

describe('OVERDUE on-read', () => {
  it('PENDING + due_date < hoy → OVERDUE', () => {
    expect(
      markInstallmentOverdue({
        status: 'PENDING',
        dueDateIso: '2026-07-01',
        nowIso: '2026-08-07',
      }),
    ).toBe('OVERDUE');
  });

  it('atraso no corta caja', () => {
    expect(installmentOverdueBlocksCaja()).toBe(false);
  });
});

describe('NC full cancela PENDING', () => {
  it('AR → 0 cancela schedule', () => {
    expect(shouldCancelInstallmentsOnArClosed({ nextArBalanceCents: 0 })).toBe(true);
    expect(shouldCancelInstallmentsOnArClosed({ nextArBalanceCents: 1 })).toBe(false);
  });
});

describe('Casos limite y validaciones adicionales de cuotas', () => {
  it('rechaza installmentNumber invalido o duplicado', () => {
    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 5_000,
        downPaymentCents: 0,
        items: [
          {
            installmentNumber: 0,
            principalCents: 5_000,
            interestCents: 0,
            dueDateIso: '2026-09-01',
          },
        ],
      }),
    ).toThrow(INSTALLMENT_INVALID_AMOUNT);

    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 5_000,
        downPaymentCents: 0,
        items: [
          {
            installmentNumber: 1,
            principalCents: 2_500,
            interestCents: 0,
            dueDateIso: '2026-09-01',
          },
          {
            installmentNumber: 1,
            principalCents: 2_500,
            interestCents: 0,
            dueDateIso: '2026-10-01',
          },
        ],
      }),
    ).toThrow(INSTALLMENT_INVALID_AMOUNT);
  });

  it('rechaza cuota con principal=0 e interes=0 o fecha vacia', () => {
    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 0,
        downPaymentCents: 0,
        items: [
          { installmentNumber: 1, principalCents: 0, interestCents: 0, dueDateIso: '2026-09-01' },
        ],
      }),
    ).toThrow(INSTALLMENT_INVALID_AMOUNT);

    expect(() =>
      planInstallmentSchedule({
        saleTotalCents: 5_000,
        downPaymentCents: 0,
        items: [
          { installmentNumber: 1, principalCents: 5_000, interestCents: 0, dueDateIso: '  ' },
        ],
      }),
    ).toThrow(INSTALLMENT_INVALID_AMOUNT);
  });

  it('markInstallmentOverdue preserva estado PAID si ya esta pagado', () => {
    expect(
      markInstallmentOverdue({
        status: 'PAID',
        dueDateIso: '2026-07-01',
        nowIso: '2026-08-07',
      }),
    ).toBe('PAID');
  });

  it('rechaza planInstallmentPay cuando monto total o principal sobrepasa el saldo AR', () => {
    const base = {
      status: 'PENDING' as const,
      dueDateIso: '2026-09-01',
      nowIso: '2026-08-15',
      principalCents: 4_000,
      interestCents: 200,
      amountCents: 4_000, // inconsistente con principal + interest
      arBalanceDueCents: 8_000,
      actorIsSupervisorOrAbove: true,
      idempotencyKey: 'idem-1',
    };
    expect(() => planInstallmentPay(base)).toThrow(INSTALLMENT_INVALID_AMOUNT);

    expect(() =>
      planInstallmentPay({
        ...base,
        principalCents: 10_000,
        interestCents: 200,
        amountCents: 10_200,
        arBalanceDueCents: 5_000,
      }),
    ).toThrow(INSTALLMENT_AR_CLOSED);
  });
});
