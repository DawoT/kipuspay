import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { buildCpePortalUrl, mintPortalToken } from '@kipuspay/domain-fiscal-pe';
import {
  isCpePortalEnabled,
  isFiscalRcEnabled,
  buildRcCdrPort,
  runCpeLinkHttp,
  runCpePortalHttp,
  runFiscalCronHttp,
  runRcPendingBannerHttp,
  runVoidBoletaHttp,
} from './fiscal-rc-routes.js';
import * as AdaptersD1 from '@kipuspay/adapters-d1';

vi.mock('@kipuspay/adapters-d1', async (importOriginal) => ({
  ...(await importOriginal<typeof AdaptersD1>()),
  voidBoletaAtomic: vi.fn(),
  buildDailySummary: vi.fn(),
  processFiscalDeadlines: vi.fn(),
}));

describe('fiscal-rc routes flags', () => {
  it('FEATURE_FISCAL_RC default off; FEATURE_CPE_PORTAL default ON (H4, opt-out con 0)', () => {
    expect(isFiscalRcEnabled({} as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '0' } as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '1' } as WorkerEnv)).toBe(true);
    expect(isCpePortalEnabled({} as WorkerEnv)).toBe(true);
    expect(isCpePortalEnabled({ FEATURE_CPE_PORTAL: '0' } as WorkerEnv)).toBe(false);
    expect(isCpePortalEnabled({ FEATURE_CPE_PORTAL: '1' } as WorkerEnv)).toBe(true);
  });

  it('SOL + plugins → sendSummary SOAP, no PSE .invalid', async () => {
    const urls: string[] = [];
    const bodies: string[] = [];
    const port = buildRcCdrPort({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.staging.invalid/fiscal',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      SUNAT_BILL_ENDPOINT_URL: 'https://e-beta.example.test/billService',
      FISCAL_PSE_FETCH: (url, init) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        bodies.push(typeof init?.body === 'string' ? init.body : '');
        return Promise.resolve(new Response('gateway', { status: 503 }));
      },
    } as WorkerEnv);
    const cdr = await port.submit({
      tenantId: 't1',
      summaryId: 'sum-1',
      xml: '<DailySummary date="2026-08-21" tickets="1"/>',
    });
    expect(cdr.accepted).toBe(false);
    expect(urls).toEqual(['https://e-beta.example.test/billService']);
    expect(bodies[0]).toContain('<ser:sendSummary>');
    expect(urls[0]).not.toContain('pse.kipuspay.staging.invalid');
  });

  it('sin SOL local usa FISCAL.submitRc (no PSE .invalid)', async () => {
    const submitRc = vi.fn().mockResolvedValue({
      accepted: true,
      cdrCode: '0',
      cdrMessage: 'rpc',
    });
    const port = buildRcCdrPort({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.staging.invalid/fiscal',
      FISCAL: {
        drain: () => Promise.resolve({}),
        produceMissing: () => Promise.resolve({}),
        submitRc,
      },
    } as WorkerEnv);
    const cdr = await port.submit({
      tenantId: 'tenant_stg_rosa_negra_001',
      summaryId: 'RC-20260821-003',
      xml: '<SummaryDocuments/>',
    });
    expect(cdr).toEqual({ accepted: true, cdrCode: '0', cdrMessage: 'rpc' });
    expect(submitRc).toHaveBeenCalledTimes(1);
  });

  it('flag off → 404 void y cron', async () => {
    const voidRes = await runVoidBoletaHttp({ FEATURE_FISCAL_RC: '0' } as WorkerEnv, 't1', 's1');
    expect(voidRes.status).toBe(404);
    const cron = await runFiscalCronHttp({ FEATURE_FISCAL_RC: '0' } as WorkerEnv, {
      action: 'deadlines',
    });
    expect(cron.status).toBe(404);
  });

  it('F5b-2: void 200 con DB; DB ausente → 503', async () => {
    vi.mocked(AdaptersD1.voidBoletaAtomic).mockResolvedValueOnce({
      saleId: 's1',
      voidStatus: 'VOIDED',
    } as never);
    const ok = await runVoidBoletaHttp(
      { FEATURE_FISCAL_RC: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      's1',
    );
    expect(ok.status).toBe(200);
    expect(ok.body.voidStatus).toBe('VOIDED');

    const noDb = await runVoidBoletaHttp({ FEATURE_FISCAL_RC: '1' } as WorkerEnv, 't1', 's1');
    expect(noDb.status).toBe(503);
  });

  it('F5b-2: baja tras RC enviado → 422 VOID_AFTER_RC_SENT (edge E-C)', async () => {
    vi.mocked(AdaptersD1.voidBoletaAtomic).mockRejectedValueOnce(new Error('VOID_AFTER_RC_SENT'));
    const res = await runVoidBoletaHttp(
      { FEATURE_FISCAL_RC: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      's1',
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VOID_AFTER_RC_SENT');
  });

  it('F5b-2: venta inexistente → 404 SALE_NOT_FOUND', async () => {
    vi.mocked(AdaptersD1.voidBoletaAtomic).mockRejectedValueOnce(new Error('SALE_NOT_FOUND'));
    const res = await runVoidBoletaHttp(
      { FEATURE_FISCAL_RC: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      'no-existe',
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SALE_NOT_FOUND');
  });

  it('F5b-2: error inesperado → 400 con código estable', async () => {
    vi.mocked(AdaptersD1.voidBoletaAtomic).mockRejectedValueOnce(new Error('ALGO_INESPERADO'));
    const res = await runVoidBoletaHttp(
      { FEATURE_FISCAL_RC: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      's1',
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALGO_INESPERADO');
  });
});

describe('F5b-6: portal CPE', () => {
  const validSale = {
    id: 's-cpe-1',
    document_type: '01',
    series: 'F001',
    number: 1,
    total_amount_cents: 1180,
    issued_at_lima: '2026-08-04T12:00:00.000Z',
    sunat_xml_hash: 'abc123',
    sunat_status: 'ACCEPTED',
    sunat_response_code: null,
    sunat_error_message: null,
    daily_summary_id: null,
    rc_status: null,
    rc_cdr_code: null,
    rc_cdr_message: null,
  };

  function dbWith(sale: unknown): D1Database {
    return {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.resolve(sale),
        }),
      }),
    } as unknown as D1Database;
  }

  it('flag off → 404', async () => {
    const res = await runCpePortalHttp({ FEATURE_CPE_PORTAL: '0' } as WorkerEnv, 't1', 's1', 'tok');
    expect(res.status).toBe(404);
  });

  it('F5b-6: sin CPE_PORTAL_SECRET configurado → 503 (fail-closed, sin token predecible)', async () => {
    const res = await runCpePortalHttp(
      { FEATURE_CPE_PORTAL: '1', DB: dbWith(validSale) } as WorkerEnv,
      't1',
      's-cpe-1',
      'cualquier-token',
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(503);
  });

  it('F5b-6: token inválido → 401 PORTAL_UNAUTHORIZED', async () => {
    const res = await runCpePortalHttp(
      {
        FEATURE_CPE_PORTAL: '1',
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      'token-incorrecto',
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(401);
    expect((res.body as Record<string, unknown>).code).toBe('PORTAL_UNAUTHORIZED');
  });

  it('F5b-6: venta inexistente → 404 (token válido pero sale no existe)', async () => {
    const token = await mintPortalToken('t1', 's-no-existe', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        FEATURE_CPE_PORTAL: '1',
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(null),
      } as WorkerEnv,
      't1',
      's-no-existe',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(404);
  });

  it('F5b-6: token válido + venta existente → 200 HTML', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        FEATURE_CPE_PORTAL: '1',
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
  });

  // --- H4 (auditoría 0031): portal sirve ARCHIVOS, no solo HTML ---

  const XML_SIGNED = '<?xml version="1.0"?><Invoice><ds:Signature/></Invoice>';

  function r2With(obj: string | null): NonNullable<WorkerEnv['FISCAL_XML_R2']> {
    return {
      get: () => Promise.resolve(obj === null ? null : { text: () => Promise.resolve(obj) }),
    };
  }

  it('H4: file=xml ACCEPTED → application/xml con filename del CPE', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/xml');
    expect(res.filename).toBe('F001-00000001.xml');
    expect(res.body).toBe(XML_SIGNED);
  });

  it('H4: file=xml PENDING → 409 CPE_NOT_ACCEPTED (nunca draft al adquirente)', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith({ ...validSale, sunat_status: 'PENDING' }),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(409);
    expect((res.body as Record<string, unknown>).code).toBe('CPE_NOT_ACCEPTED');
  });

  it('H4: file=xml R2 sin objeto → 404 FILE_NOT_FOUND (sin fuga de stack)', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(null),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(404);
    expect((res.body as Record<string, unknown>).code).toBe('FILE_NOT_FOUND');
  });

  it('H4: file=xml sin binding R2 → 503 PORTAL_UNAVAILABLE', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(503);
    expect((res.body as Record<string, unknown>).code).toBe('PORTAL_UNAVAILABLE');
  });

  it('H4: file=cdr boleta → constancia XML con el código CDR del RC', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith({
          ...validSale,
          document_type: '03',
          series: 'B001',
          number: 7,
          daily_summary_id: 'rc-1',
          rc_status: 'ACCEPTED',
          rc_cdr_code: '0',
          rc_cdr_message: 'El comprobante ha sido aceptado',
        }),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'cdr',
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/xml');
    expect(res.filename).toBe('B001-00000007-constancia.xml');
    expect(String(res.body)).toContain('<ConstanciaRecepcionCPE');
    expect(String(res.body)).toContain('codigoCDR="0"');
  });

  it('H4: aislamiento cross-tenant — token de otro tenant no descarga el archivo', async () => {
    const tokenOtroTenant = await mintPortalToken('t2', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      tokenOtroTenant,
      Date.parse('2026-08-04T12:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(401);
  });

  it('H4: file desconocido → 400 BAD_FILE_REQUEST', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
      '../etc/passwd',
    );
    expect(res.status).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('BAD_FILE_REQUEST');
  });

  it('H4: file=xml fuera de retención (1 año) → 410 CPE_PORTAL_EXPIRED', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2027-08-04T13:00:00.000Z'),
      'xml',
    );
    expect(res.status).toBe(410);
    expect((res.body as Record<string, unknown>).code).toBe('CPE_PORTAL_EXPIRED');
  });

  it('H4: HTML del portal aceptado incluye enlaces de descarga', async () => {
    const token = await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test');
    const res = await runCpePortalHttp(
      {
        CPE_PORTAL_SECRET: 'whsec-portal-test',
        DB: dbWith(validSale),
        FISCAL_XML_R2: r2With(XML_SIGNED),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      token,
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain('file=xml');
    expect(String(res.body)).toContain('file=cdr');
  });
});

