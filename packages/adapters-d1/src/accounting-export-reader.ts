/**
 * Sprint 23 — lectura de ventas/CxC para AccountingExporter (§5.4 regla 3).
 * Solo SELECT; no muta ledger.
 */
import {
  buildAccountingEntries,
  sortAccountingEntries,
  type AccountingEntry,
  type AccountingSaleRow,
} from '@kipuspay/domain-integrations';
import type { D1DatabaseLike } from './index.js';

export interface AccountingExportReadQuery {
  readonly fromDate: string;
  readonly toDate: string;
  readonly branchId: string;
}

interface SaleJoinRow {
  readonly sale_id: string;
  readonly branch_id: string;
  readonly sold_at: string;
  readonly total_cents: number;
  readonly tax_cents: number;
  readonly ar_balance_cents: number | null;
}

export async function readAccountingSaleRows(
  db: D1DatabaseLike,
  tenantId: string,
  query: AccountingExportReadQuery,
): Promise<AccountingSaleRow[]> {
  const result = await db
    .prepare(
      `SELECT
         s.id AS sale_id,
         s.branch_id AS branch_id,
         s.issued_at_lima AS sold_at,
         s.total_amount_cents AS total_cents,
         s.total_igv_cents AS tax_cents,
         (
           SELECT ar.balance_due_cents FROM accounts_receivable ar
           WHERE ar.tenant_id = s.tenant_id AND ar.sale_id = s.id
           LIMIT 1
         ) AS ar_balance_cents
       FROM sales s
       WHERE s.tenant_id = ?
         AND s.branch_id = ?
         AND s.deleted_at IS NULL
         AND date(s.issued_at_lima) >= date(?)
         AND date(s.issued_at_lima) <= date(?)
         AND s.document_type IN ('NV','01','03','12')
       ORDER BY s.issued_at_lima ASC, s.id ASC`,
    )
    .bind(tenantId, query.branchId, query.fromDate, query.toDate)
    .all<Omit<SaleJoinRow, 'payment_method_code'>>();

  const rows = result.results ?? [];
  const payments = await readPaymentsBySale(
    db,
    tenantId,
    rows.map((r) => r.sale_id),
  );

  return rows.map((row) => ({
    saleId: row.sale_id,
    branchId: row.branch_id,
    soldAt: row.sold_at,
    totalCents: row.total_cents,
    taxCents: row.tax_cents,
    payments: payments.get(row.sale_id) ?? [],
    arBalanceCents: row.ar_balance_cents ?? 0,
  }));
}

interface PaymentJoinRow {
  readonly sale_id: string;
  readonly method_code: string;
  readonly amount_cents: number;
}

/** C4: desglose real de pagos por método para repartir el débito 1011/1212. */
async function readPaymentsBySale(
  db: D1DatabaseLike,
  tenantId: string,
  saleIds: readonly string[],
): Promise<Map<string, AccountingSaleRow['payments']>> {
  if (saleIds.length === 0) return new Map();
  const placeholders = saleIds.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT sp.sale_id AS sale_id, pm.code AS method_code, SUM(sp.amount_cents) AS amount_cents
       FROM sale_payments sp
       INNER JOIN payment_methods pm
         ON pm.tenant_id = sp.tenant_id AND pm.id = sp.payment_method_id
       WHERE sp.tenant_id = ? AND sp.sale_id IN (${placeholders})
       GROUP BY sp.sale_id, pm.code
       ORDER BY sp.sale_id ASC, pm.code ASC`,
    )
    .bind(tenantId, ...saleIds)
    .all<PaymentJoinRow>();

  const map = new Map<string, AccountingSaleRow['payments']>();
  for (const row of result.results ?? []) {
    const current = [...(map.get(row.sale_id) ?? [])];
    current.push({ methodCode: row.method_code, amountCents: row.amount_cents });
    map.set(row.sale_id, current);
  }
  return map;
}

async function readJournalSaleEntries(
  db: D1DatabaseLike,
  tenantId: string,
  query: AccountingExportReadQuery,
): Promise<AccountingEntry[]> {
  const result = await db
    .prepare(
      `SELECT je.source_id AS source_sale_id, je.branch_id AS branch_id, je.post_date AS booked_at,
              coa.code AS gl_account, jl.debit_cents AS debit_cents, jl.credit_cents AS credit_cents,
              jl.memo AS memo
       FROM journal_entries je
       INNER JOIN journal_lines jl
         ON jl.tenant_id = je.tenant_id AND jl.journal_entry_id = je.id
       INNER JOIN chart_of_accounts coa
         ON coa.tenant_id = jl.tenant_id AND coa.id = jl.account_id
       WHERE je.tenant_id = ?
         AND je.branch_id = ?
         AND je.source_type = 'SALE'
         AND je.post_date >= date(?)
         AND je.post_date <= date(?)
       ORDER BY je.post_date ASC, je.source_id ASC`,
    )
    .bind(tenantId, query.branchId, query.fromDate, query.toDate)
    .all<{
      source_sale_id: string;
      branch_id: string;
      booked_at: string;
      gl_account: string;
      debit_cents: number;
      credit_cents: number;
      memo: string;
    }>();
  interface JournalRow {
    source_sale_id: string;
    branch_id: string;
    booked_at: string;
    gl_account: string;
    debit_cents: number;
    credit_cents: number;
    memo: string;
  }
  const out: AccountingEntry[] = [];
  let line = 1;
  let lastSale = '';
  const bucket: JournalRow[] = [];
  const flush = () => {
    const sorted = [...bucket].sort((a, b) => lineRank(a.memo) - lineRank(b.memo));
    for (const row of sorted) {
      out.push({
        sourceSaleId: row.source_sale_id,
        branchId: row.branch_id,
        bookedAt: row.booked_at.slice(0, 10),
        glAccount: row.gl_account,
        amountCents: row.debit_cents > 0 ? row.debit_cents : -row.credit_cents,
        line,
        memo: row.memo ?? `sale:${row.source_sale_id}`,
      });
      line += 1;
    }
    bucket.length = 0;
  };
  for (const row of result.results ?? []) {
    if (row.source_sale_id !== lastSale) {
      flush();
      line = 1;
      lastSale = row.source_sale_id;
    }
    bucket.push(row);
  }
  flush();
  return sortAccountingEntries(out);
}

/** Rank canónico de línea, espejo del orden de buildAccountingEntries: deposit→cash→ar→sales→vat. */
function lineRank(memo: string): number {
  if (memo.endsWith(':debit:deposit')) return 1;
  if (memo.endsWith(':debit:cash')) return 2;
  if (memo.endsWith(':debit:ar')) return 3;
  if (memo.endsWith(':sales')) return 4;
  if (memo.endsWith(':vat')) return 5;
  return 6;
}

export async function exportAccountingEntries(
  db: D1DatabaseLike,
  tenantId: string,
  query: AccountingExportReadQuery,
  options: { readonly fromJournal?: boolean } = {},
): Promise<readonly AccountingEntry[]> {
  if (options.fromJournal === true) {
    return readJournalSaleEntries(db, tenantId, query);
  }
  const rows = await readAccountingSaleRows(db, tenantId, query);
  return buildAccountingEntries(rows);
}
