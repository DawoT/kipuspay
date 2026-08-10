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
  'inventory-by-location',
  'inventory-serial-warranty',
  'branch-ranking',
  'aging-ar-ap',
  'merma',
  'commissions-pending',
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
    {
      id: 'inventory-by-location',
      tier: 'crece',
      source: 'inventory_location_stock/branch_product_stock',
    },
    { id: 'inventory-serial-warranty', tier: 'crece', source: 'serial_numbers' },
    { id: 'branch-ranking', tier: 'crece', source: 'daily_financial_rollups' },
    { id: 'aging-ar-ap', tier: 'cadena', source: 'accounts_receivable/payable' },
    { id: 'merma', tier: 'crece', source: 'stock_losses' },
    { id: 'commissions-pending', tier: 'crece', source: 'commission_accruals' },
    // Sprint 46 — analítica predictiva (Cadena+)
    { id: 'forecast', tier: 'cadena', source: 'forecast_outputs' },
  ];
}

/** CSV UTF-8 BOM; montos INTEGER cents — sin toFixed/float. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
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

export function runReportsCatalogHttp(env: WorkerEnv | undefined): HttpResult {
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
  if (reportId === 'forecast') {
    // Sprint 46: el pronóstico vive en /api/forecasting/ (Cadena+, ADR-0030).
    return {
      status: 404,
      body: {
        error: 'Use /api/forecasting/ (Cadena+ plan) for predictive analytics',
        code: 'USE_FORECASTING_API',
      },
    };
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

/* eslint-disable complexity -- catálogo retail §9: un switch por reportId */
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
      const rows = await db
        .prepare(q)
        .bind(...binds)
        .all();
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
    case 'inventory-by-location': {
      let query = `WITH totals AS (
          SELECT tenant_id, branch_id, product_id,
                 SUM(quantity_microunits) AS location_total_microunits
          FROM inventory_location_stock
          WHERE tenant_id = ?
          GROUP BY tenant_id, branch_id, product_id
        )
        SELECT s.branch_id, s.location_id, l.code AS location_code,
               s.product_id, s.quantity_microunits,
               t.location_total_microunits, b.stock_microunits AS branch_total_microunits,
               t.location_total_microunits - b.stock_microunits AS drift_microunits
        FROM inventory_location_stock s
        JOIN inventory_locations l
          ON l.tenant_id = s.tenant_id AND l.branch_id = s.branch_id
         AND l.id = s.location_id
        JOIN totals t
          ON t.tenant_id = s.tenant_id AND t.branch_id = s.branch_id
         AND t.product_id = s.product_id
        JOIN branch_product_stock b
          ON b.tenant_id = s.tenant_id AND b.branch_id = s.branch_id
         AND b.product_id = s.product_id
        WHERE s.tenant_id = ?`;
      const binds: unknown[] = [tenantId, tenantId];
      if (branchId) {
        query += ` AND s.branch_id = ?`;
        binds.push(branchId);
      }
      query += ` ORDER BY s.branch_id, l.code, s.product_id LIMIT 1000`;
      const rows = await db
        .prepare(query)
        .bind(...binds)
        .all();
      return { items: rows.results ?? [] };
    }
    case 'inventory-serial-warranty': {
      let query = `SELECT sn.serial_number, sn.product_id, sn.branch_id, sn.location_id,
                          sn.status, sn.current_sale_item_id AS sale_item_id,
                          s.id AS sale_id, s.document_type, s.series, s.number,
                          s.client_document_type, s.client_document_number, s.client_name,
                          s.issued_at_lima, sn.created_at, sn.updated_at,
                          (
                            SELECT json_group_array(json_object(
                              'eventType', e.event_type,
                              'fromStatus', e.from_status,
                              'toStatus', e.to_status,
                              'referenceType', e.reference_type,
                              'referenceId', e.reference_id,
                              'branchId', e.branch_id,
                              'locationId', e.location_id,
                              'createdAt', e.created_at
                            ))
                            FROM serial_number_events e
                            WHERE e.tenant_id = sn.tenant_id AND e.serial_id = sn.id
                            ORDER BY e.created_at, e.id
                          ) AS event_history_json
                   FROM serial_numbers sn
                   LEFT JOIN sale_items si
                     ON si.tenant_id = sn.tenant_id AND si.id = sn.current_sale_item_id
                   LEFT JOIN sales s
                     ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
                   WHERE sn.tenant_id = ?`;
      const binds: unknown[] = [tenantId];
      if (branchId) {
        query += ` AND sn.branch_id = ?`;
        binds.push(branchId);
      }
      query += ` ORDER BY sn.updated_at DESC, sn.serial_number LIMIT 1000`;
      const rows = await db
        .prepare(query)
        .bind(...binds)
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
    case 'commissions-pending': {
      const rows = await db
        .prepare(
          `SELECT id, seller_id, sale_id, amount_cents, created_at
           FROM commission_accruals
           WHERE tenant_id = ? AND reversed_at IS NULL
             AND date(created_at) = ?
           ORDER BY created_at DESC
           LIMIT 500`,
        )
        .bind(tenantId, reportDate)
        .all();
      return { items: rows.results ?? [] };
    }
    default:
      throw new Error('UNKNOWN_REPORT');
  }
}
/* eslint-enable complexity */

function cellValue(v: unknown): string | number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return JSON.stringify(v);
}

function reportToCsv(reportId: string, payload: Record<string, unknown>): string {
  if (reportId === 'aging-ar-ap') {
    const ar = (payload.ar as Array<Record<string, unknown>>) ?? [];
    const rows = ar.map((r) => [
      'AR',
      cellValue(r.status),
      Number(r.n ?? 0),
      Number(r.balance_due_cents ?? 0),
    ]);
    const ap = (payload.ap as Array<Record<string, unknown>>) ?? [];
    for (const r of ap) {
      rows.push(['AP', cellValue(r.status), Number(r.n ?? 0), Number(r.balance_due_cents ?? 0)]);
    }
    return toCsv(['ledger', 'status', 'count', 'balance_due_cents'], rows);
  }
  const items = (payload.items as Array<Record<string, unknown>>) ?? [];
  if (items.length === 0) return toCsv(['empty'], []);
  const headers = Object.keys(items[0]!);
  const rows = items.map((item) => headers.map((h) => cellValue(item[h])));
  return toCsv(headers, rows);
}

export async function runDailyRollupsCronHttp(
  env: WorkerEnv | undefined,
  body: { scheduledTimeMs?: number },
): Promise<HttpResult> {
  if (!isReportingRollupsEnabled(env)) return featureOff('FEATURE_REPORTING_ROLLUPS');
  if (!env?.DB) return dbUnavailable();
  const { runDailyRollupsCron, parseActiveShards } = await import('@kipuspay/adapters-d1');
  const shardKeys = parseActiveShards(
    typeof env.TENANT_KV?.get === 'function' ? await env.TENANT_KV.get('active_shards') : '["DB"]',
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