describe('H4: enlace distribuible para el POS (/api/sales/:id/cpe-link)', () => {
  function dbWithStatus(sunat_status: string | null): D1Database {
    return {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.resolve(sunat_status === null ? null : { sunat_status }),
        }),
      }),
    } as unknown as D1Database;
  }

  it('ACCEPTED → 200 con URL determinista y token verificable', async () => {
    const res = await runCpeLinkHttp(
      { CPE_PORTAL_SECRET: 'whsec-portal-test', DB: dbWithStatus('ACCEPTED') } as WorkerEnv,
      't1',
      's-cpe-1',
      'https://api.kipuspay.com',
    );
    expect(res.status).toBe(200);
    const expected = await buildCpePortalUrl({
      baseUrl: 'https://api.kipuspay.com',
      tenantId: 't1',
      saleId: 's-cpe-1',
      secret: 'whsec-portal-test',
    });
    expect(res.body.url).toBe(expected.url);
  });

  it('PENDING → 409 CPE_NOT_ACCEPTED (el enlace se genera tras CDR)', async () => {
    const res = await runCpeLinkHttp(
      { CPE_PORTAL_SECRET: 'whsec-portal-test', DB: dbWithStatus('PENDING') } as WorkerEnv,
      't1',
      's-cpe-1',
      'https://api.kipuspay.com',
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CPE_NOT_ACCEPTED');
  });

  it('venta inexistente → 404; sin secret → 503 PORTAL_UNAVAILABLE', async () => {
    const missing = await runCpeLinkHttp(
      { CPE_PORTAL_SECRET: 'whsec-portal-test', DB: dbWithStatus(null) } as WorkerEnv,
      't1',
      's-no-existe',
      'https://api.kipuspay.com',
    );
    expect(missing.status).toBe(404);
    const sinSecret = await runCpeLinkHttp(
      { DB: dbWithStatus('ACCEPTED') } as WorkerEnv,
      't1',
      's-cpe-1',
      'https://api.kipuspay.com',
    );
    expect(sinSecret.status).toBe(503);
    expect(sinSecret.body.code).toBe('PORTAL_UNAVAILABLE');
  });

  it('flag off explícito → 404 FEATURE_OFF; sin DB → 503', async () => {
    const off = await runCpeLinkHttp(
      {
        FEATURE_CPE_PORTAL: '0',
        CPE_PORTAL_SECRET: 's',
        DB: dbWithStatus('ACCEPTED'),
      } as WorkerEnv,
      't1',
      's-cpe-1',
      'https://api.kipuspay.com',
    );
    expect(off.status).toBe(404);
    const noDb = await runCpeLinkHttp(
      { CPE_PORTAL_SECRET: 's' } as WorkerEnv,
      't1',
      's-cpe-1',
      'https://api.kipuspay.com',
    );
    expect(noDb.status).toBe(503);
  });
});

