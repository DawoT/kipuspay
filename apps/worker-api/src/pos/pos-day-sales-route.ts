/**
 * Historial del día del POS (F3, GTM §3.3 — navegación del cajero).
 * Ventas de HOY (hora Lima) de la sucursal del cajero, solo lectura.
 * El total siempre viaja en cents y lo calcula el servidor.
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export interface DaySaleRow {
  readonly id: string;
  readonly series: string;
  readonly number: number;
  readonly documentType: string;
  readonly totalCents: number;
  readonly issuedAtLima: string;
  readonly clientName: string;
  readonly voidStatus: string;
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

const CASHIER_ROLES: ReadonlySet<string> = new Set(['cashier', 'supervisor', 'admin', 'owner']);

export async function runDaySalesHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string,
  branchId: string,
): Promise<HttpResult> {
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const normalizedRole = role.toLowerCase();
  if (!CASHIER_ROLES.has(normalizedRole)) {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  }
  const branch = branchId.trim();
  if (normalizedRole === 'cashier' && !branch) {
    return { status: 403, body: { error: 'Branch required', code: 'FORBIDDEN_BRANCH' } };
  }
  const scope = branch ? 'AND s.branch_id = ?' : '';
  const binds = [tenantId];
  if (branch) binds.push(branch);

  const rows = await env.DB.prepare(
    `SELECT s.id, s.series, s.number, s.document_type, s.total_amount_cents,
            s.issued_at_lima, s.client_name, s.void_status
     FROM sales s
     WHERE s.tenant_id = ? ${scope}
       AND s.deleted_at IS NULL
       AND date(s.issued_at_lima) = date('now', '-5 hours')
     ORDER BY s.issued_at_lima DESC
     LIMIT 100`,
  )
    .bind(...binds)
    .all<{
      id: string;
      series: string;
      number: number;
      document_type: string;
      total_amount_cents: number;
      issued_at_lima: string;
      client_name: string;
      void_status: string;
    }>();
  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(s.total_amount_cents), 0) AS total
     FROM sales s
     WHERE s.tenant_id = ? ${scope}
       AND s.deleted_at IS NULL
       AND date(s.issued_at_lima) = date('now', '-5 hours')`,
  )
    .bind(...binds)
    .first<{ n: number; total: number }>();

  const items: DaySaleRow[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    series: row.series,
    number: row.number,
    documentType: row.document_type,
    totalCents: row.total_amount_cents,
    issuedAtLima: row.issued_at_lima,
    clientName: row.client_name,
    voidStatus: row.void_status,
  }));
  return {
    status: 200,
    body: {
      items,
      countToday: totals?.n ?? 0,
      totalTodayCents: totals?.total ?? 0,
      scopeBranch: branch || null,
    },
  };
}
