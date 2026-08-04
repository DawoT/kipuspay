import { describe, expect, it } from 'vitest';
import {
  assertPurchaseOrderTransition,
  compensateArOnCreditNote,
  defaultCreditDueDateIso,
  planCreateAp,
  planCreateAr,
  planCreateExpense,
  planPayAp,
  planPayAr,
} from './ledger.js';

describe('planCreateAr', () => {
  it('asiento trazable a origin_sale_id', () => {
    const plan = planCreateAr({
      id: 'ar1',
      tenantId: 't1',
      customerId: 'c1',
      saleId: 'sale-origin',
      amountCents: 11800,
      dueDateIso: '2026-09-03 12:00:00',
      createdAtIso: '2026-08-04 12:00:00',
    });
    expect(plan.originSaleId).toBe('sale-origin');
    expect(plan.balanceDueCents).toBe(11800);
    expect(plan.status).toBe('OPEN');
  });

  it('rechaza monto no entero / sin cliente', () => {
    expect(() =>
      planCreateAr({
        id: 'ar1',
        tenantId: 't1',
        customerId: '',
        saleId: 's1',
        amountCents: 100,
        dueDateIso: 'x',
        createdAtIso: 'y',
      }),
    ).toThrow(/AR_REQUIRES_CUSTOMER/);
    expect(() =>
      planCreateAr({
        id: 'ar1',
        tenantId: 't1',
        customerId: 'c1',
        saleId: 's1',
        amountCents: 10.5,
        dueDateIso: 'x',
        createdAtIso: 'y',
      }),
    ).toThrow(/INVALID_AR_AMOUNT/);
  });
});

describe('planPayAr', () => {
  it('parcial deja PARTIALLY_PAID; total PAID; nunca saldo negativo', () => {
    const partial = planPayAr({
      paymentId: 'p1',
      accountsReceivableId: 'ar1',
      currentBalanceCents: 1000,
      amountCents: 400,
      paymentMethod: 'cash',
      collectedByUserId: 'u1',
    });
    expect(partial.nextBalanceCents).toBe(600);
    expect(partial.nextStatus).toBe('PARTIALLY_PAID');

    const total = planPayAr({
      paymentId: 'p2',
      accountsReceivableId: 'ar1',
      currentBalanceCents: 600,
      amountCents: 600,
      paymentMethod: 'cash',
      collectedByUserId: 'u1',
    });
    expect(total.nextBalanceCents).toBe(0);
    expect(total.nextStatus).toBe('PAID');

    expect(() =>
      planPayAr({
        paymentId: 'p3',
        accountsReceivableId: 'ar1',
        currentBalanceCents: 100,
        amountCents: 101,
        paymentMethod: 'cash',
        collectedByUserId: 'u1',
      }),
    ).toThrow(/AR_PAYMENT_EXCEEDS_BALANCE/);
  });
});

describe('compensateArOnCreditNote', () => {
  it('parcial no deja saldo negativo; total cierra PAID', () => {
    const partial = compensateArOnCreditNote({
      accountsReceivableId: 'ar1',
      originSaleId: 'sale1',
      currentBalanceCents: 1000,
      creditAmountCents: 300,
      paymentId: 'pay-nc',
      collectedByUserId: 'u1',
      source: 'CREDIT_NOTE',
    });
    expect(partial.appliedCents).toBe(300);
    expect(partial.nextBalanceCents).toBe(700);
    expect(partial.nextStatus).toBe('PARTIALLY_PAID');
    expect(partial.paymentMethod).toBe('CREDIT_NOTE');

    const total = compensateArOnCreditNote({
      accountsReceivableId: 'ar1',
      originSaleId: 'sale1',
      currentBalanceCents: 700,
      creditAmountCents: 5000,
      paymentId: 'pay-nvr',
      collectedByUserId: 'u1',
      source: 'NV_RETURN',
    });
    expect(total.appliedCents).toBe(700);
    expect(total.nextBalanceCents).toBe(0);
    expect(total.nextStatus).toBe('PAID');
  });

  it('fail-closed si ya liquidado', () => {
    expect(() =>
      compensateArOnCreditNote({
        accountsReceivableId: 'ar1',
        originSaleId: 'sale1',
        currentBalanceCents: 0,
        creditAmountCents: 100,
        paymentId: 'p',
        collectedByUserId: 'u1',
        source: 'CREDIT_NOTE',
      }),
    ).toThrow(/AR_ALREADY_SETTLED/);
  });
});

