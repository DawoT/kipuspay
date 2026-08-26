import type { WorkerEnv } from '../auth/control-plane.js';

export interface BranchSeriesHttpResult {
  readonly status: 200 | 400 | 404 | 503;
  readonly body: Record<string, unknown>;
}

export async function runListBranchSeriesHttp(
  env: WorkerEnv,
  tenantId: string,
  branchId: string,
): Promise<BranchSeriesHttpResult> {
  if (!tenantId || !branchId?.trim()) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'branchId required' } };
  }
  if (!env.DB) {
    return { status: 503, body: { code: 'DB_UNAVAILABLE', error: 'D1 unavailable' } };
  }
  try {
    const branch = await env.DB.prepare(
      `SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(branchId, tenantId)
      .first<{ id: string }>();
    if (!branch) {
      return {
        status: 404,
        body: { code: 'BRANCH_NOT_FOUND', error: 'Branch not found for tenant' },
      };
    }
    const { results } = await env.DB.prepare(
      `SELECT id, series, document_type_code, current_number, is_active, authorization_status
       FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ?
       ORDER BY series ASC`,
    )
      .bind(tenantId, branchId)
      .all<{
        id: string;
        series: string;
        document_type_code: string;
        current_number: number;
        is_active: number;
        authorization_status: string;
      }>();
    const series = (results ?? []).map((row) => ({
      id: row.id,
      series: row.series,
      documentTypeCode: row.document_type_code,
      currentNumber: row.current_number,
      isActive: row.is_active === 1,
      authorizationStatus: row.authorization_status,
    }));
    return { status: 200, body: { branchId, series } };
  } catch {
    return {
      status: 503,
      body: { code: 'BRANCH_SERIES_UNAVAILABLE', error: 'Failed to load branch series' },
    };
  }
}
