/* eslint-disable no-secrets/no-secrets -- fixtures XML CPE de prueba */
import { describe, expect, it } from 'vitest';
import {
  SUNAT_BETA_BILL_SERVICE_URL,
  SUNAT_PRODUCTION_BILL_SERVICE_URL,
  SunatChannelError,
} from '@kipuspay/adapters-sunat';
import {
  hasSunatSolCredentials,
  isAccreditedPseEndpoint,
  isTenantSolRoutingTransport,
  selectFiscalTransport,
  TenantSolChannelError,
  type TenantSolCredentialsLoader,
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

  it('plugins on sin SOL ni endpoint → MISCONFIGURED, submit never ACCEPTED', async () => {
    const t = selectFiscalTransport({ FEATURE_FISCAL_TRANSPORT_PLUGINS: '1' });
    expect(t.mode).toBe('MISCONFIGURED');
    expect(
      (
        await t.submit({
          tenantId: 't',
          saleId: 's',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');
  });

  it('HTTP contra .invalid no afirma ACCEPTED (fetch falla)', async () => {
    const endpoint = 'https://pse.kipuspay.staging.invalid/fiscal';
    const t = selectFiscalTransport({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: endpoint,
      FISCAL_PSE_FETCH: () => Promise.reject(new Error('ENOTFOUND')),
    });
    expect(isAccreditedPseEndpoint(endpoint)).toBe(false);
    expect(t.mode).toBe('KIPUSPAY_PSE_DIRECT');
    expect(
      (
        await t.submit({
          tenantId: 't',
          saleId: 's',
          xml: '<Invoice/>',
          xmlHash: 'h',
          documentType: '01',
        })
      ).kind,
    ).toBe('unreachable');
  });
});

describe('selectFiscalTransport canal dual producción (FL-2)', () => {
  const SOL = {
    FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
    SUNAT_SOL_USER: '20612913251TESTUSER',
    SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
  } as const;

  function captureFetch(urls: string[]) {
    return (url: unknown) => {
      urls.push(typeof url === 'string' ? url : 'bill');
      return Promise.resolve(new Response('', { status: 503 }));
    };
  }

  async function submitProbe(t: ReturnType<typeof selectFiscalTransport>): Promise<void> {
    await t.submit({
      tenantId: 't',
      saleId: 's',
      xml:
        '<Invoice><cbc:ID>F001-00000042</cbc:ID>' +
        '<cac:AccountingSupplierParty><cbc:ID>20612913251</cbc:ID>' +
        '</cac:AccountingSupplierParty></Invoice>',
      xmlHash: 'h',
      documentType: '01',
    });
  }

  it('staging explícito mantiene default e-beta', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport({
      ...SOL,
      SUNAT_BILL_CHANNEL: 'staging',
      FISCAL_PSE_FETCH: captureFetch(urls),
    });
    expect(t.mode).toBe('sunat_bill_beta');
    await submitProbe(t);
    expect(urls).toEqual([SUNAT_BETA_BILL_SERVICE_URL]);
  });

  it('producción sin override → URL oficial y modo sunat_bill_production', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport({
      ...SOL,
      SUNAT_BILL_CHANNEL: 'production',
      FISCAL_PSE_FETCH: captureFetch(urls),
    });
    expect(t.mode).toBe('sunat_bill_production');
    await submitProbe(t);
    expect(urls).toEqual([SUNAT_PRODUCTION_BILL_SERVICE_URL]);
  });

  it('producción con la URL oficial explícita → POST a la oficial', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport({
      ...SOL,
      SUNAT_BILL_CHANNEL: 'production',
      SUNAT_BILL_ENDPOINT_URL: SUNAT_PRODUCTION_BILL_SERVICE_URL,
      FISCAL_PSE_FETCH: captureFetch(urls),
    });
    await submitProbe(t);
    expect(urls).toEqual([SUNAT_PRODUCTION_BILL_SERVICE_URL]);
  });

  it.each([
    'https://pse.kipuspay.staging.invalid/billService',
    'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    'https://example.com/billService',
  ])('producción con URL no oficial (%s) → error tipado antes de cualquier fetch', (bad) => {
    const urls: string[] = [];
    expect(() =>
      selectFiscalTransport({
        ...SOL,
        SUNAT_BILL_CHANNEL: 'production',
        SUNAT_BILL_ENDPOINT_URL: bad,
        FISCAL_PSE_FETCH: captureFetch(urls),
      }),
    ).toThrowError(SunatChannelError);
    try {
      selectFiscalTransport({
        ...SOL,
        SUNAT_BILL_CHANNEL: 'production',
        SUNAT_BILL_ENDPOINT_URL: bad,
      });
    } catch (err) {
      expect((err as SunatChannelError).code).toBe('SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN');
    }
    expect(urls).toEqual([]);
  });

  it('producción sin SOL → error tipado aunque haya endpoint PSE (sin fallback)', () => {
    try {
      selectFiscalTransport({
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        SUNAT_BILL_CHANNEL: 'production',
        SUNAT_SOL_USER: '20612913251TESTUSER',
        FISCAL_PSE_ENDPOINT_URL: 'https://pse.acreditado.example/v1/submit',
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_PRODUCTION_SOL_MISSING');
    }
  });

  it('producción con plugins off → error tipado, nunca mock ACCEPTED', () => {
    try {
      selectFiscalTransport({ SUNAT_BILL_CHANNEL: 'production' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_PRODUCTION_PLUGINS_OFF');
    }
  });

  it('valor de canal inválido → SUNAT_CHANNEL_INVALID', () => {
    try {
      selectFiscalTransport({ ...SOL, SUNAT_BILL_CHANNEL: 'prod' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_CHANNEL_INVALID');
    }
  });
});

describe('selectFiscalTransport routing SOL por tenant (emisión directa por negocio)', () => {
  const TENANT_SOL_USER = '20512345678MODDATOS';
  const TENANT_SOL_PASSWORD = 'sol-pass-tenant';

  function loaderOf(
    map: Map<string, { user: string; password: string } | 'CORRUPT'>,
  ): TenantSolCredentialsLoader & { calls: string[] } {
    const calls: string[] = [];
    return Object.assign(
      (tenantId: string) => {
        calls.push(tenantId);
        const entry = map.get(tenantId);
        if (entry === 'CORRUPT') {
          return Promise.reject(new Error('TENANT_CERT_UNWRAP_FAILED'));
        }
        return Promise.resolve(entry ?? null);
      },
      { calls },
    );
  }

  function captureFetch(urls: string[], bodies: string[] = []) {
    return (url: unknown, init?: { body?: unknown }) => {
      urls.push(typeof url === 'string' ? url : 'bill');
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve(new Response('', { status: 503 }));
    };
  }

  const XML =
    '<Invoice><cbc:ID>F001-00000042</cbc:ID>' +
    '<cac:AccountingSupplierParty><cbc:ID>20512345678</cbc:ID>' +
    '</cac:AccountingSupplierParty></Invoice>';

  async function submitAs(t: ReturnType<typeof selectFiscalTransport>, tenantId: string) {
    return t.submit({
      tenantId,
      saleId: 's',
      xml: XML,
      xmlHash: 'h',
      documentType: '01',
    });
  }

  it('staging: tenant con SOL propia → SOAP billService beta con SUS credenciales', async () => {
    const urls: string[] = [];
    const bodies: string[] = [];
    const loader = loaderOf(
      new Map([['tenant_a', { user: TENANT_SOL_USER, password: TENANT_SOL_PASSWORD }]]),
    );
    const t = selectFiscalTransport(
      {
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
        FISCAL_PSE_FETCH: captureFetch(urls, bodies),
      },
      { loadTenantSol: loader },
    );
    expect(isTenantSolRoutingTransport(t)).toBe(true);
    await submitAs(t, 'tenant_a');
    expect(urls).toEqual([SUNAT_BETA_BILL_SERVICE_URL]);
    // El SOAP lleva el solUser DEL TENANT, no hay ninguno en env.
    expect(bodies[0]).toContain(TENANT_SOL_USER);
  });

  it('staging: tenant sin fila → fallback al env (PSE HTTP), comportamiento actual intacto', async () => {
    const urls: string[] = [];
    const pse = 'https://pse.kipuspay.test/submit';
    const t = selectFiscalTransport(
      {
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        FISCAL_PSE_ENDPOINT_URL: pse,
        FISCAL_PSE_FETCH: captureFetch(urls),
      },
      { loadTenantSol: loaderOf(new Map()) },
    );
    await submitAs(t, 'tenant_sin_sol');
    expect(urls).toEqual([pse]);
  });

  it('staging: sin fila y sin endpoint → MISCONFIGURED (igual que hoy)', async () => {
    const t = selectFiscalTransport(
      { FEATURE_FISCAL_TRANSPORT_PLUGINS: '1' },
      { loadTenantSol: loaderOf(new Map()) },
    );
    expect((await resolveMode(t, 't')).mode).toBe('MISCONFIGURED');
  });

  it('staging: credencial corrupta → TenantSolChannelError, NUNCA fallback a env de otro emisor', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport(
      {
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
        FISCAL_PSE_FETCH: captureFetch(urls),
      },
      { loadTenantSol: loaderOf(new Map([['tenant_bad', 'CORRUPT']])) },
    );
    await expect(submitAs(t, 'tenant_bad')).rejects.toBeInstanceOf(TenantSolChannelError);
    expect(urls).toEqual([]);
  });

  it('producción: tenant con SOL propia → billService oficial con SUS credenciales', async () => {
    const urls: string[] = [];
    const bodies: string[] = [];
    const loader = loaderOf(
      new Map([['tenant_prod', { user: TENANT_SOL_USER, password: TENANT_SOL_PASSWORD }]]),
    );
    const t = selectFiscalTransport(
      {
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        SUNAT_BILL_CHANNEL: 'production',
        FISCAL_PSE_FETCH: captureFetch(urls, bodies),
      },
      { loadTenantSol: loader },
    );
    await submitAs(t, 'tenant_prod');
    expect(urls).toEqual([SUNAT_PRODUCTION_BILL_SERVICE_URL]);
    expect(bodies[0]).toContain(TENANT_SOL_USER);
  });

  it('producción: tenant sin fila → SunatChannelError SOL_MISSING en submit (fail-closed lazy)', async () => {
    const t = selectFiscalTransport(
      { FEATURE_FISCAL_TRANSPORT_PLUGINS: '1', SUNAT_BILL_CHANNEL: 'production' },
      { loadTenantSol: loaderOf(new Map()) },
    );
    await expect(submitAs(t, 'tenant_sin_sol')).rejects.toMatchObject({
      code: 'SUNAT_PRODUCTION_SOL_MISSING',
    });
  });

  it('producción: credencial corrupta → TenantSolChannelError (no SOL_MISSING que mentiría)', async () => {
    const t = selectFiscalTransport(
      { FEATURE_FISCAL_TRANSPORT_PLUGINS: '1', SUNAT_BILL_CHANNEL: 'production' },
      { loadTenantSol: loaderOf(new Map([['tenant_bad', 'CORRUPT']])) },
    );
    await expect(submitAs(t, 'tenant_bad')).rejects.toBeInstanceOf(TenantSolChannelError);
  });

  it('producción sin SOL ni loader → error inmediato (backward compat)', () => {
    try {
      selectFiscalTransport({
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        SUNAT_BILL_CHANNEL: 'production',
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SunatChannelError);
      expect((err as SunatChannelError).code).toBe('SUNAT_PRODUCTION_SOL_MISSING');
    }
  });

  it('plugins off → MOCK_STAGING puro aunque haya credenciales por tenant (kill-switch global)', async () => {
    const urls: string[] = [];
    const t = selectFiscalTransport(
      { FISCAL_PSE_FETCH: captureFetch(urls) },
      {
        loadTenantSol: loaderOf(
          new Map([['tenant_a', { user: TENANT_SOL_USER, password: TENANT_SOL_PASSWORD }]]),
        ),
      },
    );
    expect(t.mode).toBe('MOCK_STAGING');
    const outcome = await submitAs(t, 'tenant_a');
    expect(outcome.kind).toBe('accepted');
    expect(urls).toEqual([]);
  });

  it('el loader se llama UNA vez por tenant aunque el drain envíe varias filas (caché)', async () => {
    const urls: string[] = [];
    const loader = loaderOf(
      new Map([['tenant_a', { user: TENANT_SOL_USER, password: TENANT_SOL_PASSWORD }]]),
    );
    const t = selectFiscalTransport(
      {
        FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
        FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.test/submit',
        FISCAL_PSE_FETCH: captureFetch(urls),
      },
      { loadTenantSol: loader },
    );
    await submitAs(t, 'tenant_a');
    await submitAs(t, 'tenant_a');
    expect(loader.calls).toEqual(['tenant_a']);
  });

  /** El drain resuelve transport POR FILA vía resolveForTenant. */
  async function resolveMode(
    t: ReturnType<typeof selectFiscalTransport>,
    tenantId: string,
  ): Promise<{ mode: string }> {
    if (!isTenantSolRoutingTransport(t)) return { mode: t.mode };
    return t.resolveForTenant(tenantId);
  }
});
