/**
 * processCreditNoteAtomic — NC 07 (Sprint 5 E-A / E-B + Sprint 8 E-D).
 * Inserta NC referenciando origen; audita CREDIT_NOTE_NO_CDR; restaura stock salvo uncatalogued;
 * compensa CxC del origen en la misma tx cuando FEATURE_LEDGER_AR_AP.
 */
import {
  assertCreditNoteAllowed,
  stockRestoreMicrounits,
  type CreditNoteRequest,
} from '@kipuspay/domain-fiscal-pe';
import { compensateArOnCreditNote } from '@kipuspay/domain-cash';
import { QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { loadChartAccountsByCode } from './journal-post.js';
import { appendCancelPendingInstallmentsOnArClosed } from './process-installment-atomic.js';
import { appendCommissionReverseWithJournal } from './process-commission-atomic.js';
import { appendLocationStockDeltaToPlan } from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  loadSerialsForStockOperation,
} from './process-inventory-serial-atomic.js';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';

export interface CreditNoteResult {
  readonly status: 'SUCCESS';
  readonly creditNoteSaleId: string;
  readonly requiresNoCdrAudit: boolean;
}

export interface ProcessCreditNoteOptions {
  readonly ledgerArApEnabled?: boolean;
  readonly chartOfAccountsEnabled?: boolean;
  /** Sprint 37 — FEATURE_SALES_COMMISSIONS: reverse accruals on origin (COM-07). */
  readonly salesCommissionsEnabled?: boolean;
  readonly serialIdsByProduct?: Readonly<Record<string, readonly string[]>>;
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
  const chartOn = options.chartOfAccountsEnabled === true;
  const commissionsOn = options.salesCommissionsEnabled === true;
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

