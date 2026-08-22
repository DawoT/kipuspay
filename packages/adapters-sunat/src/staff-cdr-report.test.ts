/**
 * RED/GREEN: reporte staff de CDR sin secretos SOL.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatStaffSunatOutcome, sendBetaCpeXml } from './staff-cdr-report.js';
import { bytesToBase64 } from './sunat-bill-soap.js';
import { zipStore } from './zip-store.js';
import type { FetchLike } from './fiscal-transport.js';

const INVOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>F001-00000012</cbc:ID>
  <cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">20612913251</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingSupplierParty>
</Invoice>`;

function soapAccepted(): string {
  const cdr =
    `<?xml version="1.0"?><ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"` +
    ` xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"` +
    ` xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">` +
    `<cac:DocumentResponse><cac:Response>` +
    `<cbc:ResponseCode listAgencyName="PE:SUNAT">0</cbc:ResponseCode>` +
    `<cbc:Description>aceptada</cbc:Description>` +
    `</cac:Response></cac:DocumentResponse></ApplicationResponse>`;
  const zip = zipStore('R-20612913251-01-F001-00000012.xml', new TextEncoder().encode(cdr));
  return (
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><ns2:sendBillResponse xmlns:ns2="http://service.sunat.gob.pe">` +
    `<applicationResponse>${bytesToBase64(zip)}</applicationResponse>` +
    `</ns2:sendBillResponse></soap:Body></soap:Envelope>`
  );
}

describe('formatStaffSunatOutcome', () => {
  it('accepted: kind + cdrCode + description, sin password', () => {
    const report = formatStaffSunatOutcome({
      kind: 'accepted',
      cdr: {
        cdrCode: '0',
        cdrDescription: 'La Factura numero F001-00000012, ha sido aceptada',
        accepted: true,
      },
    });
    expect(report).toEqual({
      kind: 'accepted',
      cdrCode: '0',
      cdrDescription: 'La Factura numero F001-00000012, ha sido aceptada',
      accepted: true,
    });
    expect(JSON.stringify(report)).not.toMatch(/password|passwd|P12_PASS|SOL_/i);
  });

  it('rejected: kind + cdr sin secretos', () => {
    const report = formatStaffSunatOutcome({
      kind: 'rejected',
      cdr: { cdrCode: '2324', cdrDescription: 'comprobante duplicado', accepted: false },
    });
    expect(report).toEqual({
      kind: 'rejected',
      cdrCode: '2324',
      cdrDescription: 'comprobante duplicado',
      accepted: false,
    });
  });

  it('unreachable: solo kind', () => {
    expect(formatStaffSunatOutcome({ kind: 'unreachable' })).toEqual({ kind: 'unreachable' });
  });
});

describe('sendBetaCpeXml', () => {
  it('XML vacío no llama red', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = () => {
      calls += 1;
      return Promise.resolve(new Response('', { status: 500 }));
    };
    const report = await sendBetaCpeXml(
      '  ',
      { tenantId: 't', saleId: 's', documentType: '01' },
      { solUser: '20612913251TESTUSER', solPassword: 'sol-pass-fixture', fetchImpl },
    );
    expect(report).toEqual({ kind: 'unreachable' });
    expect(calls).toBe(0);
  });

  it('sendBill mock CDR 0 → reporte accepted sin secretos', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(new Response(soapAccepted(), { status: 200 }));
    const report = await sendBetaCpeXml(
      INVOICE_XML,
      { tenantId: 't', saleId: 'sale_staff_beta_f001_12', documentType: '01' },
      { solUser: '20612913251TESTUSER', solPassword: 'sol-pass-fixture', fetchImpl },
    );
    expect(report.kind).toBe('accepted');
    expect(report.cdrCode).toBe('0');
    expect(report.accepted).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/sol-pass-fixture/);
  });
});

describe('send-beta-cpe.mjs', () => {
  it('no embebe literales SOL ni pass CDT', () => {
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/staff/send-beta-cpe.mjs',
    );
    const src = readFileSync(root, 'utf8');
    expect(src).toContain('SUNAT_SOL_USER');
    expect(src).toContain('SUNAT_SOL_PASSWORD');
    expect(src).not.toMatch(/moddatos/i);
    expect(src).not.toMatch(/20612913251MODDATOS/);
  });
});
