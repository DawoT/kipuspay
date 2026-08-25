/**
 * Endpoint de Auditoría DLQ Fiscal (Sprint 64).
 * Permite a dueños y administradores auditar comprobantes en cuarentena, fallidos
 * y con plazo legal de envío vencido (DEADLINE_EXCEEDED), sugiriendo anulación
 * por Nota de Crédito E-A según corresponda.
 */
import type { WorkerEnv } from '../auth/control-plane.js';

export interface FiscalDlqItem {
  readonly id: string;
  readonly saleId?: string;
  readonly entityId?: string;
  readonly outboxId?: string | null;
  readonly entityType: 'sale' | 'non_sale';
  readonly documentType: string;
  readonly series?: string | null;
  readonly number?: number | null;
  readonly status: 'QUARANTINED' | 'FAILED' | 'DEADLINE_EXCEEDED' | 'REJECTED';
  readonly reason: string;
  readonly attemptCount: number;
  readonly mustSubmitBy?: string | null;
  readonly totalCents?: number | null;
  readonly suggestCreditNoteEa: boolean;
  readonly createdAt?: string | null;
}

export interface FiscalDlqMetrics {
  readonly quarantined: number;
  readonly failed: number;
  readonly deadlineExceeded: number;
  readonly total: number;
}

export interface FiscalDlqStatusResponseBody {
  readonly summary: FiscalDlqMetrics;
  readonly metrics: FiscalDlqMetrics;
  readonly items: readonly FiscalDlqItem[];
  readonly nonSaleItems: readonly FiscalDlqItem[];
}