describe('F5b-5: banner boletas del día sin RC (Dueño)', () => {
  function dbWithCount(n: number): D1Database {
    return {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.resolve({ n }),
        }),
      }),
    } as unknown as D1Database;
  }

  it('con boletas pendientes → banner activo con count', async () => {
    const res = await runRcPendingBannerHttp(
      { FEATURE_FISCAL_RC: '1', DB: dbWithCount(7) } as WorkerEnv,
      't1',
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(200);
    expect(res.body.pendingRcTickets).toBe(7);
    expect(res.body.banner).toBe('boletas-del-dia-sin-rc');
  });

  it('sin boletas pendientes → banner ok', async () => {
    const res = await runRcPendingBannerHttp(
      { FEATURE_FISCAL_RC: '1', DB: dbWithCount(0) } as WorkerEnv,
      't1',
      Date.parse('2026-08-04T12:00:00.000Z'),
    );
    expect(res.status).toBe(200);
    expect(res.body.pendingRcTickets).toBe(0);
    expect(res.body.banner).toBe('ok');
  });

  it('flag off → 404; sin DB → 503', async () => {
    const off = await runRcPendingBannerHttp({ FEATURE_FISCAL_RC: '0' } as WorkerEnv, 't1');
    expect(off.status).toBe(404);
    const noDb = await runRcPendingBannerHttp({ FEATURE_FISCAL_RC: '1' } as WorkerEnv, 't1');
    expect(noDb.status).toBe(503);
  });
});

