import { describe, expect, it } from 'vitest';
import { SUNAT_BETA_BILL_SERVICE_URL } from '@kipuspay/adapters-sunat';
import {
  hasSunatSolCredentials,
  isAccreditedPseEndpoint,
  selectFiscalTransport,
} from './select-transport.js';

describe('selectFiscalTransport TENANT_CERT / SOAP', () => {
  it('sin password SOL no elige billService', () => {
    expect(
      hasSunatSolCredentials({
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        SUNAT_SOL_USER: '20612913251TESTUSER',
      }),
    ).toBe(false);
    expect(
      selectFiscalTransport({
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        SUNAT_SOL_USER: '20612913251TESTUSER',
        FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
      }).mode,
    ).toBe('KIPUSPAY_PSE_DIRECT');
  });

  it('SOL sin override → e-beta público, no e-factura', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      FISCAL_PSE_FETCH: (url) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        return Promise.resolve(new Response('', { status: 503 }));
      },
    });
    expect(t.mode).toBe('sunat_bill_beta');
    const xml =
      '<Invoice><cbc:ID>F001-00000001</cbc:ID>' +
      '<cac:AccountingSupplierParty><cbc:ID>' +
      '20' +
      '612913251' +
      '</cbc:ID></cac:AccountingSupplierParty></Invoice>';
    await t.submit({
      tenantId: 't',
      saleId: 's',
      xml,
      xmlHash: 'h',
      documentType: '01',
    });
    expect(urls).toEqual([SUNAT_BETA_BILL_SERVICE_URL]);
    expect(SUNAT_BETA_BILL_SERVICE_URL).not.toContain('e-factura');
  });

  it('override SUNAT_BILL_ENDPOINT_URL es opt-in T6; el default del repo no es e-factura', async () => {
    const urls: string[] = [];
    const prod = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      SUNAT_BILL_ENDPOINT_URL: prod,
      FISCAL_PSE_FETCH: (url) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        return Promise.resolve(new Response('', { status: 503 }));
      },
    });
    expect(t.mode).toBe('sunat_bill_beta');
    await t.submit({
      tenantId: 't',
      saleId: 's',
      xml:
        '<Invoice><cbc:ID>F001-00000099</cbc:ID>' +
        '<cac:AccountingSupplierParty><cbc:ID>20612913251</cbc:ID>' +
        '</cac:AccountingSupplierParty></Invoice>',
      xmlHash: 'h',
      documentType: '01',
    });
    expect(urls).toEqual([prod]);
    expect(SUNAT_BETA_BILL_SERVICE_URL).not.toContain('e-factura.sunat.gob.pe');
  });

  it('tenant KIPUSPAY_PSE sin SOL usa HTTP, no SOAP', () => {
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/fiscal',
    });
    expect(t.mode).toBe('KIPUSPAY_PSE_DIRECT');
  });

  it('SOL del piloto gana sobre URL PSE (no mezclar Rosa Negra con HTTP)', () => {
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/fiscal',
    });
    expect(t.mode).toBe('sunat_bill_beta');
  });

  it('.invalid no es endpoint PSE acreditado; HTTPS de OSE sí', () => {
    expect(isAccreditedPseEndpoint(undefined)).toBe(false);
    expect(isAccreditedPseEndpoint('https://pse.kipuspay.staging.invalid/fiscal')).toBe(false);
    expect(isAccreditedPseEndpoint('http://pse.example.com/fiscal')).toBe(false);
    expect(isAccreditedPseEndpoint('https://ose.example.com/v1/submit')).toBe(true);
  });
});
