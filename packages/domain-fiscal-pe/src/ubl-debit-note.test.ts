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
  customizationId: '2.0',
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
    expect(xml).toContain('<cbc:ProfileID>0101</cbc:ProfileID>');
    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
    expect(xml).toContain('<cbc:Percent>18.00</cbc:Percent>');
    expect(xml).not.toContain('<cac:PaymentTerms>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    // e-beta 0306 (FL-1 2026-08-24): el schema restringido NO admite
    // cbc:DebitNoteTypeCode — el tipo 08 vive en el root <DebitNote>.
    expect(xml).not.toContain('<cbc:DebitNoteTypeCode');
    expect(xml).toContain('<cbc:ReferenceID>F001-00000007</cbc:ReferenceID>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ResponseCode>02</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description>Aumento en el valor</cbc:Description>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">5.90</cbc:PayableAmount>');
    expect(xml).toContain('A&amp;B');
    const exo = buildUblDebitNoteXml({
      ...sample(),
      totalIgvCents: 0,
      totalAmountCents: 500,
      lines: [
        { ...sample().lines[0]!, igvAffectationCode: '20', igvCents: 0, lineTotalCents: 500 },
      ],
    });
    expect(exo).toContain('<cbc:Percent>0.00</cbc:Percent>');
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
      /UNKNOWN_ND_MOTIVE/,
    );
    // FL-1 (CDR 2172): el wire 06 no existe en catálogo 10 — fail-closed.
    expect(() => buildUblDebitNoteXml({ ...sample(), motiveCode: '06' })).toThrow(
      /UNKNOWN_ND_MOTIVE/,
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
      assertValidDebitNoteXml(
        xml.replace(
          '<cbc:DocumentCurrencyCode>',
          '<cbc:DebitNoteTypeCode>08</cbc:DebitNoteTypeCode><cbc:DocumentCurrencyCode>',
        ),
      ),
    ).toThrow(/INVALID_DEBIT_NOTE_TYPE/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace(
          '<cac:DiscrepancyResponse>\n    <cbc:ReferenceID>F001-00000007</cbc:ReferenceID>\n    <cbc:ResponseCode>02</cbc:ResponseCode>\n    <cbc:Description>Aumento en el valor</cbc:Description>\n  </cac:DiscrepancyResponse>',
          '',
        ),
      ),
    ).toThrow(/MISSING_DISCREPANCY_RESPONSE/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace(
          '<cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>F001-00000007</cbc:ID>\n      <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>\n    </cac:InvoiceDocumentReference>\n  </cac:BillingReference>',
          '',
        ),
      ),
    ).toThrow(/MISSING_BILLING_REFERENCE/);
    expect(() =>
      assertValidDebitNoteXml(xml.replace('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>', '')),
    ).toThrow(/MISSING_REFERENCE_DOCUMENT_TYPE/);
    expect(() =>
      assertValidDebitNoteXml(
        xml.replace('<cbc:Description>Aumento en el valor</cbc:Description>', ''),
      ),
    ).toThrow(/MISSING_DISCREPANCY_DESCRIPTION/);
    expect(() =>
      assertValidDebitNoteXml(xml.replace('</DebitNote>', 'contingencia</DebitNote>')),
    ).toThrow(/CONTINGENCIA_FORBIDDEN/);
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
