/**
 * RED/GREEN: SOAP billService SUNAT beta (sendBill / sendSummary / CDR ZIP).
 */
import { describe, expect, it } from 'vitest';
import {
  assertTransportContract,
  createSunatBillTransport,
  createSunatRcCdrPort,
  SUNAT_BETA_BILL_SERVICE_URL,
} from './index.js';
import { unzipFirstFile, zipStore, zipStoreFiles } from './zip-store.js';
import { bytesToBase64, parseSunatSoapBody, zipUblXml } from './sunat-bill-soap.js';
import type { FetchLike } from './fiscal-transport.js';

function requestBody(init?: RequestInit): string {
  return typeof init?.body === 'string' ? init.body : '';
}

const SOL_USER = '20612913251TESTUSER';
const SOL_PASS = 'sol-pass-fixture';

const INVOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>F001-00000001</cbc:ID>
  <cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">20612913251</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingSupplierParty>
</Invoice>`;

function cdrAppXml(code: string, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>1</cbc:ID>
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ResponseCode listAgencyName="PE:SUNAT" listName="Codigo de error">${code}</cbc:ResponseCode>
      <cbc:Description languageLocaleID="es">${description}</cbc:Description>
    </cac:Response>
  </cac:DocumentResponse>
</ApplicationResponse>`;
}

function soapApplicationResponse(code: string, description: string): string {
  const zip = zipStore(
    'R-20612913251-01-F001-00000001.xml',
    new TextEncoder().encode(cdrAppXml(code, description)),
  );
  return (
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><ns2:sendBillResponse xmlns:ns2="http://service.sunat.gob.pe">` +
    `<applicationResponse>${bytesToBase64(zip)}</applicationResponse>` +
    `</ns2:sendBillResponse></soap:Body></soap:Envelope>`
  );
}

function soapTicket(ticket: string): string {
  return (
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><ns2:sendSummaryResponse xmlns:ns2="http://service.sunat.gob.pe">` +
    `<ticket>${ticket}</ticket></ns2:sendSummaryResponse></soap:Body></soap:Envelope>`
  );
}

