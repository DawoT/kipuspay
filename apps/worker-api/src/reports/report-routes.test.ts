import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isAdvancedReportId,
  isReportingCatalogEnabled,
  isReportingExportEnabled,
  isReportingRollupsEnabled,
  runReportHttp,
  runReportsCatalogHttp,
  toCsv,
} from './report-routes.js';

function mockEnv(flags: Record<string, string>, all: Record<string, unknown>[] = []): WorkerEnv {
  const bound = {
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ results: all }),
    run: () => Promise.resolve({ success: true, results: [], meta: {} }),
  };
  return {
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response()) }),
    },
    ...flags,
    DB: {
      prepare: () => ({ bind: () => bound }),
      batch: () => Promise.resolve([]),
    } as unknown as WorkerEnv['DB'],
  } as WorkerEnv;
}

describe('reporting flags + catalog', () => {
  it('default off', () => {
    expect(isReportingRollupsEnabled({} as WorkerEnv)).toBe(false);
    expect(isReportingCatalogEnabled({ FEATURE_REPORTING_CATALOG: '1' } as WorkerEnv)).toBe(true);
    expect(isReportingExportEnabled({ FEATURE_REPORTING_EXPORT: 'true' } as WorkerEnv)).toBe(true);
    expect(isAdvancedReportId('top-products')).toBe(true);
    expect(isAdvancedReportId('arqueo')).toBe(false);
  });

  it('catalog flag off → FEATURE_OFF', async () => {
    const res = await runReportsCatalogHttp({ FEATURE_REPORTING_CATALOG: '0' } as WorkerEnv);
    expect(res.status).toBe(404);
  });

  it('catalog on → lista reportes', async () => {
    const res = await runReportsCatalogHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }));
    expect(res.status).toBe(200);
    const body = res.body as { reports: unknown[] };
    expect(body.reports.length).toBeGreaterThan(5);
  });

  it('merma → REPORT_UNAVAILABLE; day-summary JSON; csv exige export flag', async () => {
    const merma = await runReportHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }), 't1', 'merma', {
      reportDate: '2026-08-04',
    });
    expect(merma.status).toBe(404);
    expect((merma.body as { code: string }).code).toBe('REPORT_UNAVAILABLE');

    const day = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [{ branch_id: 'b1', net_sales_cents: 100 }]),
      't1',
      'day-summary',
      { reportDate: '2026-08-04' },
    );
    expect(day.status).toBe(200);

    const csvOff = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1', FEATURE_REPORTING_EXPORT: '0' }),
      't1',
      'day-summary',
      { reportDate: '2026-08-04', format: 'csv' },
    );
    expect(csvOff.status).toBe(404);

    const csvOn = await runReportHttp(
      mockEnv(
        { FEATURE_REPORTING_CATALOG: '1', FEATURE_REPORTING_EXPORT: '1' },
        [{ branch_id: 'b1', net_sales_cents: 100 }],
      ),
      't1',
      'day-summary',
      { reportDate: '2026-08-04', format: 'csv' },
    );
    expect(csvOn.status).toBe(200);
    expect(csvOn.contentType).toContain('text/csv');
    expect(String(csvOn.body).startsWith('\uFEFF')).toBe(true);
  });

  it('toCsv escapes and keeps integer cents', () => {
    const csv = toCsv(['a', 'amount_cents'], [['x,y', 1180]]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('1180');
    expect(csv).not.toContain('11.80');
  });
});
