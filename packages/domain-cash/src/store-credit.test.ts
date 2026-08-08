import { describe, expect, it } from 'vitest';
import {
  STORE_CREDIT_AUTH_REQUIRED,
  STORE_CREDIT_CUSTOMER_REQUIRED,
  STORE_CREDIT_EXPIRED,
  STORE_CREDIT_FORBIDDEN,
  STORE_CREDIT_INSUFFICIENT,
  STORE_CREDIT_INVALID_AMOUNT,
  STORE_CREDIT_NC_NOT_ELIGIBLE,
  STORE_CREDIT_OFFLINE,
  STORE_CREDIT_SOURCE_REQUIRED,
  assertNcCanIssueStoreCredit,
  assertStoreCreditRedeemable,
  giftCardSaleSourceRef,
  ncStoreCreditSourceRef,
  planStoreCreditAdjust,
  planStoreCreditExpire,
  planStoreCreditIssue,
  redeemStoreCreditSourceRef,
} from './store-credit.js';

describe('planStoreCreditIssue', () => {
  it('sube saldo 1:1 y emite doc (vale = venta)', () => {
    const plan = planStoreCreditIssue({
      customerId: 'c1',
      currentBalanceCents: 500,
      amountCents: 11800,
      sourceRef: giftCardSaleSourceRef('s1'),
    });
    expect(plan.type).toBe('ISSUE');
    expect(plan.nextBalanceCents).toBe(12300);
    expect(plan.emitsFiscalDocument).toBe(true);
    expect(plan.sourceRef).toBe('gift_card_sale:s1');
  });

  it('exige cliente y source_ref', () => {
    expect(() =>
      planStoreCreditIssue({
        customerId: '  ',
        currentBalanceCents: 0,
        amountCents: 100,
        sourceRef: 'gift_card_sale:s1',
      }),
    ).toThrow(STORE_CREDIT_CUSTOMER_REQUIRED);
    expect(() =>
      planStoreCreditIssue({
        customerId: 'c1',
        currentBalanceCents: 0,
        amountCents: 100,
        sourceRef: '  ',
      }),
    ).toThrow(STORE_CREDIT_SOURCE_REQUIRED);
    expect(() => giftCardSaleSourceRef('')).toThrow(STORE_CREDIT_SOURCE_REQUIRED);
    expect(() => ncStoreCreditSourceRef('')).toThrow(STORE_CREDIT_SOURCE_REQUIRED);
  });

  it('rechaza montos no enteros o ≤0', () => {
    expect(() =>
      planStoreCreditIssue({
        customerId: 'c1',
        currentBalanceCents: 0,
        amountCents: 0,
        sourceRef: 'gift_card_sale:s1',
      }),
    ).toThrow(STORE_CREDIT_INVALID_AMOUNT);
    expect(() =>
      planStoreCreditIssue({
        customerId: 'c1',
        currentBalanceCents: -1,
        amountCents: 100,
        sourceRef: 'gift_card_sale:s1',
      }),
    ).toThrow(STORE_CREDIT_INVALID_AMOUNT);
  });
});

