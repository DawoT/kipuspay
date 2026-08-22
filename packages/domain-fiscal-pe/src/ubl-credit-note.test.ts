import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  assertValidCreditNoteXml,
  buildUblCreditNoteXml,
  type UblCreditNoteInput,
} from './ubl-credit-note.js';
import { assertWellFormedXml, hashUblXml } from './ubl-shared.js';

const sample = (): UblCreditNoteInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'FC01-00000001',
  issueDate: '2026-08-05',
  issueTime: '10:00:00',
  currency: 'PEN',
  issuerRuc: '20123456789',
  issuerName: 'KipusPay SAC',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  referencedDocId: 'F001-00000007',
  motiveCode: '01',
  totalTaxableCents: 1000,
  totalIgvCents: 180,
  totalIcbperCents: 0,
  totalAmountCents: 1180,
  lines: [
    {
      id: 1,
      description: 'Producto A&B',
      quantity: 1,
      unitCode: 'NIU',
      igvAffectationCode: '10',
      igvCents: 180,
      lineTotalCents: 1180,
      icbperCents: 0,
    },
  ],
});

describe('buildUblCreditNoteXml (Ops-3)', () => {
  it('genera XML CreditNote 2.1 válido con referencia al documento origen', async () => {
    const xml = buildUblCreditNoteXml(sample());
    expect(() => assertValidCreditNoteXml(xml)).not.toThrow();
    expect(xml).toContain('FC01-00000001');
    expect(xml).toContain('<cbc:ProfileID>0101</cbc:ProfileID>');
    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
    expect(xml).toContain('<cbc:Percent>18.00</cbc:Percent>');
    expect(xml).not.toContain('<cac:PaymentTerms>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(xml).toContain(
      '<cbc:CreditNoteTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Operacion">07</cbc:CreditNoteTypeCode>',
    );
    expect(xml).toContain('<cbc:ReferenceID>F001-00000007</cbc:ReferenceID>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description>Anulacion de la operacion</cbc:Description>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">11.80</cbc:PayableAmount>');
    expect(xml).not.toContain('>-');
    expect(xml).toContain('A&amp;B');
    const exo = buildUblCreditNoteXml({
      ...sample(),
      totalIgvCents: 0,
      totalAmountCents: 1000,
      lines: [
        { ...sample().lines[0]!, igvAffectationCode: '20', igvCents: 0, lineTotalCents: 1000 },
      ],
    });
    expect(exo).toContain('<cbc:Percent>0.00</cbc:Percent>');
    const hash = await hashUblXml(xml);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rechaza inputs inválidos (monto no positivo, referencia, motivo, RUC, líneas)', () => {
    expect(() => buildUblCreditNoteXml({ ...sample(), totalAmountCents: -1180 })).toThrow(
      /NC_TOTAL_MUST_BE_POSITIVE/,
    );
    expect(() => buildUblCreditNoteXml({ ...sample(), referencedDocId: 'NO ESPACIOS' })).toThrow(
      /INVALID_REFERENCED_DOC/,
    );
    expect(() => buildUblCreditNoteXml({ ...sample(), motiveCode: 'ABC' })).toThrow(
      /INVALID_MOTIVE_CODE/,
    );
    expect(() => buildUblCreditNoteXml({ ...sample(), lines: [] })).toThrow(/EMPTY_LINES/);
    expect(() => buildUblCreditNoteXml({ ...sample(), issuerRuc: '123' })).toThrow(
      /INVALID_ISSUER_RUC/,
    );
    expect(() => buildUblCreditNoteXml({ ...sample(), ublVersion: '2.0' as '2.1' })).toThrow(
      /UNSUPPORTED_UBL_VERSION/,
    );
  });

  it('assertValidCreditNoteXml detecta XML incompleto y malformado', () => {
    const xml = buildUblCreditNoteXml(sample());
    expect(() =>
      assertValidCreditNoteXml(
        xml.replace('>07</cbc:CreditNoteTypeCode>', '>99</cbc:CreditNoteTypeCode>'),
      ),
    ).toThrow(/INVALID_CREDIT_NOTE_TYPE/);
    expect(() =>
      assertValidCreditNoteXml(
        xml.replace(
          '<cac:DiscrepancyResponse>\n    <cbc:ReferenceID>F001-00000007</cbc:ReferenceID>\n    <cbc:ResponseCode>01</cbc:ResponseCode>\n    <cbc:Description>Anulacion de la operacion</cbc:Description>\n  </cac:DiscrepancyResponse>',
          '',
        ),
      ),
    ).toThrow(/MISSING_DISCREPANCY_RESPONSE/);
    expect(() =>
      assertValidCreditNoteXml(
        xml.replace(
          '<cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>F001-00000007</cbc:ID>\n      <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>\n    </cac:InvoiceDocumentReference>\n  </cac:BillingReference>',
          '',
        ),
      ),
    ).toThrow(/MISSING_BILLING_REFERENCE/);
    expect(() =>
      assertValidCreditNoteXml(xml.replace('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>', '')),
    ).toThrow(/MISSING_REFERENCE_DOCUMENT_TYPE/);
    expect(() =>
      assertValidCreditNoteXml(
        xml.replace('<cbc:Description>Anulacion de la operacion</cbc:Description>', ''),
      ),
    ).toThrow(/MISSING_DISCREPANCY_DESCRIPTION/);
    expect(() =>
      assertValidCreditNoteXml(xml.replace('</CreditNote>', 'contingencia</CreditNote>')),
    ).toThrow(/CONTINGENCIA_FORBIDDEN/);
    expect(() => assertValidCreditNoteXml('<CreditNote/>')).toThrow(/INVALID_UBL_VERSION/);
    const noLines = buildUblCreditNoteXml(sample()).slice(
      0,
      buildUblCreditNoteXml(sample()).lastIndexOf('<cac:CreditNoteLine>'),
    );
    expect(() => assertValidCreditNoteXml(noLines + '</CreditNote>')).toThrow(/MISSING_LINES/);
    expect(() =>
      assertValidCreditNoteXml(xml.replace('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>', '')),
    ).toThrow(/INVALID_UBL_VERSION/);
    expect(() =>
      assertValidCreditNoteXml(
        xml.replace('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>', '<cbc:UBLVersionID>2.1'),
      ),
    ).toThrow(/MALFORMED_XML/);
    expect(() => assertWellFormedXml('<CreditNote><a></a>')).toThrow(/MALFORMED_XML/);
  });
});
