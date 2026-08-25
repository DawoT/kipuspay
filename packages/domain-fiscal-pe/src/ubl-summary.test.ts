import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import { signCpeXml, verifyCpeXmlSignature } from './xades-bes.js';
import { issueSelfSignedX509 } from './x509-der.js';
import {
  assertValidSummaryDocumentsXml,
  buildUblSummaryDocumentsXml,
  nextRcCorrelative,
  rcSummaryId,
} from './ubl-summary.js';

const RSA_GEN = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
} as const;

function summary() {
  return {
    id: rcSummaryId('2026-08-21', 1),
    referenceDate: '2026-08-21',
    issueDate: '2026-08-21',
    issuerRuc: '20612913251',
    issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
    lines: [
      {
        lineId: 1,
        documentType: '03' as const,
        documentId: 'B001-00000001',
        customerDocType: '6',
        customerDocNumber: '10715001701',
        conditionCode: '1' as const,
        totalTaxableCents: 100,
        totalIgvCents: 18,
        totalAmountCents: 118,
      },
    ],
  };
}

describe('UBL SummaryDocuments RC', () => {
  it('id RC-YYYYMMDD-NNN y XML válido para sendSummary', () => {
    expect(rcSummaryId('2026-08-21', 1)).toBe('RC-20260821-001');
    expect(() => rcSummaryId('21-08-2026')).toThrow(/RC_DATE_INVALID/);
    expect(() => rcSummaryId('2026-08-21', 0)).toThrow(/RC_CORRELATIVE_INVALID/);
    expect(nextRcCorrelative('2026-08-21', ['RC-20260821-002'], 1)).toBe(3);
    expect(nextRcCorrelative('2026-08-21', ['RC-deadbeef'], 1)).toBe(2);
    expect(nextRcCorrelative('2026-08-21', ['RC-20260821-zz'], 0)).toBe(1);
    expect(() => nextRcCorrelative('21-08-2026', [])).toThrow(/RC_DATE_INVALID/);
    const xml = buildUblSummaryDocumentsXml(summary());
    expect(() => assertValidSummaryDocumentsXml(xml)).not.toThrow();
    expect(xml).toContain('<cbc:ID>RC-20260821-001</cbc:ID>');
    expect(xml).toContain('<cbc:ID>B001-00000001</cbc:ID>');
    expect(xml).toContain('10715001701');
    expect(xml).toContain(
      '<cbc:CustomerAssignedAccountID>10715001701</cbc:CustomerAssignedAccountID>',
    );
    expect(xml).toContain(
      '<cbc:CustomerAssignedAccountID>20612913251</cbc:CustomerAssignedAccountID>',
    );
    expect(xml).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');
    expect(xml.toLowerCase()).not.toContain('contingencia');
  });

  it('rechaza RUC/id/líneas inválidos y contingencia', () => {
    expect(() => buildUblSummaryDocumentsXml({ ...summary(), issuerRuc: '123' })).toThrow(
      /INVALID_ISSUER_RUC/,
    );
    expect(() => buildUblSummaryDocumentsXml({ ...summary(), id: 'RC-1' })).toThrow(
      /INVALID_RC_ID/,
    );
    expect(() => buildUblSummaryDocumentsXml({ ...summary(), lines: [] })).toThrow(/RC_NO_BOLETAS/);
    expect(() => buildUblSummaryDocumentsXml({ ...summary(), referenceDate: 'nope' })).toThrow(
      /RC_DATE_INVALID/,
    );
    expect(() => buildUblSummaryDocumentsXml({ ...summary(), issueDate: 'nope' })).toThrow(
      /RC_DATE_INVALID/,
    );
    expect(() =>
      assertValidSummaryDocumentsXml(
        '<SummaryDocuments><cbc:UBLVersionID>2.0</cbc:UBLVersionID><sac:SummaryDocumentsLine></sac:SummaryDocumentsLine></SummaryDocuments>',
      ),
    ).toThrow(/MISSING_ISSUER_ACCOUNT_ID/);
    expect(() =>
      assertValidSummaryDocumentsXml(
        '<SummaryDocuments><cbc:UBLVersionID>2.0</cbc:UBLVersionID></SummaryDocuments>',
      ),
    ).toThrow(/RC_NO_BOLETAS/);
    const withContingencia = buildUblSummaryDocumentsXml(summary()).replace('IGV', 'contingencia');
    expect(() => assertValidSummaryDocumentsXml(withContingencia)).toThrow(
      /CONTINGENCIA_FORBIDDEN/,
    );
    expect(() => assertValidSummaryDocumentsXml('<Invoice/>')).toThrow(/MISSING_SUMMARY_ROOT/);
    expect(() =>
      assertValidSummaryDocumentsXml(buildUblSummaryDocumentsXml(summary()).replace('2.0', '2.1')),
    ).toThrow(/INVALID_UBL_VERSION/);
  });

  it('línea RC con gravado 0 no emite negativo', () => {
    const xml = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [{ ...summary().lines[0]!, totalTaxableCents: -10, totalIgvCents: 0 }],
    });
    expect(xml).toContain('<cbc:PaidAmount currencyID="PEN">0.00</cbc:PaidAmount>');
  });

  it('H1 E2E: boleta a DNI tipo doc 1 con schemeID=1', () => {
    const xml = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [{ ...summary().lines[0]!, customerDocType: '1' }],
    });
    expect(xml).toContain('<cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>');
    expect(xml).toContain('<cbc:ID schemeID="1">10715001701</cbc:ID>');
  });

  it('H1 E2E: línea ND (08) — BillingReference opt-in (e-beta 0306: schema restringido lo rechaza tras cbc:ID)', () => {
    // Default OFF: forma validada por e-beta (RC-20260824-001 CDR 0 sin BR;
    // RC-20260825-002 con BR tras ID → CDR 0306 cvc-particle). El XSD oficial
    // SUNAT sí lo ubica tras cbc:ID — canal producción usa billingReference:true.
    const xmlDefault = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [
        {
          lineId: 1,
          documentType: '08' as const,
          documentId: 'B001-00000001',
          customerDocType: '1',
          customerDocNumber: '10715001701',
          conditionCode: '1' as const,
          totalTaxableCents: 10,
          totalIgvCents: 0,
          totalAmountCents: 10,
          referencedDocId: 'B001-00000006',
          referencedDocTypeCode: '03' as const,
        },
      ],
    });
    expect(xmlDefault).not.toContain('<cac:BillingReference>');
    const xmlOn = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [
        {
          lineId: 1,
          documentType: '08' as const,
          documentId: 'B001-00000001',
          customerDocType: '1',
          customerDocNumber: '10715001701',
          conditionCode: '1' as const,
          totalTaxableCents: 10,
          totalIgvCents: 0,
          totalAmountCents: 10,
          referencedDocId: 'B001-00000006',
          referencedDocTypeCode: '03' as const,
          billingReference: true,
        },
      ],
    });
    const refIdx = xmlOn.indexOf('<cac:BillingReference>');
    const idIdx = xmlOn.indexOf('<cbc:ID>B001-00000001</cbc:ID>');
    const partyIdx = xmlOn.indexOf('<cac:AccountingCustomerParty>');
    expect(refIdx).toBeGreaterThan(idIdx);
    expect(partyIdx).toBeGreaterThan(refIdx);
    expect(xmlOn).toContain(
      '<cac:InvoiceDocumentReference><cbc:ID>B001-00000006</cbc:ID>' +
        '<cbc:DocumentTypeCode>03</cbc:DocumentTypeCode></cac:InvoiceDocumentReference>',
    );
  });

  it('boleta sin referencia no emite BillingReference', () => {
    const xml = buildUblSummaryDocumentsXml(summary());
    expect(xml).not.toContain('<cac:BillingReference>');
  });

  it('exonerada (afectación 20) emite tributo 9997 EXO, jamás IGV 1000 en 0.00', () => {
    // Capacidad del builder (catálogo 05/07). Límite de canal: e-beta RC exige
    // tributo IGV informado (CDR 2278 con EXO puro) — ver hallazgo H1-E2E.
    const xml = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [
        {
          ...summary().lines[0]!,
          totalTaxableCents: 1,
          totalIgvCents: 0,
          totalAmountCents: 1,
          igvAffectationCode: '20' as const,
        },
      ],
    });
    expect(xml).toContain('<cbc:ID>9997</cbc:ID>');
    expect(xml).toContain('<cbc:Name>EXO</cbc:Name>');
    expect(xml).not.toContain('<cbc:ID>1000</cbc:ID>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>');
  });

  it('inafecta (afectación 30) emite tributo 9998 INA', () => {
    const xml = buildUblSummaryDocumentsXml({
      ...summary(),
      lines: [
        {
          ...summary().lines[0]!,
          igvAffectationCode: '30' as const,
          totalIgvCents: 0,
        },
      ],
    });
    expect(xml).toContain('<cbc:ID>9998</cbc:ID>');
    expect(xml).toContain('<cbc:Name>INA</cbc:Name>');
  });

  it('XAdES-BES verificable sobre el RC', async () => {
    const pair = await crypto.subtle.generateKey(RSA_GEN, true, ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const certDer = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'RC Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
    });
    const signed = await signCpeXml(buildUblSummaryDocumentsXml(summary()), {
      privateKeyPkcs8Der: pkcs8,
      certDer,
      signingTime: '2026-08-21T12:00:00.000Z',
    });
    expect(signed).toContain('xmlns:sac=');
    expect(await verifyCpeXmlSignature(signed, pair.publicKey)).toBe(true);
  });
});