  const issuedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const resolvedStockItems = await Promise.all(
    request.items.map(async (item) => {
      const restoreMicrounits = stockRestoreMicrounits(item);
      if (restoreMicrounits === 0) {
        return {
          item,
          restoreMicrounits,
          batchId: null as string | null,
          measurementId: null as string | null,
        };
      }
      if (!item.originalSaleItemId) {
        const product = await db
          .prepare(`SELECT product_type FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`)
          .bind(tenantId, item.productId)
          .first<{ product_type: string }>();
        if (product?.product_type === 'WEIGH') throw new Error('NC_ORIGINAL_LINE_REQUIRED');
        return {
          item,
          restoreMicrounits,
          batchId: null as string | null,
          measurementId: null as string | null,
        };
      }
      const originalLine = await db
        .prepare(
          `SELECT si.product_id, si.product_type, si.base_quantity_microunits, si.batch_id,
                  wm.id AS measurement_id
           FROM sale_items si
           LEFT JOIN weight_measurements wm
             ON wm.tenant_id = si.tenant_id AND wm.sale_item_id = si.id
           WHERE si.tenant_id = ? AND si.sale_id = ? AND si.id = ? LIMIT 1`,
        )
        .bind(tenantId, originSaleId, item.originalSaleItemId)
        .first<{
          product_id: string;
          product_type: string;
          base_quantity_microunits: number;
          batch_id: string | null;
          measurement_id: string | null;
        }>();
      if (!originalLine || originalLine.product_id !== item.productId) {
        throw new Error('NC_ORIGINAL_LINE_INVALID');
      }
      if (
        originalLine.product_type === 'WEIGH' &&
        (!item.quantityMicrounits ||
          !originalLine.measurement_id ||
          restoreMicrounits > originalLine.base_quantity_microunits)
      ) {
        throw new Error('NC_WEIGHT_QUANTITY_INVALID');
      }
      return {
        item,
        restoreMicrounits,
        batchId: originalLine.batch_id,
        measurementId: originalLine.measurement_id,
      };
    }),
  );
  const weightReversalAudits: Array<{
    measurementId: string;
    originalSaleItemId: string;
    restoredWeightMicrounits: number;
    prevHash: string;
    rowHash: string;
  }> = [];
  let reversalPrevHash = rowHash;
  for (const resolved of resolvedStockItems) {
    if (!resolved.measurementId || !resolved.item.originalSaleItemId) continue;
    const reversalHash = await crypto.subtle
      .digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify({
            action: 'WEIGHT_MEASUREMENT_REVERSED',
            entity_id: resolved.measurementId,
            credit_note_id: ncId,
            restored_weight_microunits: resolved.restoreMicrounits,
            prev: reversalPrevHash,
          }),
        ),
      )
      .then((buf) =>
        [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      );
    weightReversalAudits.push({
      measurementId: resolved.measurementId,
      originalSaleItemId: resolved.item.originalSaleItemId,
      restoredWeightMicrounits: resolved.restoreMicrounits,
      prevHash: reversalPrevHash,
      rowHash: reversalHash,
    });
    reversalPrevHash = reversalHash;
  }
  const preparedSerials = await loadSerialsForStockOperation(
    db,
    tenantId,
    origin.branch_id,
    resolvedStockItems
      .filter(({ restoreMicrounits }) => restoreMicrounits > 0)
      .map(({ item, restoreMicrounits }) => ({
        productId: item.productId,
        quantityMicrounits: restoreMicrounits,
        serialIds: options.serialIdsByProduct?.[item.productId] ?? [],
      })),
    'SOLD',
  );
  const chartAccounts =
    chartOn || commissionsOn
      ? await loadChartAccountsByCode(db, tenantId)
      : new Map<string, string>();

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
          issuedAt,
        ),
    );

    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, ?, 'sale', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          origin.branch_id,
          userId,
          gate.requiresNoCdrAudit ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE',
          originSaleId,
          JSON.stringify({ sourceStatus: origin.sunat_status, total: request.amountCents }),
          prevHash?.row_hash ?? null,
          rowHash,
        ),
    );

    for (const resolved of resolvedStockItems) {
      const { item, restoreMicrounits } = resolved;
      if (restoreMicrounits <= 0) continue;
      const restore = restoreMicrounits / QUANTITY_SCALE;
      plan.add(
        db
          .prepare(
            `UPDATE branch_product_stock
               SET stock = stock + ?,
                   stock_microunits = stock_microunits + ?,
                   version = version + 1, updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(restore, restoreMicrounits, tenantId, origin.branch_id, item.productId),
      );
      appendLocationStockDeltaToPlan(plan, db, {
        tenantId,
        branchId: origin.branch_id,
        productId: item.productId,
        deltaMicrounits: restoreMicrounits,
        batchId: resolved.batchId,
      });
      if (resolved.batchId) {
        plan.add(
          db
            .prepare(
              `UPDATE inventory_batches
               SET stock_microunits = stock_microunits + ?,
                   stock = (stock_microunits + ?) * 0.000001
               WHERE id = ? AND tenant_id = ? AND branch_id = ? AND product_id = ?`,
            )
            .bind(
              restoreMicrounits,
              restoreMicrounits,
              resolved.batchId,
              tenantId,
              origin.branch_id,
              item.productId,
            ),
        );
      }
    }
    for (const reversal of weightReversalAudits) {
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (
               ?, ?, ?, ?, 'WEIGHT_MEASUREMENT_REVERSED', 'weight_measurement', ?, ?, ?, ?
             )`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            origin.branch_id,
            userId,
            reversal.measurementId,
            JSON.stringify({
              creditNoteSaleId: ncId,
              originalSaleItemId: reversal.originalSaleItemId,
              restoredWeightMicrounits: reversal.restoredWeightMicrounits,
            }),
            reversal.prevHash,
            reversal.rowHash,
          ),
      );
    }
    for (const serial of preparedSerials) {
      await appendSerialTransitionToPlan(plan, db, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'SOLD',
        nextStatus: 'RETURNED_INSPECTION',
        expectedVersion: serial.version,
        eventType: 'RETURNED',
        operationType: 'CREDIT_NOTE',
        operationId: ncId,
        idempotencyKey: `credit-note:${ncId}:${serial.serialId}`,
        actorUserId: userId,
        currentSaleItemId: null,
      });
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
      appendCancelPendingInstallmentsOnArClosed(plan, db, {
        tenantId,
        saleId: originSaleId,
        nextArBalanceCents: arCompensate.nextBalanceCents,
      });
    }

    if (commissionsOn) {
      await appendCommissionReverseWithJournal(plan, db, {
        tenantId,
        userId,
        branchId: origin.branch_id,
        saleId: originSaleId,
        nowIso: issuedAt,
        prevAuditHash: reversalPrevHash,
        chartOn,
        accountsByCode: chartAccounts,
        postDate: issuedAt.slice(0, 10),
      });
    }

    appendUsageMeterToPlan(plan, db, {
      tenantId,
      documentId: ncId,
      documentType: '07',
    });
  });

  return {
    status: 'SUCCESS',
    creditNoteSaleId: ncId,
    requiresNoCdrAudit: gate.requiresNoCdrAudit,
  };
}
