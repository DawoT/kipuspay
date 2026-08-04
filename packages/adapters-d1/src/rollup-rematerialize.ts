/**
 * Edge D — rematerialize daily_financial_rollups + invalidate insights KV.
 * Idempotente: DELETE+INSERT por (tenant, branch, report_date).
 */
import type { D1DatabaseLike } from './index.js';

export interface InsightsKv {
  delete(key: string): Promise<void>;
}

export interface RematerializeResult {
  readonly rematerialized: boolean;
  readonly reportDate: string;
  readonly grossSalesCents: number;
  readonly docCount: number;
}

function limaDateFromIssuedAtLima(issuedAtLima: string): string {
  // issued_at_lima stored as 'YYYY-MM-DD HH:MM:SS'
  return issuedAtLima.slice(0, 10);
}

/** Día cerrado = report_date < hoy Lima. */
export function isClosedReportDate(reportDate: string, nowMs: number): boolean {
  const limaNow = new Date(nowMs - 5 * 3600 * 1000);
  const y = limaNow.getUTCFullYear();
  const m = String(limaNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(limaNow.getUTCDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  return reportDate < today;
}

export async function rematerializeDailyRollup(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  reportDate: string,
  kv?: InsightsKv,
): Promise<RematerializeResult> {
  const agg = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN document_type NOT IN ('07','08','NV_RETURN') THEN total_amount_cents ELSE 0 END), 0) AS gross,
         COALESCE(SUM(CASE WHEN document_type NOT IN ('07','08','NV_RETURN') THEN total_cogs_cents ELSE 0 END), 0) AS cogs,
         COALESCE(SUM(CASE WHEN document_type NOT IN ('07','08','NV_RETURN') THEN total_igv_cents ELSE 0 END), 0) AS igv,
         COALESCE(SUM(CASE WHEN document_type NOT IN ('07','08','NV_RETURN') THEN total_discount_cents ELSE 0 END), 0) AS discounts,
         COALESCE(SUM(CASE WHEN document_type IN ('07','08','NV_RETURN') THEN total_amount_cents ELSE 0 END), 0) AS returns_cents,
         COUNT(*) AS doc_count
       FROM sales
       WHERE tenant_id = ? AND branch_id = ?
         AND deleted_at IS NULL
         AND date(issued_at_lima) = ?`,
    )
    .bind(tenantId, branchId, reportDate)
    .first<{
      gross: number;
      cogs: number;
      igv: number;
      discounts: number;
      returns_cents: number;
      doc_count: number;
    }>();

  const gross = agg?.gross ?? 0;
  const returnsCents = agg?.returns_cents ?? 0;
  const net = gross - returnsCents;
  const cogs = agg?.cogs ?? 0;
  const igv = agg?.igv ?? 0;
  const discounts = agg?.discounts ?? 0;
  const docCount = agg?.doc_count ?? 0;

  await db
    .prepare(
      `DELETE FROM daily_financial_rollups
       WHERE tenant_id = ? AND branch_id = ? AND report_date = ?`,
    )
    .bind(tenantId, branchId, reportDate)
    .run();

  await db
    .prepare(
      `INSERT INTO daily_financial_rollups (
         tenant_id, branch_id, report_date, gross_sales_cents, net_sales_cents,
         cogs_cents, igv_cents, icbper_cents, discounts_cents, doc_count,
         cash_expected_cents, payments_by_method, overage_docs
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, '{}', 0)`,
    )
    .bind(tenantId, branchId, reportDate, gross, net, cogs, igv, discounts, docCount)
    .run();

  if (kv) {
    await kv.delete(`insights:${tenantId}:${reportDate}`);
  }

  return {
    rematerialized: true,
    reportDate,
    grossSalesCents: gross,
    docCount,
  };
}

/** Tras venta SUCCESS: si issued_at es día cerrado → rematerialize. */
export async function rematerializeDailyRollupIfClosedDay(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  issuedAtLima: string,
  nowMs: number,
  kv?: InsightsKv,
): Promise<RematerializeResult | null> {
  const reportDate = limaDateFromIssuedAtLima(issuedAtLima);
  if (!isClosedReportDate(reportDate, nowMs)) return null;
  return rematerializeDailyRollup(db, tenantId, branchId, reportDate, kv);
}
