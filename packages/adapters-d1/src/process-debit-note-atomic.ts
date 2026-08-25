/**
 * processDebitNoteAtomic — Nota de Débito `08` (Arquitectura §5.1 regla 5,
 * §5.2, ADR-FISCAL-003, FIS-13).
 *
 * La ND incrementa el valor de un comprobante ACEPTADO (factura/boleta) por
 * motivos del catálogo 10; NO toca stock (solo impuestos y saldos). Correlativo
 * server-side dentro del batch con guardState (anti doble-emisión), audit
 * DEBIT_NOTE con hash-chain y `must_submit_by` según el documento que ajusta
 * (factura +3d / boleta +7d — §5.2). Si ledger AR está activo, la diferencia
 * queda como saldo por cobrar.
 */
import {
  assertDebitNoteAllowed,
  classifyUnitaryXmlTarget,
  computeMustSubmitByIso,
  type DebitNoteRequest,
  type DocumentTypeCode,
} from '@kipuspay/domain-fiscal-pe';
import { splitInclusiveIgvCents } from '@kipuspay/domain-sales';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';

export interface DebitNoteOptions {
  readonly ledgerArApEnabled?: boolean;
}

export interface DebitNoteResult {
  readonly debitNoteId: string;
  readonly documentType: '08';
  readonly series: string;
  readonly number: number;
  readonly amountCents: number;
  readonly motiveCode: string;
  readonly mustSubmitByIso: string;
  readonly requiresNoCdrAudit: boolean;
}

interface OriginRow {
  id: string;
  document_type: string;
  sunat_status: string;
  total_amount_cents: number;
  branch_id: string;
  cash_register_session_id: string | null;
  client_document_type: string | null;
  client_document_number: string | null;
  client_name: string | null;
}

export async function processDebitNoteAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  originSaleId: string,
  request: DebitNoteRequest,
  series: string,
  options: DebitNoteOptions = {},
): Promise<DebitNoteResult> {
  const origin = await db
    .prepare(
      `SELECT id, document_type, sunat_status, total_amount_cents, branch_id,
              cash_register_session_id, client_document_type, client_document_number, client_name
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    )
    .bind(originSaleId, tenantId)
    .first<OriginRow>();
  if (!origin) throw new Error('ORIGIN_NOT_FOUND');

  const gate = assertDebitNoteAllowed(
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
    },
    request,
  );
  if (!gate.ok) throw new Error(gate.code);

  const seriesRow = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = '08'
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, origin.branch_id, series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!seriesRow) throw new Error('SERIES_NOT_FOUND');

  const debitNoteId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const prevHash = await db
    .prepare(`SELECT last_hash AS row_hash FROM audit_chain_heads WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ row_hash: string | null }>();
  const rowHash = await crypto.subtle
    .digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({
          action: 'DEBIT_NOTE',
          entity_id: originSaleId,
          prev: prevHash?.row_hash ?? null,
        }),
      ),
    )
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));

  const issuedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const { taxableCents, igvCents } = splitInclusiveIgvCents(request.amountCents);
  const originDoc = origin.document_type as DocumentTypeCode;
  const xmlChannel = classifyUnitaryXmlTarget('08', originDoc);
  const mustSubmitByIso = computeMustSubmitByIso(
    origin.document_type === '01' ? '01' : '03',
    Date.parse(issuedAt.replace(' ', 'T')),
  );
  if (!mustSubmitByIso) throw new Error('MUST_SUBMIT_UNRESOLVED');

  let arPlan: { arId: string; balanceCents: number } | undefined;
  if (options.ledgerArApEnabled === true) {
    const ar = await db
      .prepare(
        `SELECT id, balance_due_cents FROM accounts_receivable
         WHERE tenant_id = ? AND sale_id = ? LIMIT 1`,
      )
      .bind(tenantId, originSaleId)
      .first<{ id: string; balance_due_cents: number }>();
    if (ar) {
      arPlan = {
        arId: ar.id,
        balanceCents: ar.balance_due_cents + request.amountCents,
      };
    }
  }

  const build = (plan: AtomicPlanBuilder): void => {
    // Guard optimista (§6): la serie no se mueve concurrentemente y el origen
    // sigue ACCEPTED dentro del batch (un borrado/NC paralela aborta la ND).
    plan.guardState(
      `SELECT 1 FROM branch_document_series
       WHERE id = ? AND tenant_id = ? AND current_number = ?
       AND EXISTS (SELECT 1 FROM sales s
                   WHERE s.id = ? AND s.tenant_id = ? AND s.deleted_at IS NULL
                     AND s.sunat_status = 'ACCEPTED')`,
      [seriesRow.id, tenantId, seriesRow.current_number, originSaleId, tenantId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series
           SET current_number = current_number + 1
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
               referenced_sale_id, credit_note_motive_code, sunat_status, issued_at_lima,
               must_submit_by
             )
             SELECT
               ?, ?, ?, ?, ?, ?, ?, ?, '08', ?,
               (SELECT current_number FROM branch_document_series WHERE id = ?),
               'PEN', 1.0, ?, 0, ?, 0, 0, 0, ?, ?, ?, 'PENDING', ?, ?`,
        )
        .bind(
          debitNoteId,
          tenantId,
          origin.branch_id,
          origin.cash_register_session_id,
          userId,
          origin.client_document_type,
          origin.client_document_number,
          origin.client_name,
          series,
          seriesRow.id,
          taxableCents,
          igvCents,
          request.amountCents,
          originSaleId,
          request.motiveCode,
          issuedAt,
          mustSubmitByIso,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'DEBIT_NOTE', 'sale', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          origin.branch_id,
          userId,
          originSaleId,
          JSON.stringify({
            sourceStatus: origin.sunat_status,
            amountCents: request.amountCents,
            motiveCode: request.motiveCode,
            description: request.description ?? null,
          }),
          prevHash?.row_hash ?? null,
          rowHash,
        ),
    );
    plan.claimAuditChain(tenantId, prevHash?.row_hash ?? null, [rowHash]);
    if (arPlan) {
      plan.add(
        db
          .prepare(
            `UPDATE accounts_receivable SET balance_due_cents = ?
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(arPlan.balanceCents, arPlan.arId, tenantId),
      );
    }

    // GTM §4.1: las Notas de Débito ('08') consumen 1 comprobante de cupo
    // (S10-C6 — fe de errata: el proceso no metía el documento).
    appendUsageMeterToPlan(plan, db, {
      tenantId,
      documentId: debitNoteId,
      documentType: '08',
    });

    // Canal UNIT_XML (ND de factura): la envía el drain unitario. Canal RC
    // (ND de boleta, spec §5.2): fila PENDING que el drain libera (SKIP_RC)
    // y el cron del Resumen Diario entrega vía buildDailySummary → CDR.
    // Canal NONE: fail-closed — sin canal resuelto no hay cola.
    if (xmlChannel !== 'NONE') {
      plan.add(
        db
          .prepare(
            `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
             VALUES (?, ?, ?, 'PENDING', ?)`,
          )
          .bind(crypto.randomUUID(), tenantId, debitNoteId, mustSubmitByIso),
      );
    }
  };
  await runD1AtomicPlan(db, build);

  return {
    debitNoteId,
    documentType: '08',
    series: seriesRow.series,
    number: seriesRow.current_number + 1,
    amountCents: request.amountCents,
    motiveCode: request.motiveCode,
    mustSubmitByIso,
    requiresNoCdrAudit: false,
  };
}
