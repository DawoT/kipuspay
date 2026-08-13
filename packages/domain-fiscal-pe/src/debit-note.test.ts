import { describe, expect, it } from 'vitest';
import {
  assertDebitNoteAllowed,
  debitNoteStockImpact,
  DEBIT_NOTE_MOTIVE_CODES,
  type DebitNoteOrigin,
} from './debit-note.js';

const ACCEPTED_FACTURA: DebitNoteOrigin = {
  saleId: 's1',
  documentType: '01',
  sunatStatus: 'ACCEPTED',
  totalAmountCents: 118000,
};

describe('Nota de Débito (P1a, ADR-FISCAL-003)', () => {
  it('acepta ND sobre factura aceptada con motivo del catálogo 10', () => {
    const result = assertDebitNoteAllowed(ACCEPTED_FACTURA, {
      motiveCode: '02',
      amountCents: 5900,
      description: 'Aumento de valor por descuento no aplicado',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requiresNoCdrAudit).toBe(false);
  });

  it('acepta ND sobre boleta aceptada (RC ya aceptado)', () => {
    const result = assertDebitNoteAllowed(
      { ...ACCEPTED_FACTURA, documentType: '03' },
      { motiveCode: '01', amountCents: 1200 },
    );
    expect(result.ok).toBe(true);
  });

  it('rechaza origen sin CDR (FISCAL_CDR_REQUIRED): la vía es NC E-A/E-B, no ND', () => {
    for (const status of [
      'PENDING',
      'PROCESSING',
      'REJECTED',
      'QUARANTINED',
      'DEADLINE_EXCEEDED',
    ] as const) {
      const result = assertDebitNoteAllowed(
        { ...ACCEPTED_FACTURA, sunatStatus: status },
        { motiveCode: '02', amountCents: 100 },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('FISCAL_CDR_REQUIRED');
    }
  });

  it('rechaza origen NV/NV_RETURN (solo factura o boleta)', () => {
    for (const documentType of ['NV', 'NV_RETURN', '07', '08', '12']) {
      const result = assertDebitNoteAllowed(
        { ...ACCEPTED_FACTURA, documentType },
        { motiveCode: '02', amountCents: 100 },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('DEBIT_NOTE_ORIGIN_UNSUPPORTED');
    }
  });

  it('catálogo 10 cerrado: 01/02/03/10; cualquier otro motivo → INVALID_DEBIT_NOTE_MOTIVE', () => {
    expect(DEBIT_NOTE_MOTIVE_CODES).toEqual(['01', '02', '03', '10']);
    const invalid = assertDebitNoteAllowed(ACCEPTED_FACTURA, {
      motiveCode: '99',
      amountCents: 100,
    });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_DEBIT_NOTE_MOTIVE' });
  });

  it('rechaza montos no enteros, cero o negativos', () => {
    for (const amountCents of [0, -1, 10.5]) {
      const result = assertDebitNoteAllowed(ACCEPTED_FACTURA, {
        motiveCode: '02',
        amountCents,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_DEBIT_NOTE_AMOUNT');
    }
  });

  it('rechaza descripción vacía', () => {
    const result = assertDebitNoteAllowed(ACCEPTED_FACTURA, {
      motiveCode: '02',
      amountCents: 100,
      description: '   ',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_DEBIT_NOTE_DESCRIPTION' });
  });

  it('la ND jamás toca stock (a diferencia de la NC)', () => {
    expect(debitNoteStockImpact()).toBe(0);
  });
});
