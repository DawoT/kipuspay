import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  assertValidDebitNoteXml,
  buildUblDebitNoteXml,
  type UblDebitNoteInput,
} from './ubl-debit-note.js';
import { assertWellFormedXml, hashUblXml } from './ubl-shared.js';

const sample = (): UblDebitNoteInput => ({
  ublVersion: '2.1',
  customizationId: '1.0',
  id: 'FD01-00000001',
  issueDate: '2026-08-05',
  issueTime: '11:00:00',
  currency: 'PEN',
  issuerRuc: '20123456789',
  issuerName: 'KipusPay SAC',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  referencedDocId: 'F001-00000007',
  motiveCode: '02',
  totalTaxableCents: 500,
  totalIgvCents: 90,
  totalIcbperCents: 0,
  totalAmountCents: 590,
  lines: [
    {
      id: 1,
      description: 'Producto A&B',
      quantity: 1,
      unitCode: 'NIU',
      igvAffectationCode: '10',
      igvCents: 90,
      lineTotalCents: 590,
      icbperCents: 0,
    },
  ],
});

describe('buildUblDebitNoteXml (Ops-3)', () => {
  it('genera XML DebitNote 2.1 válido con referencia al documento origen', async () => {
    const xml = buildUblDebitNoteXml(sample());
    expect(() => assertValidDebitNoteXml(xml)).not.toThrow();
    expect(xml).toContain('FD01-00000001');
    expect(xml).toContain('<cbc:DebitNoteTypeCode listID="0101">08</cbc:DebitNoteTypeCode>');
    expect(xml).toContain('<cbc:ReferenceID>F001-00000007</cbc:ReferenceID>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ResponseCode>02</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">5.90</cbc:PayableAmount>');
    expect(xml).toContain('A&amp;B');
    const hash = await hashUblXml(xml);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rechaza inputs inválidos (monto cero/negativo, referencia, motivo, RUC, líneas)', () => {
    expect(() => buildUblDebitNoteXml({ ...sample(), totalAmountCents: 0 })).toThrow(
      /ND_TOTAL_MUST_BE_POSITIVE/,
    );
    expect(() => buildUblDebitNoteXml({ ...sample(), totalAmountCents: -590 })).toThrow(
      /ND_TOTAL_MUST_BE_POSITIVE/,
    );
    expect(() => buildUblDebitNoteXml({ ...sample(), referencedDocId: 'NO ESPACIOS' })).toThrow(
      /INVALID_REFERENCED_DOC/,
    );
    expect(() => buildUblDebitNoteXml({ ...sample(), motiveCode: 'ABC' })).toThrow(
      /INVALID_MOTIVE_CODE/,
    );
    expect(() => buildUblDebitNoteXml({ ...sample(), lines: [] })).toThrow(/EMPTY_LINES/);
    expect(() => buildUblDebitNoteXml({ ...sample(), issuerRuc: '123' })).toThrow(
      /INVALID_ISSUER_RUC/,
    );
    expect(() => buildUblDebitNoteXml({ ...sample(), ublVersion: '2.0' as '2.1' })).toThrow(
      /UNSUPPORTED_UBL_VERSION/,
    );
  });

  it('assertValidDebitNoteXml detecta XML incompleto y malformado', () => {
    const xml = buildUblDebitNoteXml(sample());
    expect(() =>
      assertValidDebitNoteXml(xml.replace('listID="0101">08', 'listID="0101">99')),
    ).toThrow(/INVALID_DEBIT_NOTE_TYPE/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace(
          '<cac:DiscrepancyResponse>\n    <cbc:ReferenceID>F001-00000007</cbc:ReferenceID>\n    <cbc:ResponseCode>02</cbc:ResponseCode>\n  </cac:DiscrepancyResponse>',
          '',
        ),
      ),
    ).toThrow(/MISSING_DISCREPANCY_RESPONSE/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace(
          '<cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>F001-00000007</cbc:ID>\n    </cac:InvoiceDocumentReference>\n  </cac:BillingReference>',
          '',
        ),
      ),
    ).toThrow(/MISSING_BILLING_REFERENCE/);
    expect(() => assertValidDebitNoteXml('<DebitNote/>')).toThrow(/INVALID_UBL_VERSION/);
    const noLines = buildUblDebitNoteXml(sample()).slice(
      0,
      buildUblDebitNoteXml(sample()).lastIndexOf('<cac:DebitNoteLine>'),
    );
    expect(() => assertValidDebitNoteXml(noLines + '</DebitNote>')).toThrow(/MISSING_LINES/);
    expect(() =>
      assertValidDebitNoteXml(xml.replace('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>', '')),
    ).toThrow(/INVALID_UBL_VERSION/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>', '<cbc:UBLVersionID>2.1'),
      ),
    ).toThrow(/MALFORMED_XML/);
    expect(() => assertWellFormedXml('<DebitNote><a></a>')).toThrow(/MALFORMED_XML/);
  });
});
