/**
 * S11-E10 — exportación del catálogo en CSV (Guía Legal Q4: "exportar todo tu
 * catálogo y ventas en CSV"). Columnas: id, sku, barcode, name, price_cents,
 * stock, unit_code, is_active. Solo el tenant del JWT (x-tenant-id verificado
 * por el middleware).
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export async function runExportCatalogCsvHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<{
  status: number;
  body: string | { error: string; code: string; detail?: string };
  contentType?: string;
}> {
  if (!env?.DB || !tenantId) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  try {
    const rows = await env.DB.prepare(
      `SELECT id, sku, barcode, name, price_cents, stock, unit_code, is_active
       FROM products
       WHERE tenant_id = ? AND deleted_at IS NULL
       ORDER BY name`,
    )
      .bind(tenantId)
      .all<{
        id: string;
        sku: string;
        barcode: string | null;
        name: string;
        price_cents: number;
        stock: number;
        unit_code: string | null;
        is_active: number;
      }>();
    const header = 'id,sku,barcode,name,price_cents,stock,unit_code,is_active\n';
    const lines = (rows.results ?? []).map((r) =>
      [
        csvCell(r.id),
        csvCell(r.sku),
        csvCell(r.barcode ?? ''),
        csvCell(r.name),
        String(r.price_cents),
        String(r.stock),
        csvCell(r.unit_code ?? 'NIU'),
        r.is_active ? '1' : '0',
      ].join(','),
    );
    return {
      status: 200,
      body: header + lines.join('\n'),
      contentType: 'text/csv; charset=utf-8',
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        error: 'Database unavailable',
        code: 'DB_UNAVAILABLE',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface SalesExportRange {
  readonly fromDate?: string;
  readonly toDate?: string;
}

/** Q4 — CSV de ventas (detalle), no el rollup day-summary. Sin FEATURE_REPORTING_EXPORT. */
export async function runExportSalesCsvHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  range: SalesExportRange = {},
): Promise<{
  status: number;
  body: string | { error: string; code: string; detail?: string };
  contentType?: string;
}> {
  if (!env?.DB || !tenantId) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const fromDate = (range.fromDate ?? '').trim();
  const toDate = (range.toDate ?? '').trim();
  try {
    const rows = await env.DB.prepare(
      `SELECT issued_at_lima, series, number, document_type, total_amount_cents,
              sunat_status, void_status
         FROM sales
        WHERE tenant_id = ? AND deleted_at IS NULL
          AND (? = '' OR date(issued_at_lima) >= ?)
          AND (? = '' OR date(issued_at_lima) <= ?)
        ORDER BY issued_at_lima`,
    )
      .bind(tenantId, fromDate, fromDate, toDate, toDate)
      .all<{
        issued_at_lima: string;
        series: string;
        number: number;
        document_type: string;
        total_amount_cents: number;
        sunat_status: string;
        void_status: string;
      }>();
    const header =
      'issued_at_lima,series,number,document_type,total_amount_cents,sunat_status,void_status\n';
    const lines = (rows.results ?? []).map((r) =>
      [
        csvCell(r.issued_at_lima),
        csvCell(r.series),
        String(r.number),
        csvCell(r.document_type),
        String(r.total_amount_cents),
        csvCell(r.sunat_status),
        csvCell(r.void_status),
      ].join(','),
    );
    return {
      status: 200,
      body: header + lines.join('\n'),
      contentType: 'text/csv; charset=utf-8',
    };
  } catch (err) {
    return {
      status: 503,
      body: {
        error: 'Database unavailable',
        code: 'DB_UNAVAILABLE',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
