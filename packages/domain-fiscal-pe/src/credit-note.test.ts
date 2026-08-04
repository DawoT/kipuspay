import { describe, expect, it } from 'vitest';
import { assertCreditNoteAllowed, stockRestoreQuantity } from './credit-note.js';

describe('assertCreditNoteAllowed', () => {
  const origin = {
    saleId: 's1',
    documentType: '01',
    sunatStatus: 'ACCEPTED' as const,
    totalAmountCents: 1180,
    residualCents: 1180,
  };

  it('exige ACCEPTED salvo E-A', () => {
    expect(() =>
      assertCreditNoteAllowed(
        { ...origin, sunatStatus: 'PENDING' },
        { motiveCode: '01', amountCents: 1180, fullCancellation: true, items: [] },
      ),
    ).toThrow(/FISCAL_CDR_REQUIRED/);

    const ea = assertCreditNoteAllowed(
      { ...origin, sunatStatus: 'REJECTED' },
      { motiveCode: '01', amountCents: 1180, fullCancellation: true, items: [] },
    );
    expect(ea.requiresNoCdrAudit).toBe(true);
  });

  it('E-A parcial rechazado; residual OK en ACCEPTED', () => {
    expect(() =>
      assertCreditNoteAllowed(
        { ...origin, sunatStatus: 'QUARANTINED' },
        { motiveCode: '01', amountCents: 500, fullCancellation: false, items: [] },
      ),
    ).toThrow(/EA_REQUIRES_FULL_CANCELLATION/);

    expect(
      assertCreditNoteAllowed(origin, {
        motiveCode: '01',
        amountCents: 500,
        fullCancellation: false,
        items: [],
      }).requiresNoCdrAudit,
    ).toBe(false);
  });

  it('rechaza monto inválido / residual / status raro', () => {
    expect(() =>
      assertCreditNoteAllowed(origin, {
        motiveCode: '01',
        amountCents: 0,
        fullCancellation: true,
        items: [],
      }),
    ).toThrow(/INVALID_NC_AMOUNT/);
    expect(() =>
      assertCreditNoteAllowed(origin, {
        motiveCode: '01',
        amountCents: 99999,
        fullCancellation: true,
        items: [],
      }),
    ).toThrow(/NC_EXCEEDS_RESIDUAL/);
    expect(() =>
      assertCreditNoteAllowed(
        { ...origin, sunatStatus: 'NOT_APPLICABLE' },
        { motiveCode: '01', amountCents: 1, fullCancellation: true, items: [] },
      ),
    ).toThrow(/FISCAL_CDR_REQUIRED/);
  });

  it('NV no usa NC fiscal', () => {
    expect(() =>
      assertCreditNoteAllowed(
        { ...origin, documentType: 'NV' },
        { motiveCode: '01', amountCents: 1, fullCancellation: true, items: [] },
      ),
    ).toThrow(/NV_USES_NV_RETURN_NOT_NC/);
  });
});

describe('stockRestoreQuantity E-B', () => {
  it('uncatalogued → 0 stock restore', () => {
    expect(stockRestoreQuantity({ quantity: 2, isUncatalogued: true })).toBe(0);
    expect(stockRestoreQuantity({ quantity: 2, isUncatalogued: false })).toBe(2);
  });
});
