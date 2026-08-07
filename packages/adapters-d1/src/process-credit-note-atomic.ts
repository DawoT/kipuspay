/**
 * processCreditNoteAtomic — NC 07 (Sprint 5 E-A / E-B + Sprint 8 E-D).
 * Inserta NC referenciando origen; audita CREDIT_NOTE_NO_CDR; restaura stock salvo uncatalogued;
 * compensa CxC del origen en la misma tx cuando FEATURE_LEDGER_AR_AP.
 */
import {
  assertCreditNoteAllowed,
  stockRestoreQuantity,
  type CreditNoteRequest,
} from '@kipuspay/domain-fiscal-pe';
import { compensateArOnCreditNote } from '@kipuspay/domain-cash';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface CreditNoteResult {
  readonly status: 'SUCCESS';
  readonly creditNoteSaleId: string;
  readonly requiresNoCdrAudit: boolean;
}

export interface ProcessCreditNoteOptions {
  readonly ledgerArApEnabled?: boolean;
}

export async function processCreditNoteAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  originSaleId: string,
  request: CreditNoteRequest,
  series: string,
  options: ProcessCreditNoteOptions = {},
): Promise<CreditNoteResult> {
  const ledgerOn = options.ledgerArApEnabled === true;
  const origin = await db
    .prepare(
      `SELECT id, document_type, sunat_status, total_amount_cents, branch_id,
              cash_register_session_id, client_document_type, client_document_number, client_name
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    )
    .bind(originSaleId, tenantId)
    .first<{
      id: string;
      document_type: string;
      sunat_status: string;
      total_amount_cents: number;
      branch_id: string;
      cash_register_session_id: string;
      client_document_type: string;
      client_document_number: string;
      client_name: string;
    }>();
  if (!origin) throw new Error('ORIGIN_NOT_FOUND');

  const priorNc = await db
    .prepare(
      `SELECT COALESCE(SUM(total_amount_cents), 0) AS used
       FROM sales
       WHERE tenant_id = ? AND referenced_sale_id = ? AND document_type = '07'
         AND deleted_at IS NULL`,
    )
    .bind(tenantId, originSaleId)
    .first<{ used: number }>();
  const residual = origin.total_amount_cents - (priorNc?.used ?? 0);

  const gate = assertCreditNoteAllowed(
    {
      saleId: origin.id,
      documentType: origin.document_type,
      sunatStatus: origin.sunat_status as
        | 'PENDING'
        | 'PROCESSING'
        | 'ACCEPTED'
        | 'REJECTED'
        | 'QUARANTINED'
        | 'DEADLINE_EXCEEDED'
        | 'NOT_APPLICABLE',
      totalAmountCents: origin.total_amount_cents,
      residualCents: residual,
    },
    request,
  );

  const seriesRow = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = '07'
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, origin.branch_id, series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!seriesRow) throw new Error('SERIES_NOT_FOUND');

  const ncId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const prevHash = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const rowHash = await crypto.subtle
    .digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({
          action: gate.requiresNoCdrAudit ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE',
          entity_id: originSaleId,
          prev: prevHash?.row_hash ?? null,
        }),
      ),
    )
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));

  let arCompensate: ReturnType<typeof compensateArOnCreditNote> | undefined;
  if (ledgerOn) {
    const arRow = await db
      .prepare(
        `SELECT id, balance_due_cents FROM accounts_receivable
         WHERE tenant_id = ? AND sale_id = ? AND balance_due_cents > 0 LIMIT 1`,
      )
      .bind(tenantId, originSaleId)
      .first<{ id: string; balance_due_cents: number }>();
    if (arRow) {
      arCompensate = compensateArOnCreditNote({
        accountsReceivableId: arRow.id,
        originSaleId,
        currentBalanceCents: arRow.balance_due_cents,
        creditAmountCents: request.amountCents,
        paymentId: crypto.randomUUID(),
        collectedByUserId: userId,
        source: 'CREDIT_NOTE',
      });
    }
  }

  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(seriesRow.id, tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sales (
               id, tenant_id, branch_id, cash_register_session_id, user_id,
               client_document_type, client_document_number, client_name,
               document_type, series, number, currency, exchange_rate,
               total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
               total_discount_cents, total_cogs_cents, total_amount_cents,
               referenced_sale_id, credit_note_motive_code, sunat_status, issued_at_lima
             )
             SELECT
               ?, ?, ?, ?, ?, ?, ?, ?, '07', ?,
               (SELECT current_number FROM branch_document_series WHERE id = ?),
               'PEN', 1.0, 0, 0, 0, 0, 0, 0, ?, ?, ?, 'PENDING', ?`,
        )
        .bind(
          ncId,
          tenantId,
          origin.branch_id,
          origin.cash_register_session_id,
          userId,
          origin.client_document_type,
          origin.client_document_number,
          origin.client_name,
          series,
          seriesRow.id,
          request.amountCents,
          originSaleId,
          request.motiveCode,
          new Date().toISOString().replace('T', ' ').substring(0, 19),
        ),
    );

    if (gate.requiresNoCdrAudit) {
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
                 id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, ?, 'CREDIT_NOTE_NO_CDR', 'sale', ?, ?, ?, ?)`,
          )
          .bind(
            auditId,
            tenantId,
            origin.branch_id,
            userId,
            originSaleId,
            JSON.stringify({ sourceStatus: origin.sunat_status, total: request.amountCents }),
            prevHash?.row_hash ?? null,
            rowHash,
          ),
      );
    }

    for (const item of request.items) {
      const restore = stockRestoreQuantity(item);
      if (restore <= 0) continue;
      plan.add(
        db
          .prepare(
            `UPDATE branch_product_stock
               SET stock = stock + ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(restore, tenantId, origin.branch_id, item.productId),
      );
    }

    if (arCompensate) {
      plan.add(
        db
          .prepare(
            `INSERT INTO accounts_receivable_payments (
                 id, accounts_receivable_id, amount_cents, payment_method,
                 cash_register_session_id, collected_by_user_id
               ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            arCompensate.paymentId,
            arCompensate.accountsReceivableId,
            arCompensate.appliedCents,
            arCompensate.paymentMethod,
            origin.cash_register_session_id,
            arCompensate.collectedByUserId,
          ),
      );
      plan.add(
        db
          .prepare(
            `UPDATE accounts_receivable
               SET balance_due_cents = ?, status = ?
             WHERE id = ? AND tenant_id = ? AND balance_due_cents > 0`,
          )
          .bind(
            arCompensate.nextBalanceCents,
            arCompensate.nextStatus,
            arCompensate.accountsReceivableId,
            tenantId,
          ),
      );
    }
  });

  return {
    status: 'SUCCESS',
    creditNoteSaleId: ncId,
    requiresNoCdrAudit: gate.requiresNoCdrAudit,
  };
}
