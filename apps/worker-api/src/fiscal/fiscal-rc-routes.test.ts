import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { mintPortalToken } from '@kipuspay/domain-fiscal-pe';
import {
  isCpePortalEnabled,
  isFiscalRcEnabled,
  buildRcCdrPort,
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
  it('FEATURE_FISCAL_RC / FEATURE_CPE_PORTAL default off', () => {
    expect(isFiscalRcEnabled({} as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '0' } as WorkerEnv)).toBe(false);
    expect(isFiscalRcEnabled({ FEATURE_FISCAL_RC: '1' } as WorkerEnv)).toBe(true);
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