function soapGetStatus(code: string, description: string, statusCode = '0'): string {
  const zip = zipStore(
    'R-20612913251-RC-20260821-001.xml',
    new TextEncoder().encode(cdrAppXml(code, description)),
  );
  return (
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><ns2:getStatusResponse xmlns:ns2="http://service.sunat.gob.pe">` +
    `<statusCode>${statusCode}</statusCode>` +
    `<content>${bytesToBase64(zip)}</content>` +
    `</ns2:getStatusResponse></soap:Body></soap:Envelope>`
  );
}

function soapFault(statusLine: string): string {
  return (
    `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><soap:Fault>` +
    `<faultcode>soap:Client</faultcode>` +
    `<faultstring>${statusLine}</faultstring>` +
    `</soap:Fault></soap:Body></soap:Envelope>`
  );
}

describe('zipStore', () => {
  it('roundtrip STORE recupera el XML', async () => {
    const xml = '<Invoice>ok</Invoice>';
    const zip = zipStore('20612913251-01-F001-00000001.xml', new TextEncoder().encode(xml));
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const file = await unzipFirstFile(zip);
    expect(file.name).toBe('20612913251-01-F001-00000001.xml');
    expect(new TextDecoder().decode(file.content)).toBe(xml);
  });
});

describe('createSunatBillTransport', () => {
  it('beta URL pública; producción e-factura no es el default', () => {
    expect(SUNAT_BETA_BILL_SERVICE_URL).toBe(
      'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    );
    expect(SUNAT_BETA_BILL_SERVICE_URL).not.toContain('e-factura.sunat.gob.pe');
  });

  it('sin credenciales SOL → fail-closed', () => {
    expect(() => createSunatBillTransport({ solUser: '', solPassword: SOL_PASS })).toThrow(
      'SUNAT_SOL_CREDENTIALS_MISSING',
    );
    expect(() => createSunatBillTransport({ solUser: SOL_USER, solPassword: '' })).toThrow(
      'SUNAT_SOL_CREDENTIALS_MISSING',
    );
  });

  it('XML vacío → unreachable (no llama a SUNAT)', async () => {
    let calls = 0;
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => {
        calls += 1;
        return Promise.resolve(new Response('nope', { status: 500 }));
      },
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: '  ',
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('unreachable');
    expect(calls).toBe(0);
  });

  it('sendBill: ZIP + UsernameToken; CDR 0 → accepted', async () => {
    const calls: { url: string; soapAction: string; body: string; contentType: string }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        soapAction: headers.get('SOAPAction') ?? '',
        contentType: headers.get('content-type') ?? '',
        body: requestBody(init),
      });
      return Promise.resolve(
        new Response(soapApplicationResponse('0', 'aceptada'), { status: 200 }),
      );
    };
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      endpointUrl: 'https://e-beta.example.test/billService',
      fetchImpl,
    });
    assertTransportContract(transport);
    expect(transport.mode).toBe('sunat_bill_beta');
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind === 'accepted') {
      expect(outcome.cdr.cdrCode).toBe('0');
      expect(outcome.cdr.accepted).toBe(true);
      expect(outcome.cdr.cdrDescription).not.toBe('cdr');
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://e-beta.example.test/billService');
    expect(calls[0]?.soapAction).toBe('urn:sendBill');
    expect(calls[0]?.contentType).toContain('text/xml');
    expect(calls[0]?.body).toContain('<ser:sendBill>');
    expect(calls[0]?.body).toContain(SOL_USER);
    expect(calls[0]?.body).toContain('20612913251-01-F001-00000001.zip');
    expect(calls[0]?.body).not.toContain('application/json');
    const parsed = parseSunatSoapBody(calls[0]!.body);
    expect(parsed.applicationResponseB64).toBeNull();
    const fileTag = /<fileName>([^<]+)<\/fileName>/.exec(calls[0]!.body)?.[1];
    const b64 = /<contentFile>([^<]+)<\/contentFile>/.exec(calls[0]!.body)?.[1];
    expect(fileTag).toBe('20612913251-01-F001-00000001.zip');
    const zip = zipUblXml('20612913251-01-F001-00000001', INVOICE_XML);
    expect(b64).toBe(bytesToBase64(zip));
    const inner = await unzipFirstFile(zip);
    expect(new TextDecoder().decode(inner.content)).toContain('F001-00000001');
  });

  it('CDR ZIP sin ResponseCode → rejected cdr_unparsed (no 99:cdr opaco)', async () => {
    const zip = zipStore('R-empty.xml', new TextEncoder().encode('<doc>sin codigo</doc>'));
    const soap =
      `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ns2:sendBillResponse xmlns:ns2="http://service.sunat.gob.pe">` +
      `<applicationResponse>${bytesToBase64(zip)}</applicationResponse>` +
      `</ns2:sendBillResponse></soap:Body></soap:Envelope>`;
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.resolve(new Response(soap, { status: 200 })),
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      expect(outcome.cdr.cdrDescription).toContain('cdr_unparsed');
      expect(outcome.cdr.cdrDescription).toContain('sin codigo');
    }
  });

  it('CDR ZIP con directorio vacío + XML → accepted (ResponseCode 0)', async () => {
    const xml = cdrAppXml('0', 'aceptada');
    const zip = zipStoreFiles([
      { name: 'R-doc/', content: new Uint8Array() },
      { name: 'R-doc.xml', content: new TextEncoder().encode(xml) },
    ]);
    const soap =
      `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ns2:sendBillResponse xmlns:ns2="http://service.sunat.gob.pe">` +
      `<applicationResponse>${bytesToBase64(zip)}</applicationResponse>` +
      `</ns2:sendBillResponse></soap:Body></soap:Envelope>`;
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.resolve(new Response(soap, { status: 200 })),
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind === 'accepted') {
      expect(outcome.cdr.cdrCode).toBe('0');
      expect(outcome.cdr.accepted).toBe(true);
    }
  });

  it('CDR ResponseCode 2324 → rejected (BUSINESS, no INFRA)', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () =>
        Promise.resolve(new Response(soapApplicationResponse('2324', 'rechazo'), { status: 200 })),
    });
    const dto = {
      tenantId: 't',
      saleId: 's',
      documentType: '01' as const,
      series: 'F001',
      number: 1,
      issuerRuc: '20612913251',
      totalCents: 118,
      xml: INVOICE_XML,
      xmlHash: 'h',
      mustSubmitByIso: '2026-08-24T00:00:00.000Z',
    };
    const res = await transport.submitInvoice!(dto);
    expect(res.outcome.kind).toBe('rejected');
    expect(res.errorClass).toBe('BUSINESS');
  });

  it('HTTP 503 sin SOAP → unreachable (INFRA)', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.resolve(new Response('gateway', { status: 503 })),
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('unreachable');
    const dto = {
      tenantId: 't',
      saleId: 's',
      documentType: '01' as const,
      series: 'F001',
      number: 1,
      issuerRuc: '20612913251',
      totalCents: 118,
      xml: INVOICE_XML,
      xmlHash: 'h',
      mustSubmitByIso: '2026-08-24T00:00:00.000Z',
    };
    expect((await transport.submitInvoice!(dto)).errorClass).toBe('INFRA');
  });

  it('SOAP Fault Client.2335 no toma dígitos de entidades HTML', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            `<?xml version="1.0"?><soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">` +
              `<soap-env:Body><soap-env:Fault>` +
              `<faultcode>soap-env:Client.2335</faultcode>` +
              `<faultstring>El documento electr&#243;nico ingresado ha sido alterado</faultstring>` +
              `</soap-env:Fault></soap-env:Body></soap-env:Envelope>`,
            { status: 500 },
          ),
        ),
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.cdr.cdrCode).toBe('2335');
  });

  it('SOAP Fault 1033 en HTTP 500 → rejected (negocio, no breaker)', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () =>
        Promise.resolve(
          new Response(soapFault('1033 - El comprobante ya fue informado'), { status: 500 }),
        ),
    });
    const outcome = await transport.submit({
      tenantId: 't',
      saleId: 's',
      xml: INVOICE_XML,
      xmlHash: 'h',
      documentType: '07',
    });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      expect(outcome.cdr.cdrCode).toBe('1033');
      expect(outcome.cdr.accepted).toBe(false);
    }
  });

  it('boleta 03 → sendSummary, nunca sendBill', async () => {
    const actions: string[] = [];
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: (_url, init) => {
        const headers = new Headers(init?.headers);
        actions.push(headers.get('SOAPAction') ?? '');
        expect(requestBody(init)).toContain('<ser:sendSummary>');
        expect(requestBody(init)).not.toContain('<ser:sendBill>');
        return Promise.resolve(new Response(soapTicket('ticket-rc-1'), { status: 200 }));
      },
    });
    await transport.submit({
      tenantId: 't',
      saleId: 'sum-1',
      xml: '<DailySummary date="2026-08-21" tickets="1"/>',
      xmlHash: 'h',
      documentType: '03',
    });
    expect(actions[0]).toBe('urn:sendSummary');
    expect(actions[1]).toBe('urn:getStatus');
  });

  it('network error → unreachable', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.reject(new Error('ECONNRESET')),
    });
    expect(
      (
        await transport.submit({
          tenantId: 't',
          saleId: 's',
          xml: INVOICE_XML,
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');
  });

  it('submitInvoice CDR 0 → OK', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () =>
        Promise.resolve(new Response(soapApplicationResponse('0', 'ok'), { status: 200 })),
    });
    const res = await transport.submitInvoice!({
      tenantId: 't',
      saleId: 's',
      documentType: '01',
      series: 'F001',
      number: 1,
      issuerRuc: '20612913251',
      totalCents: 118,
      xml: INVOICE_XML,
      xmlHash: 'h',
      mustSubmitByIso: '2026-08-24T00:00:00.000Z',
    });
    expect(res.outcome.kind).toBe('accepted');
    expect(res.errorClass).toBe('OK');
  });

  it('HTTP 400 SOAP → rejected', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.resolve(new Response('bad request', { status: 400 })),
    });
    expect(
      (
        await transport.submit({
          tenantId: 't',
          saleId: 's',
          xml: INVOICE_XML,
          xmlHash: 'h',
          documentType: '08',
        })
      ).kind,
    ).toBe('rejected');
  });

  it('queryCdr getStatus CDR 0 → accepted', async () => {
    const transport = createSunatBillTransport({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () =>
        Promise.resolve(new Response(soapGetStatus('0', 'ok', '0'), { status: 200 })),
    });
    const cdr = await transport.queryCdr('ticket-1');
    expect(cdr.accepted).toBe(true);
    expect(cdr.cdrCode).toBe('0');
  });
});

