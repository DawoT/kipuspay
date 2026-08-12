/**
 * Sprint 49 — schema estricto del Text-to-SQL (Arquitectura §5.3 regla 33 / PERF-12).
 *
 * El LLM es SOLO traductor: genera la intención, no el SQL. Este módulo construye
 * el SELECT desde la whitelist (tablas/columnas/funciones conocidas), SIEMPRE
 * parametrizado (tenant del JWT fuera del texto), con `LIMIT 50` inyectado por
 * fuerza (edge A) y agregación para listas amplias. Nunca se concatena texto del
 * LLM en el SQL; `*` y JOIN libre prohibidos. Columnas PII excluidas (edge C).
 */

export interface InsightColumn {
  readonly name: string;
  readonly kind: 'int_cents' | 'int' | 'text' | 'date';
}

export interface InsightTableSchema {
  readonly columns: Readonly<Record<string, InsightColumn>>;
  readonly join?: { readonly table: string; readonly on: string };
}

export const INSIGHT_SCHEMA: Readonly<Record<string, InsightTableSchema>> = {
  sales: {
    columns: {
      id: { name: 'id', kind: 'text' },
      branch_id: { name: 'branch_id', kind: 'text' },
      customer_id: { name: 'customer_id', kind: 'text' },
      document_type: { name: 'document_type', kind: 'text' },
      series: { name: 'series', kind: 'text' },
      number: { name: 'number', kind: 'int' },
      total_amount_cents: { name: 'total_amount_cents', kind: 'int_cents' },
      issued_at_lima: { name: 'issued_at_lima', kind: 'date' },
      sunat_status: { name: 'sunat_status', kind: 'text' },
    },
  },
  daily_financial_rollups: {
    columns: {
      branch_id: { name: 'branch_id', kind: 'text' },
      report_date: { name: 'report_date', kind: 'date' },
      gross_sales_cents: { name: 'gross_sales_cents', kind: 'int_cents' },
      net_sales_cents: { name: 'net_sales_cents', kind: 'int_cents' },
      doc_count: { name: 'doc_count', kind: 'int' },
      cash_expected_cents: { name: 'cash_expected_cents', kind: 'int_cents' },
      overage_docs: { name: 'overage_docs', kind: 'int' },
    },
  },
  daily_product_rollups: {
    columns: {
      product_id: { name: 'product_id', kind: 'text' },
      report_date: { name: 'report_date', kind: 'date' },
      qty_sold: { name: 'qty_sold', kind: 'int' },
      gross_sales_cents: { name: 'gross_sales_cents', kind: 'int_cents' },
    },
  },
  forecast_outputs: {
    columns: {
      product_id: { name: 'product_id', kind: 'text' },
      forecast_date: { name: 'forecast_date', kind: 'date' },
      predicted_qty: { name: 'predicted_qty', kind: 'int' },
      predicted_gross_cents: { name: 'predicted_gross_cents', kind: 'int_cents' },
    },
  },
};

export const PII_COLUMNS = new Set(['email', 'phone', 'address', 'document_number']);

export function isWhitelistedColumn(table: string, column: string): boolean {
  const schema = INSIGHT_SCHEMA[table];
  if (!schema) return false;
  return column in schema.columns && !PII_COLUMNS.has(column);
}

export const LIMIT_CAPPED = 50;
export const TOO_WIDE_MESSAGE =
  'Los datos son muy amplios para el chat: muestro los 50 principales, descarga el Excel completo en Configuración.';

export type InsightSqlResult =
  | { readonly status: 'OK'; readonly sql: string; readonly params: readonly unknown[] }
  | { readonly status: 'TOO_WIDE'; readonly message: string };

interface InsightSelectInput {
  readonly action: string;
  readonly tenantId: string;
  readonly branchId?: string;
  readonly reportDate?: string;
}

/** Acciones que producen listas de detalle (exigen agregación; sin agregar → TOO_WIDE). */
const WIDE_ACTIONS = new Set(['RAW_ITEMS', 'TOP_PRODUCTS_DETAIL']);

export function buildInsightSelect(input: InsightSelectInput): InsightSqlResult {
  if (WIDE_ACTIONS.has(input.action)) {
    return { status: 'TOO_WIDE', message: TOO_WIDE_MESSAGE };
  }
  const params: unknown[] = [input.tenantId];
  const where = [`t0.tenant_id = ?`];
  if (input.branchId) {
    where.push('t0.branch_id = ?');
    params.push(input.branchId);
  }
  if (input.reportDate) {
    where.push('t0.report_date = ?');
    params.push(input.reportDate);
  }
  const sql = [
    'SELECT t0.gross_sales_cents, t0.doc_count',
    'FROM daily_financial_rollups AS t0',
    `WHERE ${where.join(' AND ')}`,
    `ORDER BY t0.report_date DESC`,
    `LIMIT ${LIMIT_CAPPED}`,
  ].join('\n');
  return { status: 'OK', sql, params };
}