describe('AP / OC / egreso', () => {
  it('crea AP y paga sin exceso', () => {
    const ap = planCreateAp({
      id: 'ap1',
      tenantId: 't1',
      supplierId: 'sup1',
      purchaseOrderId: 'po1',
      amountCents: 5000,
      dueDateIso: '2026-09-01 00:00:00',
    });
    expect(ap.balanceDueCents).toBe(5000);
    const pay = planPayAp({
      paymentId: 'app1',
      accountsPayableId: 'ap1',
      currentBalanceCents: 5000,
      amountCents: 2000,
      paymentMethod: 'transfer',
      cashRegisterSessionId: 'sess1',
    });
    expect(pay.nextStatus).toBe('PARTIALLY_PAID');
    expect(pay.cashRegisterSessionId).toBe('sess1');
    const closed = planPayAp({
      paymentId: 'app2',
      accountsPayableId: 'ap1',
      currentBalanceCents: 3000,
      amountCents: 3000,
      paymentMethod: 'transfer',
    });
    expect(closed.nextStatus).toBe('PAID');
  });

  it('AP fail-closed sin supplier / exceso / monto inválido', () => {
    expect(() =>
      planCreateAp({
        id: 'ap1',
        tenantId: 't1',
        supplierId: '  ',
        purchaseOrderId: null,
        amountCents: 100,
        dueDateIso: 'x',
      }),
    ).toThrow(/AP_REQUIRES_SUPPLIER/);
    expect(() =>
      planCreateAp({
        id: 'ap1',
        tenantId: 't1',
        supplierId: 's',
        purchaseOrderId: null,
        amountCents: -1,
        dueDateIso: 'x',
      }),
    ).toThrow(/INVALID_AP_AMOUNT/);
    expect(() =>
      planPayAp({
        paymentId: 'p',
        accountsPayableId: 'ap1',
        currentBalanceCents: 10,
        amountCents: 11,
        paymentMethod: 'cash',
      }),
    ).toThrow(/AP_PAYMENT_EXCEEDS_BALANCE/);
    expect(() =>
      planPayAp({
        paymentId: 'p',
        accountsPayableId: 'ap1',
        currentBalanceCents: -1,
        amountCents: 1,
        paymentMethod: 'cash',
      }),
    ).toThrow(/INVALID_AP_BALANCE/);
  });

  it('máquina de estados OC mínima', () => {
    expect(() => assertPurchaseOrderTransition('DRAFT', 'SENT')).not.toThrow();
    expect(() => assertPurchaseOrderTransition('DRAFT', 'CANCELED')).not.toThrow();
    expect(() => assertPurchaseOrderTransition('SENT', 'RECEIVED')).not.toThrow();
    expect(() => assertPurchaseOrderTransition('SENT', 'CANCELED')).not.toThrow();
    expect(() => assertPurchaseOrderTransition('RECEIVED', 'DRAFT')).toThrow(
      /PO_INVALID_TRANSITION/,
    );
    expect(() => assertPurchaseOrderTransition('CANCELED', 'DRAFT')).toThrow(
      /PO_INVALID_TRANSITION/,
    );
  });

  it('egreso caja chica positivo', () => {
    const exp = planCreateExpense({
      id: 'e1',
      tenantId: 't1',
      branchId: 'b1',
      cashRegisterSessionId: 'sess1',
      category: 'SUPPLIES',
      amountCents: 2500,
      description: 'Bolsas',
      authorizedByUserId: 'u1',
      accountsPayableId: 'ap1',
    });
    expect(exp.amountCents).toBe(2500);
    expect(exp.accountsPayableId).toBe('ap1');
    expect(() =>
      planCreateExpense({
        id: 'e2',
        tenantId: 't1',
        branchId: 'b1',
        cashRegisterSessionId: 'sess1',
        category: 'OTHER',
        amountCents: 0,
        description: 'x',
        authorizedByUserId: 'u1',
      }),
    ).toThrow(/INVALID_EXPENSE_AMOUNT/);
    expect(() =>
      planCreateExpense({
        id: 'e3',
        tenantId: 't1',
        branchId: 'b1',
        cashRegisterSessionId: 'sess1',
        category: 'OTHER',
        amountCents: 10,
        description: '   ',
        authorizedByUserId: 'u1',
      }),
    ).toThrow(/EXPENSE_REQUIRES_DESCRIPTION/);
    expect(() =>
      planCreateExpense({
        id: 'e4',
        tenantId: 't1',
        branchId: 'b1',
        cashRegisterSessionId: 'sess1',
        category: 'INVALID' as 'OTHER',
        amountCents: 10,
        description: 'x',
        authorizedByUserId: 'u1',
      }),
    ).toThrow(/INVALID_EXPENSE_CATEGORY/);
  });
});

describe('defaultCreditDueDateIso', () => {
  it('+30d desde issued_at_lima', () => {
    expect(defaultCreditDueDateIso('2026-08-04 12:00:00', 30)).toBe('2026-09-03 12:00:00');
  });

  it('rechaza issued inválido', () => {
    expect(() => defaultCreditDueDateIso('not-a-date')).toThrow(/INVALID_ISSUED_AT/);
  });
});

describe('planPayAr edge', () => {
  it('rechaza balance inválido y exige sale en create', () => {
    expect(() =>
      planPayAr({
        paymentId: 'p',
        accountsReceivableId: 'ar',
        currentBalanceCents: -5,
        amountCents: 1,
        paymentMethod: 'cash',
        collectedByUserId: 'u',
      }),
    ).toThrow(/INVALID_AR_BALANCE/);
    expect(() =>
      planCreateAr({
        id: 'ar',
        tenantId: 't',
        customerId: 'c',
        saleId: '  ',
        amountCents: 1,
        dueDateIso: 'x',
        createdAtIso: 'y',
      }),
    ).toThrow(/AR_REQUIRES_ORIGIN_SALE/);
    expect(() =>
      compensateArOnCreditNote({
        accountsReceivableId: 'ar',
        originSaleId: 's',
        currentBalanceCents: 10,
        creditAmountCents: 0,
        paymentId: 'p',
        collectedByUserId: 'u',
        source: 'CREDIT_NOTE',
      }),
    ).toThrow(/INVALID_CREDIT_AMOUNT/);
  });
});
