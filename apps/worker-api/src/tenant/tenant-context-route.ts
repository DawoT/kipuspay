import type { WorkerEnv } from '../auth/control-plane.js';

export interface TenantContextHttpResult {
  readonly status: 200 | 404 | 503;
  readonly body: Record<string, unknown>;
}

export async function runGetTenantContextHttp(env: WorkerEnv, tenantId: string): Promise<TenantContextHttpResult> {
  if (!tenantId) return { status: 404, body: { code: 'TENANT_NOT_FOUND' } };
  if (!env.DB) return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  try {
    const row = await env.DB.prepare(
      `SELECT id, trade_name, formalization_mode, tax_regime, vertical_type FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(tenantId)
      .first<{
        id: string;
        trade_name: string | null;
        formalization_mode: string;
        tax_regime: string;
        vertical_type: string;
      }>();
    if (!row) return { status: 404, body: { code: 'TENANT_NOT_FOUND' } };
    return {
      status: 200,
      body: {
        tenantId: row.id,
        tradeName: row.trade_name ?? '',
        formalizationMode: row.formalization_mode,
        taxRegime: row.tax_regime,
        verticalType: row.vertical_type,
      },
    };
  } catch {
    return { status: 503, body: { code: 'TENANT_CONTEXT_UNAVAILABLE' } };
  }
}
