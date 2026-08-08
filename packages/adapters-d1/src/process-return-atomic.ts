/**
 * processReturnAtomic — Sprint 28 sales.returns (§5.3 regla 13).
 * Un solo db.batch: doc 07|NV_RETURN + sales_returns + stock/PMP + CxC E-D + cash + audit RETURN + cupo.
 */
/* eslint-disable complexity -- orquestador multi-rama 07/NV_RETURN + PMP + cash + E-D; split diferido */
import {
  assertNcCanIssueStoreCredit,
  compensateArOnCreditNote,
  ncStoreCreditSourceRef,
  planSalesReturnJournal,
  planStoreCreditIssue,
} from '@kipuspay/domain-cash';
import { assertCreditNoteAllowed, defaultSunatStatus } from '@kipuspay/domain-fiscal-pe';
import { QUANTITY_SCALE, refreshAvgCostCents } from '@kipuspay/domain-inventory';
import {
  assertReturnReason,
  assertReturnWithinWindow,
  parseReturnPolicyRow,
  planReturnLines,
  resolveReturnDocType,
  sumReturnRefundCents,
  type PlannedReturnLine,
  type ReturnDocType,
  type ReturnLineRequest,
} from '@kipuspay/domain-sales';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';
import {
  appendStoreCreditIssueToPlan,
  ensureStoreCreditAccount,
} from './process-store-credit-atomic.js';
import { appendCancelPendingInstallmentsOnArClosed } from './process-installment-atomic.js';
import { appendCommissionReverseWithJournal } from './process-commission-atomic.js';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';

export interface ProcessReturnInput {
  readonly originSaleId: string;
  readonly lines: readonly ReturnLineRequest[];
  readonly reason: string;
  readonly series: string;
  readonly nowMs?: number;
  readonly authorizedByUserId?: string | null;
  readonly authThresholdCents?: number;
  /** Sesión de caja abierta actual (si el origen tiene turno cerrado). */
  readonly cashRegisterSessionId?: string | null;
  /** Sprint 35: NC sin reembolso → crédito de tienda (consentimiento). */
  readonly consentStoreCredit?: boolean;
}

export interface ProcessReturnOptions {
  readonly ledgerArApEnabled?: boolean;
  readonly chartOfAccountsEnabled?: boolean;
  readonly storeCreditEnabled?: boolean;
  /** Sprint 37 — FEATURE_SALES_COMMISSIONS: reverse accruals on origin (COM-07). */
  readonly salesCommissionsEnabled?: boolean;
}

export interface ProcessReturnResult {
  readonly status: 'SUCCESS';
  readonly returnId: string;
  readonly documentSaleId: string;
  readonly docType: ReturnDocType;
  readonly refundAmountCents: number;
  readonly refundMovementId: string | null;
  readonly storeCreditTxnId?: string | null;
}

function normalizePaymentMethod(code: string): string {
  const c = code.trim().toLowerCase();
  if (c.includes('cash') || c === 'efectivo') return 'cash';
  if (c.includes('card') || c.includes('tarjeta') || c.includes('visa') || c.includes('culqi')) {
    return 'card';
  }
  if (c.includes('credit') || c.includes('credito') || c === 'cxc') return 'credit';
  return c || 'cash';
}

function parseIssuedAtMs(issuedAtLima: string): number {
  const iso = issuedAtLima.includes('T') ? issuedAtLima : issuedAtLima.replace(' ', 'T');
  const ms = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isFinite(ms)) throw new Error('ORIGIN_ISSUED_AT_INVALID');
  return ms;
}

