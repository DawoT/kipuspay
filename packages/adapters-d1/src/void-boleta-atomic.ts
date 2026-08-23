/**
 * voidBoletaAtomic — baja E-C (FIS). No toca stock ni caja.
 */
import {
  assertVoidBoletaAllowed,
  summaryDateLima,
  type VoidStatus,
} from '@kipuspay/domain-fiscal-pe';
import { appendAuditEvent } from './audit-chain.js';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface VoidBoletaResult {
  readonly status: 'SUCCESS';
  readonly voidStatus: 'VOID_PENDING_RC';
  readonly stockBefore: number;
  readonly stockAfter: number;
  readonly cashSessionStatus: string;
}

async function resolveDailySummaryStatus(
  db: D1DatabaseLike,
  tenantId: string,
  dailySummaryId: string | null,
  issuedAtLima: string,
): Promise<string | null> {
  if (dailySummaryId) {
    const rc = await db
      .prepare(`SELECT status FROM sunat_daily_summaries WHERE id = ? AND tenant_id = ?`)
      .bind(dailySummaryId, tenantId)
      .first<{ status: string }>();
    return rc?.status ?? null;
  }
  const day = summaryDateLima(Date.parse(issuedAtLima));
  const rc = await db
    .prepare(
      `SELECT status FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ? AND rc_type = 'PRIMARY'`,
    )
    .bind(tenantId, day)
    .first<{ status: string }>();
  return rc?.status ?? null;
}

function voidGuardThrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : 'VOID_DENIED';
  if (msg === 'VOID_AFTER_RC_SENT') throw new Error('VOID_AFTER_RC_SENT', { cause: e });
  throw e;
}

async function readBranchStock(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
): Promise<number> {
  const stockRow = await db
    .prepare(
      `SELECT COALESCE(SUM(bps.stock), 0) AS stock
       FROM branch_product_stock bps
       WHERE bps.tenant_id = ? AND bps.branch_id = ?`,
    )
    .bind(tenantId, branchId)
    .first<{ stock: number }>();
  return stockRow ? stockRow.stock : 0;
}

async function readSessionStatus(
  db: D1DatabaseLike,
  tenantId: string,
  sessionId: string,
): Promise<string> {
  const session = await db
    .prepare(`SELECT status FROM cash_register_sessions WHERE id = ? AND tenant_id = ?`)
    .bind(sessionId, tenantId)
    .first<{ status: string }>();
  return session ? session.status : 'UNKNOWN';
}

function assertNoVoidRace(
  stockBefore: number,
  stockAfter: number,
  cashStatus: string,
  sessionAfter: string | null,
): void {
  if (stockAfter !== stockBefore) throw new Error('VOID_STOCK_MUTATED');
  if ((sessionAfter ?? '') !== cashStatus) throw new Error('VOID_CASH_MUTATED');
}

export async function voidBoletaAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  saleId: string,
  userId = 'system',
): Promise<VoidBoletaResult> {
  const sale = await db
    .prepare(
      `SELECT id, document_type, void_status, issued_at_lima, daily_summary_id, branch_id,
              cash_register_session_id
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    )
    .bind(saleId, tenantId)
    .first<{
      id: string;
      document_type: string;
      void_status: string;
      issued_at_lima: string;
      daily_summary_id: string | null;
      branch_id: string;
      cash_register_session_id: string;
    }>();
  if (!sale) throw new Error('SALE_NOT_FOUND');

  const dailySummaryStatus = await resolveDailySummaryStatus(
    db,
    tenantId,
    sale.daily_summary_id,
    sale.issued_at_lima,
  );

  try {
    assertVoidBoletaAllowed({
      documentType: sale.document_type,
      voidStatus: sale.void_status as VoidStatus,
      dailySummaryStatus,
    });
  } catch (e) {
    voidGuardThrow(e);
  }

  const stockBefore = await readBranchStock(db, tenantId, sale.branch_id);

  const cashStatus = await readSessionStatus(db, tenantId, sale.cash_register_session_id);

  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE sales SET void_status = 'VOID_PENDING_RC'
           WHERE id = ? AND tenant_id = ? AND void_status = 'NONE'`,
        )
        .bind(saleId, tenantId),
    );
  });

  const stockAfter = await readBranchStock(db, tenantId, sale.branch_id);

  const sessionAfter = await db
    .prepare(`SELECT status FROM cash_register_sessions WHERE id = ? AND tenant_id = ?`)
    .bind(sale.cash_register_session_id, tenantId)
    .first<{ status: string }>();
  assertNoVoidRace(stockBefore, stockAfter, cashStatus, sessionAfter ? sessionAfter.status : null);

  // S17-H3: toda baja de boleta genera audit_events VOID (cadena hash, append-only).
  await appendAuditEvent(db, { tenantId }, async (prev) => ({
    id: crypto.randomUUID(),
    branchId: sale.branch_id,
    actorUserId: userId,
    action: 'VOID',
    entityType: 'sale',
    entityId: saleId,
    payloadJson: JSON.stringify({
      voidStatus: 'VOID_PENDING_RC',
      documentType: sale.document_type,
    }),
    prevHash: prev,
    rowHash: await sha256Hex(JSON.stringify({ action: 'VOID', entity_id: saleId, prev })),
  }));

  return {
    status: 'SUCCESS',
    voidStatus: 'VOID_PENDING_RC',
    stockBefore,
    stockAfter,
    cashSessionStatus: cashStatus,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
