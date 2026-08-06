/**
 * Sprint 23 — lectura de ventas/CxC para AccountingExporter (§5.4 regla 3).
 * Solo SELECT; no muta ledger.
 */
import {
  buildAccountingEntries,
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

export async function exportAccountingEntries(
  db: D1DatabaseLike,
  tenantId: string,
  query: AccountingExportReadQuery,
): Promise<readonly AccountingEntry[]> {
  const rows = await readAccountingSaleRows(db, tenantId, query);
  return buildAccountingEntries(rows);
}