async function sha256Hex(payload: Record<string, unknown>): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function processReturnAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessReturnInput,
  options: ProcessReturnOptions = {},
): Promise<ProcessReturnResult> {
  const ledgerOn = options.ledgerArApEnabled === true;
  const chartOn = options.chartOfAccountsEnabled === true;
  const commissionsOn = options.salesCommissionsEnabled === true;
  const nowMs = input.nowMs ?? Date.now();
  assertReturnReason(input.reason);

  const origin = await db
    .prepare(
      `SELECT s.id, s.document_type, s.sunat_status, s.total_amount_cents, s.branch_id,
              s.cash_register_session_id, s.customer_id, s.client_document_type,
              s.client_document_number, s.client_name, s.issued_at_lima, t.formalization_mode
       FROM sales s
       JOIN tenants t ON t.id = s.tenant_id
       WHERE s.id = ? AND s.tenant_id = ? AND s.deleted_at IS NULL`,
    )
    .bind(input.originSaleId, tenantId)
    .first<{
      id: string;
      document_type: string;
      sunat_status: string;
      total_amount_cents: number;
      branch_id: string;
      cash_register_session_id: string;
      customer_id: string | null;
      client_document_type: string;
      client_document_number: string;
      client_name: string;
      issued_at_lima: string;
      formalization_mode: string;
    }>();
  if (!origin) throw new Error('ORIGIN_NOT_FOUND');

  const policyRow = await db
    .prepare(
      `SELECT window_days, by_payment_method_json, refund_to_original_method, allow_turn_closed_with_auth
       FROM return_policies WHERE tenant_id = ?`,
    )
    .bind(tenantId)
    .first<{
      window_days: number;
      by_payment_method_json: string;
      refund_to_original_method: number;
      allow_turn_closed_with_auth: number;
    }>();
  const policy = parseReturnPolicyRow(policyRow);

  const payRow = await db
    .prepare(
      `SELECT pm.code AS code, sp.amount_cents AS amount_cents
       FROM sale_payments sp
       JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
       WHERE sp.tenant_id = ? AND sp.sale_id = ?
       ORDER BY sp.amount_cents DESC LIMIT 1`,
    )
    .bind(tenantId, input.originSaleId)
    .first<{ code: string; amount_cents: number }>();
  const paymentMethod = normalizePaymentMethod(payRow?.code ?? 'cash');

  assertReturnWithinWindow({
    issuedAtMs: parseIssuedAtMs(origin.issued_at_lima),
    nowMs,
    policy,
    paymentMethod,
  });

  const sessionId = input.cashRegisterSessionId ?? origin.cash_register_session_id;
  const session = await db
    .prepare(
      `SELECT id, status FROM cash_register_sessions
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(sessionId, tenantId)
    .first<{ id: string; status: string }>();
  if (!session) throw new Error('SESSION_NOT_FOUND');
  const sessionClosed = session.status !== 'OPEN';
  if (sessionClosed && !policy.allowTurnClosedWithAuth) {
    throw new Error('SESSION_CLOSED');
  }
  if (sessionClosed && !input.authorizedByUserId) {
    throw new Error('AUTH_REQUIRED');
  }

  const itemsRes = await db
    .prepare(
      `SELECT id, product_id, quantity, unit_price_cents, unit_cost_cents, batch_id,
              is_uncatalogued, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
              total_amount_cents
       FROM sale_items WHERE tenant_id = ? AND sale_id = ?`,
    )
    .bind(tenantId, input.originSaleId)
    .all<{
      id: string;
      product_id: string | null;
      quantity: number;
      unit_price_cents: number;
      unit_cost_cents: number;
      batch_id: string | null;
      is_uncatalogued: number;
      igv_affectation_code: string;
      igv_amount_cents: number;
      icbper_amount_cents: number;
      total_amount_cents: number;
    }>();
  const originItems = itemsRes.results ?? [];

  const returnedRes = await db
    .prepare(
      `SELECT sri.original_sale_item_id AS original_sale_item_id,
              COALESCE(SUM(sri.qty), 0) AS qty
       FROM sale_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id AND sr.tenant_id = sri.tenant_id
       WHERE sri.tenant_id = ? AND sr.sale_id = ?
       GROUP BY sri.original_sale_item_id`,
    )
    .bind(tenantId, input.originSaleId)
    .all<{ original_sale_item_id: string; qty: number }>();
  const alreadyByItem = new Map(
    (returnedRes.results ?? []).map((r) => [r.original_sale_item_id, r.qty]),
  );

  const planned = planReturnLines(
    input.lines,
    originItems.map((row) => ({
      id: row.id,
      productId: row.product_id ?? '',
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      unitCostCents: row.unit_cost_cents,
      batchId: row.batch_id,
      isUncatalogued: row.is_uncatalogued === 1,
      igvAffectationCode: row.igv_affectation_code,
      igvAmountCents: row.igv_amount_cents,
      icbperAmountCents: row.icbper_amount_cents,
      totalAmountCents: row.total_amount_cents,
      alreadyReturnedQty: alreadyByItem.get(row.id) ?? 0,
    })),
  );
  const refundAmountCents = sumReturnRefundCents(planned);
  if (refundAmountCents <= 0) throw new Error('INVALID_RETURN_AMOUNT');

  const threshold = input.authThresholdCents ?? 50_000;
  if (refundAmountCents > threshold && !input.authorizedByUserId) {
    throw new Error('AUTH_REQUIRED');
  }

  const docType = resolveReturnDocType(origin.formalization_mode);
  if (docType === '07') {
    const priorNc = await db
      .prepare(
        `SELECT COALESCE(SUM(total_amount_cents), 0) AS used
         FROM sales
         WHERE tenant_id = ? AND referenced_sale_id = ? AND document_type = '07'
           AND deleted_at IS NULL`,
      )
      .bind(tenantId, input.originSaleId)
      .first<{ used: number }>();
    const residual = origin.total_amount_cents - (priorNc?.used ?? 0);
    assertCreditNoteAllowed(
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
      {
        motiveCode: '07',
        amountCents: refundAmountCents,
        fullCancellation: refundAmountCents >= residual,
        items: planned.map((l) => ({
          productId: l.productId,
          quantity: l.qty,
          isUncatalogued: l.isUncatalogued,
        })),
      },
    );
  } else if (origin.document_type !== 'NV' && origin.document_type !== 'NV_RETURN') {
    // NV_RETURN solo sobre NV en control interno.
    throw new Error('NV_RETURN_REQUIRES_NV_ORIGIN');
  }

  const seriesDocCode = docType;
  const seriesRow = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, origin.branch_id, seriesDocCode, input.series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!seriesRow) throw new Error('SERIES_NOT_FOUND');

  const stockPlans: {
    line: PlannedReturnLine;
    newPmp: number;
    exists: boolean;
  }[] = [];
  for (const line of planned) {
    if (!line.restoreStock || !line.productId) continue;
    const snap = await db
      .prepare(
        `SELECT stock, pmp_unit_cost_cents FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, origin.branch_id, line.productId)
      .first<{ stock: number; pmp_unit_cost_cents: number }>();
    const prevStock = snap?.stock ?? 0;
    const prevPmp = snap?.pmp_unit_cost_cents ?? 0;
    const newPmp = refreshAvgCostCents({
      previousStock: prevStock,
      previousPmpCents: prevPmp,
      inboundQty: line.qty,
      inboundUnitCostCents: line.unitCostCents,
    });
    stockPlans.push({ line, newPmp, exists: snap !== null });
  }

  let arCompensate: ReturnType<typeof compensateArOnCreditNote> | undefined;
  if (ledgerOn) {
    const arRow = await db
      .prepare(
        `SELECT id, balance_due_cents FROM accounts_receivable
         WHERE tenant_id = ? AND sale_id = ? AND balance_due_cents > 0 LIMIT 1`,
      )
      .bind(tenantId, input.originSaleId)
      .first<{ id: string; balance_due_cents: number }>();
    if (arRow) {
      arCompensate = compensateArOnCreditNote({
        accountsReceivableId: arRow.id,
        originSaleId: input.originSaleId,
        currentBalanceCents: arRow.balance_due_cents,
        creditAmountCents: refundAmountCents,
        paymentId: crypto.randomUUID(),
        collectedByUserId: userId,
        source: docType === '07' ? 'CREDIT_NOTE' : 'NV_RETURN',
      });
    }
  }

  // Crédito / CxC: solo reduce AR (E-D). Efectivo: movimiento SALE_REFUND.
  const cashRefund = paymentMethod === 'cash' && !arCompensate;
  const storeCreditOn = options.storeCreditEnabled === true;
  const wantsStoreCredit = input.consentStoreCredit === true && storeCreditOn;
  let issueStoreCredit = false;
  if (wantsStoreCredit && Boolean(origin.customer_id)) {
    if (!arCompensate && !cashRefund) {
      assertNcCanIssueStoreCredit({
        consentStoreCredit: true,
        arCompensate: false,
        cashRefund: false,
      });
      issueStoreCredit = true;
    }
  }
  const refundMovementId = cashRefund ? crypto.randomUUID() : null;
  const returnId = crypto.randomUUID();
  const documentSaleId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const prevHash = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const rowHash = await sha256Hex({
    action: 'RETURN',
    entity_id: returnId,
    origin: input.originSaleId,
    reason: input.reason.trim(),
    prev: prevHash?.row_hash ?? null,
  });

  const sunatStatus = defaultSunatStatus(docType);
  const issuedAt = new Date(nowMs).toISOString().replace('T', ' ').substring(0, 19);
  const nextNumber = seriesRow.current_number + 1;

  const chartAccounts = chartOn
    ? await loadChartAccountsByCode(db, tenantId)
    : new Map<string, string>();
  const storeCreditAccount =
    issueStoreCredit && origin.customer_id
      ? await ensureStoreCreditAccount(db, tenantId, origin.customer_id)
      : null;
  let storeCreditTxnId: string | null = null;

  await runD1AtomicPlan(db, async (plan) => {
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
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'PEN', 1.0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?
             )`,
        )
        .bind(
          documentSaleId,
          tenantId,
          origin.branch_id,
          sessionId,
          userId,
          origin.client_document_type,
          origin.client_document_number,
          origin.client_name,
          docType,
          seriesRow.series,
          nextNumber,
          refundAmountCents,
          input.originSaleId,
          docType === '07' ? '07' : null,
          sunatStatus,
          issuedAt,
        ),
    );

    plan.add(
      db
        .prepare(
          `INSERT INTO sales_returns (
               id, tenant_id, branch_id, sale_id, doc_type, doc_series, doc_number,
               refund_amount_cents, refund_payment_method, refund_movement_id,
               reason, authorized_by_user_id, created_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          returnId,
          tenantId,
          origin.branch_id,
          input.originSaleId,
          docType,
          seriesRow.series,
          String(nextNumber),
          refundAmountCents,
          paymentMethod,
          refundMovementId,
          input.reason.trim(),
          input.authorizedByUserId ?? null,
          userId,
        ),
    );

    for (const line of planned) {
      plan.add(
        db
          .prepare(
            `INSERT INTO sale_return_items (
                 id, tenant_id, return_id, original_sale_item_id, batch_id, qty, qty_microunits,
                 unit_price_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                 unit_price_without_tax_cents, line_total_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            returnId,
            line.originalSaleItemId,
            line.batchId,
            line.qty,
            Math.round(line.qty * QUANTITY_SCALE),
            line.unitPriceCents,
            line.igvAffectationCode,
            line.igvAmountCents,
            line.icbperAmountCents,
            line.unitPriceWithoutTaxCents,
            line.lineTotalCents,
          ),
      );
    }

    for (const sp of stockPlans) {
      const qtyMicrounits = Math.round(sp.line.qty * QUANTITY_SCALE);
      if (sp.exists) {
        plan.add(
          db
            .prepare(
              `UPDATE branch_product_stock
               SET stock = stock + ?,
                   stock_microunits = stock_microunits + ?,
                   pmp_unit_cost_cents = ?,
                   version = version + 1, updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
            )
            .bind(
              sp.line.qty,
              qtyMicrounits,
              sp.newPmp,
              tenantId,
              origin.branch_id,
              sp.line.productId,
            ),
        );
      } else {
        plan.add(
          db
            .prepare(
              `INSERT INTO branch_product_stock (
                   tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents, version
                 ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            )
            .bind(
              tenantId,
              origin.branch_id,
              sp.line.productId,
              sp.line.qty,
              qtyMicrounits,
              sp.newPmp,
            ),
        );
      }
      plan.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
                 id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
                 quantity_delta_microunits, unit_cost_cents, stock_after,
                 stock_after_microunits, user_id, reference_id
               ) VALUES (?, ?, ?, ?, ?, 'DEVOLUCION_NC', ?, ?, ?,
                 (SELECT stock FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 (SELECT stock_microunits FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            origin.branch_id,
            sp.line.productId,
            sp.line.batchId,
            sp.line.qty,
            qtyMicrounits,
            sp.line.unitCostCents,
            tenantId,
            origin.branch_id,
            sp.line.productId,
            tenantId,
            origin.branch_id,
            sp.line.productId,
            userId,
            returnId,
          ),
      );
    }

    if (refundMovementId) {
      plan.add(
        db
          .prepare(
            `INSERT INTO cash_register_cash_movements (
                 id, tenant_id, branch_id, cash_register_session_id, movement_type,
                 amount_cents, counterparty_ref, reason, created_by_user_id, authorized_by_user_id
               ) VALUES (?, ?, ?, ?, 'SALE_REFUND', ?, ?, ?, ?, ?)`,
          )
          .bind(
            refundMovementId,
            tenantId,
            origin.branch_id,
            sessionId,
            refundAmountCents,
            input.originSaleId,
            input.reason.trim(),
            userId,
            input.authorizedByUserId ?? null,
          ),
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
            sessionId,
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
      appendCancelPendingInstallmentsOnArClosed(plan, db, {
        tenantId,
        saleId: input.originSaleId,
        nextArBalanceCents: arCompensate.nextBalanceCents,
      });
    }

    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'RETURN', 'sales_return', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          origin.branch_id,
          userId,
          returnId,
          JSON.stringify({
            originSaleId: input.originSaleId,
            documentSaleId,
            docType,
            reason: input.reason.trim(),
            refundAmountCents,
            lines: planned.map((l) => ({
              originalSaleItemId: l.originalSaleItemId,
              qty: l.qty,
              isUncatalogued: l.isUncatalogued,
            })),
          }),
          prevHash?.row_hash ?? null,
          rowHash,
        ),
    );

    if (issueStoreCredit && storeCreditAccount && origin.customer_id) {
      const issue = planStoreCreditIssue({
        customerId: origin.customer_id,
        currentBalanceCents: storeCreditAccount.balance_cents,
        amountCents: refundAmountCents,
        sourceRef: ncStoreCreditSourceRef(returnId),
      });
      const posted = await appendStoreCreditIssueToPlan(plan, db, {
        tenantId,
        userId,
        branchId: origin.branch_id,
        accountId: storeCreditAccount.id,
        customerId: origin.customer_id,
        amountCents: issue.amountCents,
        sourceRef: issue.sourceRef,
        saleId: documentSaleId,
        prevBalanceCents: storeCreditAccount.balance_cents,
        nextBalanceCents: issue.nextBalanceCents,
        prevAuditHash: prevHash?.row_hash ?? null,
        chartOn,
        accountsByCode: chartAccounts,
        postDate: issuedAt.slice(0, 10),
      });
      storeCreditTxnId = posted.txnId;
    }

    if (chartOn) {
      await appendJournalToPlan(plan, db, {
        tenantId,
        branchId: origin.branch_id,
        userId,
        accountsByCode: chartAccounts,
        prevAuditHash: prevHash?.row_hash ?? null,
        entry: planSalesReturnJournal({
          sourceId: returnId,
          postDate: issuedAt.slice(0, 10),
          totalCents: refundAmountCents,
          taxCents: Math.trunc((refundAmountCents * 18 + 59) / 118),
          payments: [
            {
              methodCode: issueStoreCredit
                ? 'store_credit'
                : paymentMethod === 'credit'
                  ? 'credit'
                  : 'cash',
              amountCents: refundAmountCents,
            },
          ],
        }),
      });
    }

    if (commissionsOn) {
      await appendCommissionReverseWithJournal(plan, db, {
        tenantId,
        userId,
        branchId: origin.branch_id,
        saleId: input.originSaleId,
        nowIso: issuedAt,
        prevAuditHash: prevHash?.row_hash ?? null,
        chartOn,
        accountsByCode: chartAccounts,
        postDate: issuedAt.slice(0, 10),
      });
    }

    appendUsageMeterToPlan(plan, db, {
      tenantId,
      documentId: documentSaleId,
      documentType: docType,
      nowMs,
    });
  });

  return {
    status: 'SUCCESS',
    returnId,
    documentSaleId,
    docType,
    refundAmountCents,
    refundMovementId,
    storeCreditTxnId,
  };
}
