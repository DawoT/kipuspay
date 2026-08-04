/**
 * Catálogo reportes retail + CSV export (Sprint 9 / Arquitectura §9).
 * Lectura desde rollups/D1 agregados — nunca hot path de venta.
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export function isReportingRollupsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_REPORTING_ROLLUPS === '1' || env?.FEATURE_REPORTING_ROLLUPS === 'true';
}

export function isReportingCatalogEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_REPORTING_CATALOG === '1' || env?.FEATURE_REPORTING_CATALOG === 'true';
}

export function isReportingExportEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_REPORTING_EXPORT === '1' || env?.FEATURE_REPORTING_EXPORT === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown> | string;
  contentType?: string;
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const ARRIVAL_REPORTS = new Set([
  'day-summary',
  'payments-by-method',
  'sales-by-cashier',
  'arqueo',
]);

const ADVANCED_REPORTS = new Set([
  'top-products',
  'inventory-valued',
  'branch-ranking',
  'aging-ar-ap',
  'merma',
]);

export function isAdvancedReportId(reportId: string): boolean {
  return ADVANCED_REPORTS.has(reportId);
}

export function listCatalogEntries(): readonly {
  id: string;
  tier: 'arranque' | 'crece' | 'cadena';
  source: string;
}[] {
  return [
    { id: 'day-summary', tier: 'arranque', source: 'daily_financial_rollups' },
    { id: 'payments-by-method', tier: 'arranque', source: 'daily_financial_rollups' },
    { id: 'sales-by-cashier', tier: 'arranque', source: 'sales' },
    { id: 'arqueo', tier: 'arranque', source: 'daily_financial_rollups' },
    { id: 'top-products', tier: 'crece', source: 'daily_product_rollups' },
    { id: 'inventory-valued', tier: 'crece', source: 'branch_product_stock' },
    { id: 'branch-ranking', tier: 'crece', source: 'daily_financial_rollups' },
    { id: 'aging-ar-ap', tier: 'cadena', source: 'accounts_receivable/payable' },
    { id: 'merma', tier: 'crece', source: 'stock_losses' },
  ];
}

/** CSV UTF-8 BOM; montos INTEGER cents — sin toFixed/float. */
export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const escape = (v: string | number): string => {
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return `\uFEFF${lines.join('\n')}\n`;
}

export async function runReportsCatalogHttp(env: WorkerEnv | undefined): Promise<HttpResult> {
  if (!isReportingCatalogEnabled(env)) return featureOff('FEATURE_REPORTING_CATALOG');
  return {
    status: 200,
    body: {
      live: false,
      source: 'd1_rollups',
      reports: listCatalogEntries(),
    },
  };
}

