import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isAdvancedReportId,
  isReportingCatalogEnabled,
  isReportingExportEnabled,
  isReportingRollupsEnabled,
  runDailyRollupsCronHttp,
  runReportHttp,
  runReportsCatalogHttp,
  toCsv,
} from './report-routes.js';

function mockEnv(
  flags: Record<string, string>,
  all: Record<string, unknown>[] = [],
  opts: { kvShards?: string | null; noDb?: boolean } = {},
): WorkerEnv {
  const bound = {
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ results: all }),
    run: () => Promise.resolve({ success: true, results: [], meta: {} }),
  };
  return {
    TENANT_KV: {
      get: (key: string) =>
        Promise.resolve(key === 'active_shards' ? (opts.kvShards ?? null) : null),
    },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response()) }),
    },
    ...flags,
    ...(opts.noDb
      ? {}
      : {
          DB: {
            prepare: () => ({ bind: () => bound }),
            batch: () => Promise.resolve([]),
          } as unknown as WorkerEnv['DB'],
        }),
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

  it('catalog flag off → FEATURE_OFF', () => {
    const res = runReportsCatalogHttp({ FEATURE_REPORTING_CATALOG: '0' } as WorkerEnv);
    expect(res.status).toBe(404);
  });

  it('catalog on → lista reportes', () => {
    const res = runReportsCatalogHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }));
    expect(res.status).toBe(200);
    const body = res.body as { reports: unknown[] };
    expect(body.reports.length).toBeGreaterThan(5);
    expect(body.reports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'inventory-by-location' })]),
    );
  });

  it('Sprint 39 publica y ejecuta inventory-serial-warranty de forma aislada', async () => {
    const env = mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [
      {
        serial_number: 'SN-0001',
        product_id: 'p1',
        status: 'SOLD',
        sale_item_id: 'si1',
      },
    ]);
    const catalog = runReportsCatalogHttp(env);

    expect(catalog.status).toBe(200);
    expect((catalog.body as { reports: unknown[] }).reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'inventory-serial-warranty',
          source: 'serial_numbers',
        }),
      ]),
    );

    const report = await runReportHttp(env, 't1', 'inventory-serial-warranty', {
      reportDate: '2026-08-08',
      branchId: 'b1',
    });
    expect(report.status).toBe(200);
    const body = report.body as {
      items: Array<{ serial_number: string; status: string; sale_item_id: string }>;
    };
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serial_number: 'SN-0001',
          status: 'SOLD',
          sale_item_id: 'si1',
        }),
      ]),
    );
  });

  it('S9-H2: merma ahora lee stock_losses (200) y filtra por branch; day-summary JSON; csv exige export flag', async () => {
    const merma = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [
        { branch_id: 'b1', category: 'EXPIRED', loss_count: 2, total_qty: 5 },
      ]),
      't1',
      'merma',
      { reportDate: '2026-08-04' },
    );
    expect(merma.status).toBe(200);
    expect((merma.body as { items: unknown[] }).items).toHaveLength(1);

    const mermaBranch = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }),
      't1',
      'merma',
      { reportDate: '2026-08-04', branchId: 'b2' },
    );
    expect(mermaBranch.status).toBe(200);

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
      mockEnv({ FEATURE_REPORTING_CATALOG: '1', FEATURE_REPORTING_EXPORT: '1' }, [
        { branch_id: 'b1', net_sales_cents: 100 },
      ]),
      't1',
      'day-summary',
      { reportDate: '2026-08-04', format: 'csv' },
    );
    expect(csvOn.status).toBe(200);
    expect(csvOn.contentType).toContain('text/csv');
    expect(typeof csvOn.body).toBe('string');
    expect((csvOn.body as string).startsWith('\uFEFF')).toBe(true);
  });

  it('S9-H1: ventas por hora devuelve desglose horario con ticket promedio', async () => {
    const res = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [
        { hour_lima: 9, doc_count: 3, gross_sales_cents: 3540, avg_ticket_cents: 1180 },
        { hour_lima: 14, doc_count: 5, gross_sales_cents: 8260, avg_ticket_cents: 1652 },
      ]),
      't1',
      'sales-by-hour',
      { reportDate: '2026-08-04' },
    );
    expect(res.status).toBe(200);
    const items = (res.body as { items: unknown[] }).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ hour_lima: 9, doc_count: 3 });
  });

  it('S9-H4: reportes avanzados exigen rol admin/owner (403 cashier; 200 owner)', async () => {
    const env = mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [
      { product_id: 'p1', qty: 2, gross_cents: 2000, cogs_cents: 800, margin_cents: 1200 },
    ]);
    const asCashier = await runReportHttp(env, 't1', 'top-products', {
      reportDate: '2026-08-04',
      role: 'cashier',
    });
    expect(asCashier.status).toBe(403);
    expect((asCashier.body as { code: string }).code).toBe('FORBIDDEN_ROLE');

    const asOwner = await runReportHttp(env, 't1', 'top-products', {
      reportDate: '2026-08-04',
      role: 'owner',
    });
    expect(asOwner.status).toBe(200);

    const asAdmin = await runReportHttp(env, 't1', 'top-products', {
      reportDate: '2026-08-04',
      role: 'admin',
    });
    expect(asAdmin.status).toBe(200);
  });

  it('S9-H4: arqueo y ventas por hora NUNCA bloqueados por rol (cajero operativo)', async () => {
    const arqueo = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }),
      't1',
      'arqueo',
      { reportDate: '2026-08-04', role: 'cashier' },
    );
    expect(arqueo.status).toBe(200);

    const byHour = await runReportHttp(
      mockEnv({ FEATURE_REPORTING_CATALOG: '1' }),
      't1',
      'sales-by-hour',
      { reportDate: '2026-08-04', role: 'cashier' },
    );
    expect(byHour.status).toBe(200);
  });

  it('Sprint 46 cataloga forecast (cadena) y remite a /api/forecasting/ en la ejecución', async () => {
    const catalog = runReportsCatalogHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }));
    expect(catalog.status).toBe(200);
    expect((catalog.body as { reports: unknown[] }).reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'forecast', tier: 'cadena', source: 'forecast_outputs' }),
      ]),
    );

    const res = await runReportHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }), 't1', 'forecast', {
      reportDate: '2026-08-04',
    });
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('USE_FORECASTING_API');
  });

  it('bad date / unknown / DB unavailable / catalog off', async () => {
    expect(
      (
        await runReportHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '0' }), 't1', 'day-summary', {
          reportDate: '2026-08-04',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await runReportHttp(
          mockEnv({ FEATURE_REPORTING_CATALOG: '1' }, [], { noDb: true }),
          't1',
          'day-summary',
          {
            reportDate: '2026-08-04',
          },
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await runReportHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }), 't1', 'day-summary', {
          reportDate: 'bad',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await runReportHttp(mockEnv({ FEATURE_REPORTING_CATALOG: '1' }), 't1', 'nope', {
          reportDate: '2026-08-04',
        })
      ).status,
    ).toBe(404);
  });

  it('cubre reportes Arranque/Crece/Cadena + CSV aging', async () => {
    const flags = { FEATURE_REPORTING_CATALOG: '1', FEATURE_REPORTING_EXPORT: '1' };
    const ids = [
      'arqueo',
      'payments-by-method',
      'sales-by-cashier',
      'top-products',
      'inventory-valued',
      'inventory-by-location',
      'branch-ranking',
    ] as const;
    for (const id of ids) {
      const res = await runReportHttp(
        mockEnv(flags, [
          { branch_id: 'b1', product_id: 'p1', qty: 1, gross_cents: 100, status: 'OPEN', n: 1 },
        ]),
        't1',
        id,
        { reportDate: '2026-08-04', branchId: 'b1' },
      );
      expect(res.status).toBe(200);
    }
    const aging = await runReportHttp(
      mockEnv(flags, [{ status: 'OPEN', n: 2, balance_due_cents: 500 }]),
      't1',
      'aging-ar-ap',
      { reportDate: '2026-08-04', format: 'csv' },
    );
    expect(aging.status).toBe(200);
    expect(typeof aging.body).toBe('string');
    expect((aging.body as string).includes('AR')).toBe(true);
  });

  it('toCsv escapes and keeps integer cents', () => {
    const csv = toCsv(['a', 'amount_cents'], [['x,y', 1180]]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('1180');
    expect(csv).not.toContain('11.80');
  });

  it('cron flag off / DB unavailable / on con shards vacíos', { timeout: 20_000 }, async () => {
    expect((await runDailyRollupsCronHttp({} as WorkerEnv, {})).status).toBe(404);
    expect(
      (
        await runDailyRollupsCronHttp(
          mockEnv({ FEATURE_REPORTING_ROLLUPS: '1' }, [], { noDb: true }),
          {},
        )
      ).status,
    ).toBe(503);

    const res = await runDailyRollupsCronHttp(
      mockEnv({ FEATURE_REPORTING_ROLLUPS: '1' }, [], { kvShards: '["DB"]' }),
      { scheduledTimeMs: Date.parse('2026-08-05T08:00:00.000Z') },
    );
    expect(res.status).toBe(200);
    expect((res.body as { p95BudgetMs: number; withinBudget: boolean }).p95BudgetMs).toBe(50);
    expect((res.body as { withinBudget: boolean }).withinBudget).toBe(true);
  });
});