describe('assertStoreCreditRedeemable', () => {
  const base = {
    customerId: 'c1',
    online: true,
    actorIsAdminOrOwner: true,
    balanceCents: 5000,
    remainingDueCents: 3000,
    nowMs: 1_000,
    saleId: 's9',
  };

  it('impone min(balance, due) e ignora monto cliente', () => {
    const plan = assertStoreCreditRedeemable({ ...base, clientAmountCents: 99_999 });
    expect(plan.appliedCents).toBe(3000);
    expect(plan.clientAmountIgnored).toBe(true);
    expect(plan.nextBalanceCents).toBe(2000);
    expect(plan.sourceRef).toBe(redeemStoreCreditSourceRef('s9'));
  });

  it('0 canje sin saldo / offline / cajero / expirado', () => {
    expect(() => assertStoreCreditRedeemable({ ...base, balanceCents: 0 })).toThrow(
      STORE_CREDIT_INSUFFICIENT,
    );
    expect(() => assertStoreCreditRedeemable({ ...base, remainingDueCents: 0 })).toThrow(
      STORE_CREDIT_INSUFFICIENT,
    );
    expect(() => assertStoreCreditRedeemable({ ...base, online: false })).toThrow(
      STORE_CREDIT_OFFLINE,
    );
    expect(() => assertStoreCreditRedeemable({ ...base, actorIsAdminOrOwner: false })).toThrow(
      STORE_CREDIT_FORBIDDEN,
    );
    expect(() => assertStoreCreditRedeemable({ ...base, expiresAtMs: 500, nowMs: 1_000 })).toThrow(
      STORE_CREDIT_EXPIRED,
    );
    expect(() => assertStoreCreditRedeemable({ ...base, customerId: null })).toThrow(
      STORE_CREDIT_CUSTOMER_REQUIRED,
    );
  });
});

describe('planStoreCreditExpire / Adjust / NC consent', () => {
  it('expire on-read solo si venció con saldo', () => {
    const plan = planStoreCreditExpire({
      balanceCents: 800,
      expiresAtMs: 100,
      nowMs: 200,
    });
    expect(plan.nextBalanceCents).toBe(0);
    expect(plan.amountCents).toBe(800);
    expect(() =>
      planStoreCreditExpire({ balanceCents: 800, expiresAtMs: 300, nowMs: 200 }),
    ).toThrow(STORE_CREDIT_EXPIRED);
    expect(() => planStoreCreditExpire({ balanceCents: 0, expiresAtMs: 100, nowMs: 200 })).toThrow(
      STORE_CREDIT_INVALID_AMOUNT,
    );
  });

  it('adjust DEBIT no baja de 0 y exige authz', () => {
    expect(
      planStoreCreditAdjust({
        currentBalanceCents: 1000,
        amountCents: 400,
        adjustSign: 'DEBIT',
        authorizedByUserId: 'u-admin',
      }).nextBalanceCents,
    ).toBe(600);
    expect(
      planStoreCreditAdjust({
        currentBalanceCents: 1000,
        amountCents: 400,
        adjustSign: 'CREDIT',
        authorizedByUserId: 'u-admin',
      }).nextBalanceCents,
    ).toBe(1400);
    expect(() =>
      planStoreCreditAdjust({
        currentBalanceCents: 100,
        amountCents: 200,
        adjustSign: 'DEBIT',
        authorizedByUserId: 'u-admin',
      }),
    ).toThrow(STORE_CREDIT_INSUFFICIENT);
    expect(() =>
      planStoreCreditAdjust({
        currentBalanceCents: 100,
        amountCents: 10,
        adjustSign: 'CREDIT',
        authorizedByUserId: null,
      }),
    ).toThrow(STORE_CREDIT_AUTH_REQUIRED);
  });

  it('NC→crédito solo con consentimiento y sin AR/cash', () => {
    expect(() =>
      assertNcCanIssueStoreCredit({
        consentStoreCredit: true,
        arCompensate: false,
        cashRefund: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertNcCanIssueStoreCredit({
        consentStoreCredit: false,
        arCompensate: false,
        cashRefund: false,
      }),
    ).toThrow(STORE_CREDIT_NC_NOT_ELIGIBLE);
    expect(() =>
      assertNcCanIssueStoreCredit({
        consentStoreCredit: true,
        arCompensate: true,
        cashRefund: false,
      }),
    ).toThrow(STORE_CREDIT_NC_NOT_ELIGIBLE);
    expect(() =>
      assertNcCanIssueStoreCredit({
        consentStoreCredit: true,
        arCompensate: false,
        cashRefund: true,
      }),
    ).toThrow(STORE_CREDIT_NC_NOT_ELIGIBLE);
  });
});