export async function runReportHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  reportId: string,
  opts: { reportDate?: string; format?: string; branchId?: string },
): Promise<HttpResult> {
  if (!isReportingCatalogEnabled(env)) return featureOff('FEATURE_REPORTING_CATALOG');
  if (!env?.DB) return dbUnavailable();
  const reportDate = opts.reportDate ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return { status: 400, body: { error: 'Invalid reportDate', code: 'BAD_REQUEST' } };
  }
  if (!ARRIVAL_REPORTS.has(reportId) && !ADVANCED_REPORTS.has(reportId)) {
    return { status: 404, body: { error: 'Unknown report', code: 'NOT_FOUND' } };
  }
  if (reportId === 'merma') {
    return {
      status: 404,
      body: {
        error: 'stock_losses DDL not in base migration',
        code: 'REPORT_UNAVAILABLE',
      },
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = await loadReport(env, tenantId, reportId, reportDate, opts.branchId);
  } catch (e) {
    return {
      status: 500,
      body: { error: String(e instanceof Error ? e.message : e), code: 'REPORT_FAILED' },
    };
  }

  const wantCsv = opts.format === 'csv';
  if (wantCsv) {
    if (!isReportingExportEnabled(env)) return featureOff('FEATURE_REPORTING_EXPORT');
    const csv = reportToCsv(reportId, payload);
    return {
      status: 200,
      body: csv,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  return {
    status: 200,
    body: {
      reportId,
      reportDate,
      live: false,
      source: 'd1_rollups',
      ...payload,
    },
  };
}

async function loadReport(
  env: WorkerEnv,
  tenantId: string,
  reportId: string,
  reportDate: string,
  branchId?: string,
): Promise<Record<string, unknown>> {
  const db = env.DB!;
  switch (reportId) {
    case 'day-summary':
    case 'arqueo': {
      const rows = await db
        .prepare(
          `SELECT branch_id, gross_sales_cents, net_sales_cents, doc_count,
                  igv_cents, discounts_cents, cogs_cents, cash_expected_cents,
                  cash_counted_cents, cash_diff_cents, payments_by_method
           FROM daily_financial_rollups
           WHERE tenant_id = ? AND report_date = ?
           ORDER BY net_sales_cents DESC`,
        )
        .bind(tenantId, reportDate)
        .all();
      return { items: rows.results ?? [] };
    }
    case 'payments-by-method': {
      const rows = await db
        .prepare(
          `SELECT branch_id, payments_by_method
           FROM daily_financial_rollups
           WHERE tenant_id = ? AND report_date = ?`,
        )
        .bind(tenantId, reportDate)
        .all<{ branch_id: string; payments_by_method: string }>();
      return { items: rows.results ?? [] };
    }
    case 'sales-by-cashier': {
      const rows = await db
        .prepare(
          `SELECT user_id, COUNT(*) AS doc_count,
                  SUM(total_amount_cents) AS gross_sales_cents
           FROM sales
           WHERE tenant_id = ? AND deleted_at IS NULL AND date(issued_at_lima) = ?
             AND document_type NOT IN ('07','08','NV_RETURN')
           GROUP BY user_id
           ORDER BY gross_sales_cents DESC`,
        )
        .bind(tenantId, reportDate)
        .all();
      return { items: rows.results ?? [] };
    }
    case 'top-products': {
      let q = `SELECT product_id, SUM(qty) AS qty, SUM(gross_cents) AS gross_cents,
                      SUM(cogs_cents) AS cogs_cents,
                      SUM(gross_cents) - SUM(cogs_cents) AS margin_cents
               FROM daily_product_rollups
               WHERE tenant_id = ? AND report_date = ?`;
      const binds: unknown[] = [tenantId, reportDate];
      if (branchId) {
        q += ` AND branch_id = ?`;
        binds.push(branchId);
      }
      q += ` GROUP BY product_id ORDER BY gross_cents DESC LIMIT 50`;
      const rows = await db.prepare(q).bind(...binds).all();
      return { items: rows.results ?? [] };
    }
    case 'inventory-valued': {
      const rows = await db
        .prepare(
          `SELECT bps.product_id, bps.branch_id, bps.stock,
                  bps.pmp_unit_cost_cents,
                  CAST(bps.stock * bps.pmp_unit_cost_cents AS INTEGER) AS valued_cents
           FROM branch_product_stock bps
           WHERE bps.tenant_id = ?
           ORDER BY valued_cents DESC
           LIMIT 200`,
        )
        .bind(tenantId)
        .all();
      return { items: rows.results ?? [] };
    }
    case 'branch-ranking': {
      const rows = await db
        .prepare(
          `SELECT branch_id, net_sales_cents, gross_sales_cents, doc_count
           FROM daily_financial_rollups
           WHERE tenant_id = ? AND report_date = ?
           ORDER BY net_sales_cents DESC`,
        )
        .bind(tenantId, reportDate)
        .all();
      return { items: rows.results ?? [], rankingClaimFrozen: false };
    }
    case 'aging-ar-ap': {
      const ar = await db
        .prepare(
          `SELECT status, COUNT(*) AS n, SUM(balance_due_cents) AS balance_due_cents
           FROM accounts_receivable WHERE tenant_id = ?
           GROUP BY status`,
        )
        .bind(tenantId)
        .all();
      const ap = await db
        .prepare(
          `SELECT status, COUNT(*) AS n, SUM(balance_due_cents) AS balance_due_cents
           FROM accounts_payable WHERE tenant_id = ?
           GROUP BY status`,
        )
        .bind(tenantId)
        .all();
      return { ar: ar.results ?? [], ap: ap.results ?? [] };
    }
    default:
      throw new Error('UNKNOWN_REPORT');
  }
}

function reportToCsv(reportId: string, payload: Record<string, unknown>): string {
  if (reportId === 'aging-ar-ap') {
    const ar = (payload.ar as Array<Record<string, unknown>>) ?? [];
    const rows = ar.map((r) => [
      'AR',
      String(r.status ?? ''),
      Number(r.n ?? 0),
      Number(r.balance_due_cents ?? 0),
    ]);
    const ap = (payload.ap as Array<Record<string, unknown>>) ?? [];
    for (const r of ap) {
      rows.push(['AP', String(r.status ?? ''), Number(r.n ?? 0), Number(r.balance_due_cents ?? 0)]);
    }
    return toCsv(['ledger', 'status', 'count', 'balance_due_cents'], rows);
  }
  const items = (payload.items as Array<Record<string, unknown>>) ?? [];
  if (items.length === 0) return toCsv(['empty'], []);
  const headers = Object.keys(items[0]!);
  const rows = items.map((item) => headers.map((h) => {
    const v = item[h];
    return typeof v === 'number' ? v : String(v ?? '');
  }));
  return toCsv(headers, rows);
}

export async function runDailyRollupsCronHttp(
  env: WorkerEnv | undefined,
  body: { scheduledTimeMs?: number },
): Promise<HttpResult> {
  if (!isReportingRollupsEnabled(env)) return featureOff('FEATURE_REPORTING_ROLLUPS');
  if (!env?.DB) return dbUnavailable();
  const { runDailyRollupsCron, parseActiveShards } = await import(
    '@kipuspay/adapters-d1'
  );
  const shardKeys = parseActiveShards(
    typeof env.TENANT_KV?.get === 'function'
      ? await env.TENANT_KV.get('active_shards')
      : '["DB"]',
  );
  // Local/dev: single binding DB as first shard.
  const shards = [{ shardKey: shardKeys[0] ?? 'DB', db: env.DB }];
  const result = await runDailyRollupsCron(shards, body.scheduledTimeMs ?? Date.now());
  return {
    status: 200,
    body: {
      reportDate: result.reportDate,
      elapsedMs: result.elapsedMs,
      shards: result.shards,
      p95BudgetMs: 50,
      withinBudget: result.elapsedMs < 50 || result.shards.every((s) => s.pairs === 0),
    },
  };
}
