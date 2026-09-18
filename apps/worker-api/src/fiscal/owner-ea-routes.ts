/**
 * Backlog Dueño + NC E-A confirmada (Sprint 26).
 */
import { processCreditNoteAtomic, type D1DatabaseLike } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

function asD1(db: D1Database): D1DatabaseLike {
  return db;
}

export function isFiscalCircuitBreakerFlag(env: WorkerEnv): boolean {
  return (
    env.FEATURE_FISCAL_CIRCUIT_BREAKER === '1' || env.FEATURE_FISCAL_CIRCUIT_BREAKER === 'true'
  );
}

async function requireFiscalCapability(
  env: WorkerEnv,
  tenantId: string,
  capability: 'fiscal.rc' | 'fiscal.cpe_portal',
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    await new CapabilityResolver(env).require(tenantId, capability);
    return null;
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status === 404 ? 404 : 503,
        body: { code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return { status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } };
  }
}

async function optionalCapability(
  env: WorkerEnv,
  tenantId: string,
  capability: 'ledger.accounts_receivable' | 'ledger.chart_of_accounts' | 'sales.commissions',
): Promise<boolean> {
  try {
    await new CapabilityResolver(env).require(tenantId, capability);
    return true;
  } catch (error) {
    if (error instanceof CapabilityError && error.status === 404) return false;
    throw error;
  }
}

export async function runOwnerBacklogHttp(
  env: WorkerEnv,
  tenantId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const capabilityError = await requireFiscalCapability(env, tenantId, 'fiscal.rc');
  if (capabilityError) return capabilityError;
  const rows = await env.DB.prepare(
    `SELECT id, document_type, sunat_status, total_amount_cents
     FROM sales
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND sunat_status IN ('REJECTED','QUARANTINED','DEADLINE_EXCEEDED')
     ORDER BY issued_at_lima DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      document_type: string;
      sunat_status: string;
      total_amount_cents: number;
    }>();
  return {
    status: 200,
    body: {
      items: (rows.results ?? []).map((r) => ({
        saleId: r.id,
        documentType: r.document_type,
        sunatStatus: r.sunat_status,
        totalCents: r.total_amount_cents,
        suggestCreditNoteEa: true,
      })),
    },
  };
}

export async function runCreditNoteEaHttp(
  env: WorkerEnv,
  tenantId: string,
  userId: string,
  body: {
    originSaleId?: string;
    confirmed?: boolean;
    motiveCode?: string;
    series?: string;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!tenantId) {
    return { status: 401, body: { error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' } };
  }
  if (!body.confirmed) {
    return {
      status: 400,
      body: { error: 'EA_CONFIRMATION_REQUIRED', code: 'EA_CONFIRMATION_REQUIRED' },
    };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const capabilityError = await requireFiscalCapability(env, tenantId, 'fiscal.cpe_portal');
  if (capabilityError) return capabilityError;
  const originSaleId = body.originSaleId ?? '';
  const series = body.series ?? 'FC01';
  const motiveCode = body.motiveCode ?? '01';
  try {
    const origin = await env.DB.prepare(
      `SELECT total_amount_cents FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    )
      .bind(originSaleId, tenantId)
      .first<{ total_amount_cents: number }>();
    if (!origin) {
      return { status: 404, body: { error: 'SALE_NOT_FOUND', code: 'SALE_NOT_FOUND' } };
    }
    const [ledgerArApEnabled, chartOfAccountsEnabled, salesCommissionsEnabled] = await Promise.all([
      optionalCapability(env, tenantId, 'ledger.accounts_receivable'),
      optionalCapability(env, tenantId, 'ledger.chart_of_accounts'),
      optionalCapability(env, tenantId, 'sales.commissions'),
    ]);
    const result = await processCreditNoteAtomic(
      asD1(env.DB),
      tenantId,
      userId,
      originSaleId,
      {
        motiveCode,
        amountCents: origin.total_amount_cents,
        fullCancellation: true,
        items: [],
      },
      series,
      {
        ledgerArApEnabled,
        chartOfAccountsEnabled,
        salesCommissionsEnabled,
      },
    );
    return {
      status: 200,
      body: {
        creditNoteSaleId: result.creditNoteSaleId,
        requiresNoCdrAudit: result.requiresNoCdrAudit,
      },
    };
  } catch (e) {
    if (e instanceof CapabilityError) {
      return { status: 503, body: { error: e.code, code: e.code } };
    }
    const msg = e instanceof Error ? e.message : 'NC_FAILED';
    return { status: 400, body: { error: msg, code: msg } };
  }
}