describe('createSunatRcCdrPort', () => {
  it('sendSummary + ticket + getStatus CDR → accepted', async () => {
    let n = 0;
    const port = createSunatRcCdrPort({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => {
        n += 1;
        if (n === 1) return Promise.resolve(new Response(soapTicket('T-99'), { status: 200 }));
        return Promise.resolve(new Response(soapGetStatus('0', 'RC aceptado'), { status: 200 }));
      },
    });
    const cdr = await port.submit({
      tenantId: 't',
      summaryId: 'sum-1',
      xml: '<DailySummary date="2026-08-21" tickets="2"/>',
    });
    expect(cdr.accepted).toBe(true);
    expect(cdr.cdrCode).toBe('0');
    expect(n).toBe(2);
  });

  it('XML vacío → no afirma aceptación', async () => {
    let calls = 0;
    const port = createSunatRcCdrPort({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => {
        calls += 1;
        return Promise.resolve(new Response('x', { status: 200 }));
      },
    });
    const cdr = await port.submit({ tenantId: 't', summaryId: 's', xml: '  ' });
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrCode).toBe('99');
    expect(calls).toBe(0);
  });

  it('5xx sin fault → no afirma aceptación', async () => {
    const port = createSunatRcCdrPort({
      solUser: SOL_USER,
      solPassword: SOL_PASS,
      fetchImpl: () => Promise.resolve(new Response('', { status: 502 })),
    });
    const cdr = await port.submit({
      tenantId: 't',
      summaryId: 'sum-1',
      xml: '<DailySummary date="2026-08-21" tickets="1"/>',
    });
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrMessage).toBe('SUNAT unreachable');
  });
});
