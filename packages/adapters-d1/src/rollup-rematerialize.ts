/**
 * Edge D — rematerialize daily_financial_rollups + daily_product_rollups + invalidate insights KV.
 * Idempotente: DELETE+INSERT por (tenant, branch, report_date). Nunca UPSERT INTO.
 */
import type { D1Bound, D1DatabaseLike } from './index.js';

export interface InsightsKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { readonly expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RematerializeResult {
  readonly rematerialized: boolean;
  readonly reportDate: string;
  readonly grossSalesCents: number;
  readonly docCount: number;
  readonly productRowCount: number;
}

function limaDateFromIssuedAtLima(issuedAtLima: string): string {
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

async function loadPaymentsByMethodJson(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  reportDate: string,
): Promise<string> {
  const rows = await db
    .prepare(
      `SELECT sp.payment_method_id AS method_id, SUM(sp.amount_cents) AS amount_cents
       FROM sales s
       JOIN sale_payments sp ON sp.sale_id = s.id AND sp.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.branch_id = ?
         AND s.deleted_at IS NULL
         AND date(s.issued_at_lima) = ?
       GROUP BY sp.payment_method_id`,
    )
    .bind(tenantId, branchId, reportDate)
    .all<{ method_id: string; amount_cents: number }>();
  const obj: Record<string, number> = {};
  for (const r of rows.results ?? []) {
    obj[r.method_id] = r.amount_cents;
  }
  return JSON.stringify(obj);
}

export async function rematerializeProductRollups(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  reportDate: string,
): Promise<number> {
  const productRows = await db
    .prepare(
      `SELECT si.product_id AS product_id,
              SUM(CASE WHEN s.document_type IN ('07','08','NV_RETURN') THEN -si.quantity ELSE si.quantity END) AS qty,
              SUM(CASE WHEN s.document_type IN ('07','08','NV_RETURN') THEN -si.base_quantity_microunits ELSE si.base_quantity_microunits END) AS qty_microunits,
              SUM(CASE WHEN s.document_type IN ('07','08','NV_RETURN') THEN -si.total_amount_cents ELSE si.total_amount_cents END) AS gross,
              SUM(CASE WHEN s.document_type IN ('07','08','NV_RETURN') THEN -1 ELSE 1 END * si.unit_cost_cents * si.quantity) AS cogs
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
       WHERE s.tenant_id = ? AND s.branch_id = ?
         AND s.deleted_at IS NULL
         AND date(s.issued_at_lima) = ?
         AND si.product_id IS NOT NULL
       GROUP BY si.product_id`,
    )
    .bind(tenantId, branchId, reportDate)
    .all<{
      product_id: string;
      qty: number;
      qty_microunits: number;
      gross: number;
      cogs: number;
    }>();

  const stmts: D1Bound[] = [
    db
      .prepare(
        `DELETE FROM daily_product_rollups
         WHERE tenant_id = ? AND branch_id = ? AND report_date = ?`,
      )
      .bind(tenantId, branchId, reportDate),
  ];
  for (const row of productRows.results ?? []) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO daily_product_rollups (
             tenant_id, branch_id, report_date, product_id, qty, qty_microunits, gross_cents, cogs_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          tenantId,
          branchId,
          reportDate,
          row.product_id,
          row.qty,
          row.qty_microunits,
          row.gross,
          row.cogs,
        ),
    );
  }
  await db.batch(stmts);
  return productRows.results?.length ?? 0;
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
  const paymentsByMethod = await loadPaymentsByMethodJson(db, tenantId, branchId, reportDate);

  await db.batch([
    db
      .prepare(
        `DELETE FROM daily_financial_rollups
         WHERE tenant_id = ? AND branch_id = ? AND report_date = ?`,
      )
      .bind(tenantId, branchId, reportDate),
    db
      .prepare(
        `INSERT INTO daily_financial_rollups (
           tenant_id, branch_id, report_date, gross_sales_cents, net_sales_cents,
           cogs_cents, igv_cents, icbper_cents, discounts_cents, doc_count,
           cash_expected_cents, payments_by_method, overage_docs
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 0)`,
      )
      .bind(
        tenantId,
        branchId,
        reportDate,
        gross,
        net,
        cogs,
        igv,
        discounts,
        docCount,
        paymentsByMethod,
      ),
  ]);

  const productRowCount = await rematerializeProductRollups(db, tenantId, branchId, reportDate);

  if (kv) {
    await kv.delete(`insights:${tenantId}:${reportDate}`);
  }

  return {
    rematerialized: true,
    reportDate,
    grossSalesCents: gross,
    docCount,
    productRowCount,
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