describe('buildRcCdrPort canal producción (FL-2)', () => {
  it('producción sin SOL → puerto fail-closed tipado, nunca PSE/mock/RPC', async () => {
    const submitRc = vi.fn().mockResolvedValue({ accepted: true, cdrCode: '0', cdrMessage: 'rpc' });
    const port = buildRcCdrPort({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_BILL_CHANNEL: 'production',
      FISCAL_PSE_ENDPOINT_URL: 'https://pse.kipuspay.staging.invalid/fiscal',
      FISCAL: {
        drain: () => Promise.resolve({}),
        produceMissing: () => Promise.resolve({}),
        submitRc,
      },
    } as unknown as WorkerEnv);
    const cdr = await port.submit({
      tenantId: 't1',
      summaryId: 'RC-20260824-001',
      xml: '<SummaryDocuments/>',
    });
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrCode).toBe('503');
    expect(cdr.cdrMessage).toBe('SUNAT_PRODUCTION_SOL_MISSING');
    expect(submitRc).not.toHaveBeenCalled();
  });

  it('producción con SOL y URL no oficial → FORBIDDEN', async () => {
    const port = buildRcCdrPort({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_BILL_CHANNEL: 'production',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      SUNAT_BILL_ENDPOINT_URL: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    } as WorkerEnv);
    const cdr = await port.submit({
      tenantId: 't1',
      summaryId: 'RC-20260824-002',
      xml: '<SummaryDocuments/>',
    });
    expect(cdr.accepted).toBe(false);
    expect(cdr.cdrMessage).toBe('SUNAT_PRODUCTION_ENDPOINT_FORBIDDEN');
  });

  it('producción con SOL y URL oficial → SOAP directo a producción', async () => {
    const urls: string[] = [];
    const port = buildRcCdrPort({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_BILL_CHANNEL: 'production',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      FISCAL_PSE_FETCH: (url) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        return Promise.resolve(new Response('gateway', { status: 503 }));
      },
    } as WorkerEnv);
    const cdr = await port.submit({
      tenantId: 't1',
      summaryId: 'RC-20260824-003',
      xml: '<DailySummary date="2026-08-24" tickets="1"/>',
    });
    expect(cdr.accepted).toBe(false);
    expect(urls).toEqual(['https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService']);
  });
});