function isOwnerOrAdmin(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

function canSuggestCreditNoteEa(status: string, documentType: string): boolean {
  // Excepción E-A: Comprobantes de venta CPE (01, 03, 07, 08) en REJECTED / QUARANTINED / DEADLINE_EXCEEDED
  const validStatuses = ['REJECTED', 'QUARANTINED', 'DEADLINE_EXCEEDED'];
  const validDocTypes = ['01', '03', '07', '08'];
  return validStatuses.includes(status) && validDocTypes.includes(documentType);
}

export async function runGetFiscalDlqStatusHttp(
  env: WorkerEnv,
  tenantId: string,
  userRole: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isOwnerOrAdmin(userRole)) {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  }

  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }

  // Multi-tenant DAT-12: Todas las consultas aíslan estrictamente con WHERE tenant_id = ?
  const salesRows = await env.DB.prepare(
    `SELECT 
       s.id,
       s.document_type,
       s.series,
       s.number,
       s.sunat_status,
       s.sunat_response_code,
       s.sunat_error_message,
       s.total_amount_cents,
       s.issued_at_lima,
       s.must_submit_by,
       s.created_at,
       o.id AS outbox_id,
       o.status AS outbox_status,
       o.attempt_count AS outbox_attempt_count,
       o.last_error AS outbox_last_error,
       o.quarantine_reason AS outbox_quarantine_reason
     FROM sales s
     LEFT JOIN fiscal_outbox o ON o.sale_id = s.id AND o.tenant_id = s.tenant_id
     WHERE s.tenant_id = ?
       AND s.deleted_at IS NULL
       AND (
         s.sunat_status IN ('QUARANTINED', 'FAILED', 'DEADLINE_EXCEEDED', 'REJECTED')
         OR o.status IN ('QUARANTINED', 'FAILED')
       )
     ORDER BY s.issued_at_lima DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      document_type: string;
      series: string;
      number: number;
      sunat_status: string;
      sunat_response_code: string | null;
      sunat_error_message: string | null;
      total_amount_cents: number;
      issued_at_lima: string;
      must_submit_by: string | null;
      created_at: string;
      outbox_id: string | null;
      outbox_status: string | null;
      outbox_attempt_count: number | null;
      outbox_last_error: string | null;
      outbox_quarantine_reason: string | null;
    }>();

  const nonSaleRows = await env.DB.prepare(
    `SELECT 
       id,
       tenant_id,
       document_type,
       entity_id,
       status,
       attempt_count,
       must_submit_by,
       last_error,
       quarantine_reason,
       created_at
     FROM fiscal_non_sale_outbox
     WHERE tenant_id = ?
       AND status IN ('QUARANTINED', 'FAILED')
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      tenant_id: string;
      document_type: string;
      entity_id: string;
      status: string;
      attempt_count: number;
      must_submit_by: string | null;
      last_error: string | null;
      quarantine_reason: string | null;
      created_at: string;
    }>();

  const saleItems: FiscalDlqItem[] = (salesRows.results ?? []).map((r) => {
    let effectiveStatus: FiscalDlqItem['status'] = 'FAILED';
    if (r.sunat_status === 'DEADLINE_EXCEEDED' || r.outbox_last_error === 'DEADLINE_EXCEEDED') {
      effectiveStatus = 'DEADLINE_EXCEEDED';
    } else if (r.sunat_status === 'QUARANTINED' || r.outbox_status === 'QUARANTINED') {
      effectiveStatus = 'QUARANTINED';
    } else if (r.sunat_status === 'REJECTED') {
      effectiveStatus = 'REJECTED';
    } else if (r.outbox_status === 'FAILED' || r.sunat_status === 'FAILED') {
      effectiveStatus = 'FAILED';
    }

    const reason =
      r.outbox_quarantine_reason ||
      r.outbox_last_error ||
      r.sunat_error_message ||
      r.sunat_response_code ||
      effectiveStatus;

    return {
      id: r.id,
      saleId: r.id,
      outboxId: r.outbox_id,
      entityType: 'sale',
      documentType: r.document_type,
      series: r.series,
      number: r.number,
      status: effectiveStatus,
      reason,
      attemptCount: r.outbox_attempt_count ?? 0,
      mustSubmitBy: r.must_submit_by,
      totalCents: r.total_amount_cents,
      suggestCreditNoteEa: canSuggestCreditNoteEa(effectiveStatus, r.document_type),
      createdAt: r.created_at,
    };
  });

  const nonSaleItems: FiscalDlqItem[] = (nonSaleRows.results ?? []).map((r) => {
    const effectiveStatus: FiscalDlqItem['status'] =
      r.status === 'QUARANTINED' ? 'QUARANTINED' : 'FAILED';
    const reason = r.quarantine_reason || r.last_error || 'NON_SALE_ERROR';

    return {
      id: r.id,
      entityId: r.entity_id,
      outboxId: r.id,
      entityType: 'non_sale',
      documentType: r.document_type,
      status: effectiveStatus,
      reason,
      attemptCount: r.attempt_count ?? 0,
      mustSubmitBy: r.must_submit_by,
      totalCents: null,
      suggestCreditNoteEa: false,
      createdAt: r.created_at,
    };
  });

  let quarantined = 0;
  let failed = 0;
  let deadlineExceeded = 0;

  for (const item of saleItems) {
    if (item.status === 'QUARANTINED') {
      quarantined += 1;
    } else if (item.status === 'DEADLINE_EXCEEDED') {
      deadlineExceeded += 1;
    } else {
      failed += 1;
    }
  }

  for (const item of nonSaleItems) {
    if (item.status === 'QUARANTINED') {
      quarantined += 1;
    } else {
      failed += 1;
    }
  }

  const total = quarantined + failed + deadlineExceeded;
  const metrics: FiscalDlqMetrics = {
    quarantined,
    failed,
    deadlineExceeded,
    total,
  };

  const responseBody: FiscalDlqStatusResponseBody = {
    summary: metrics,
    metrics,
    items: [...saleItems, ...nonSaleItems],
    nonSaleItems,
  };

  return {
    status: 200,
    body: responseBody as unknown as Record<string, unknown>,
  };
}
