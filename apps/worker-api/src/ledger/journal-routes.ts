/**
 * Sprint 32 — diario solo lectura (FEATURE_LEDGER_CHART_OF_ACCOUNTS, default off).
 */
import type { WorkerEnv } from '../auth/control-plane.js';
import { isLedgerChartOfAccountsEnabled } from '../auth/features.js';

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_LEDGER_CHART_OF_ACCOUNTS off', code: 'FEATURE_OFF' },
  };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

export async function runListJournalHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  query: { fromDate?: string; toDate?: string; branchId?: string },
): Promise<HttpResult> {
  if (!isLedgerChartOfAccountsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const fromDate = query.fromDate?.trim() ?? '';
  const toDate = query.toDate?.trim() ?? '';
  const branchId = query.branchId?.trim() ?? '';
  if (!fromDate || !toDate || !branchId) {
    return {
      status: 400,
      body: { error: 'fromDate, toDate, branchId required', code: 'BAD_REQUEST' },
    };
  }
  const rows = await env.DB.prepare(
    `SELECT je.id, je.source_type, je.source_id, je.post_date, je.balanced_cents,
            jl.debit_cents, jl.credit_cents, jl.memo, coa.code AS account_code
     FROM journal_entries je
     INNER JOIN journal_lines jl
       ON jl.tenant_id = je.tenant_id AND jl.journal_entry_id = je.id
     INNER JOIN chart_of_accounts coa
       ON coa.tenant_id = jl.tenant_id AND coa.id = jl.account_id
     WHERE je.tenant_id = ? AND je.branch_id = ?
       AND je.post_date >= date(?) AND je.post_date <= date(?)
     ORDER BY je.post_date ASC, je.source_id ASC, coa.code ASC`,
  )
    .bind(tenantId, branchId, fromDate, toDate)
    .all<Record<string, unknown>>();
  return { status: 200, body: { items: rows.results ?? [] } };
}

export function runMutateJournalHttp(): HttpResult {
  return { status: 403, body: { error: 'Journal is read-only', code: 'JOURNAL_READ_ONLY' } };
}
