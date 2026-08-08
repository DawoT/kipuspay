/**
 * Devolución a proveedor ACID — Sprint 34 / ADR-0018 / §5.3 regla 19.
 * Un db.batch por create/close/cancel. 0 CPE; stock solo al CLOSED.
 */
/* eslint-disable complexity -- orquestador multi-rama receipt/invoice/AP/PMP; split diferido */
/* eslint-disable no-secrets/no-secrets -- SQL COALESCE, no secretos */
import {
  assertSupplierReturnCancelAllowed,
  assertSupplierReturnClosable,
  assertSupplierReturnStockEnough,
  planSupplierReturnCreate,
  planSupplierReturnJournal,
  type SupplierReturnApStatus,
  type SupplierReturnItemInput,
  type SupplierReturnStatus,
} from '@kipuspay/domain-cash';
import {
  convertEnteredToBaseMicrounits,
  QUANTITY_SCALE,
  refreshAvgCostOnOutboundCents,
} from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';
import { appendLocationStockDeltaToPlan } from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  appendSerialManifestItemToPlan,
  loadSerialsForStockOperation,
  type PreparedSerialIdentity,
} from './process-inventory-serial-atomic.js';

export interface SupplierReturnLineInput {
  readonly productId: string;
  readonly enteredQuantityMicrounits: number;
  readonly uomId?: string | null;
  readonly batchId?: string | null;
  readonly serialIds?: readonly string[];
}

export interface ProcessSupplierReturnCreateInput {
  readonly branchId: string;
  readonly purchaseReceiptId: string;
  readonly supplierInvoiceId?: string | null;
  readonly reason: string;
  readonly supplierCreditNoteRef?: string | null;
  readonly items: readonly SupplierReturnLineInput[];
}

export interface ProcessSupplierReturnIdInput {
  readonly returnId: string;
}

export interface ProcessSupplierReturnCloseInput {
  readonly returnId: string;
  readonly priceDiffOverride?: boolean;
  readonly authorizedByUserId?: string | null;
}

export interface ProcessSupplierReturnOptions {
  readonly catalogUomEnabled?: boolean;
  readonly ledgerChartOfAccountsEnabled?: boolean;
}

interface ReturnRow {
  readonly id: string;
  readonly branch_id: string;
  readonly supplier_id: string;
  readonly supplier_invoice_id: string | null;
  readonly purchase_receipt_id: string | null;
  readonly purchase_order_id: string | null;
  readonly status: string;
  readonly total_cents: number;
  readonly reason: string;
}

interface ReturnItemRow {
  readonly product_id: string;
  readonly batch_id: string | null;
  readonly sold_uom_id: string | null;
  readonly sold_uom_code: string | null;
  readonly entered_quantity_microunits: number;
  readonly factor_numerator: number;
  readonly factor_denominator: number;
  readonly base_quantity_microunits: number;
  readonly unit_cost_cents: number;
  readonly line_total_cents: number;
}

async function sha256Hex(payload: Record<string, unknown>): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

async function loadReturn(
  db: D1DatabaseLike,
  tenantId: string,
  returnId: string,
): Promise<ReturnRow> {
  const row = await db
    .prepare(
      `SELECT id, branch_id, supplier_id, supplier_invoice_id, purchase_receipt_id,
              purchase_order_id, status, total_cents, reason
       FROM supplier_returns WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, returnId)
    .first<ReturnRow>();
  if (!row) throw new Error('SUPPLIER_RETURN_NOT_FOUND');
  return row;
}

async function loadReturnItems(
  db: D1DatabaseLike,
  tenantId: string,
  returnId: string,
): Promise<readonly ReturnItemRow[]> {
  const rows = await db
    .prepare(
      `SELECT product_id, batch_id, sold_uom_id, sold_uom_code, entered_quantity_microunits,
              factor_numerator, factor_denominator, base_quantity_microunits,
              unit_cost_cents, line_total_cents
       FROM supplier_return_items WHERE tenant_id = ? AND return_id = ?`,
    )
    .bind(tenantId, returnId)
    .all<ReturnItemRow>();
  return rows.results ?? [];
}

async function alreadyReturnedMicrounits(
  db: D1DatabaseLike,
  tenantId: string,
  receiptId: string,
  productId: string,
  excludeReturnId?: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(sri.base_quantity_microunits), 0) AS qty
       FROM supplier_return_items sri
       INNER JOIN supplier_returns sr
         ON sr.tenant_id = sri.tenant_id AND sr.id = sri.return_id
       WHERE sri.tenant_id = ? AND sr.purchase_receipt_id = ? AND sri.product_id = ?
         AND sr.status = 'CLOSED'
         AND (? IS NULL OR sr.id != ?)`,
    )
    .bind(tenantId, receiptId, productId, excludeReturnId ?? null, excludeReturnId ?? null)
    .first<{ qty: number }>();
  return row?.qty ?? 0;
}

async function resolveUom(
  db: D1DatabaseLike,
  tenantId: string,
  productId: string,
  uomId: string | null,
  catalogUomEnabled: boolean,
): Promise<{ id: string | null; code: string | null; num: number; den: number }> {
  if (!catalogUomEnabled) return { id: null, code: 'UND', num: 1, den: 1 };
  if (uomId) {
    const uom = await db
      .prepare(
        `SELECT id, uom_code, factor_numerator, factor_denominator
         FROM product_uoms WHERE tenant_id = ? AND product_id = ? AND id = ? LIMIT 1`,
      )
      .bind(tenantId, productId, uomId)
      .first<{
        id: string;
        uom_code: string;
        factor_numerator: number;
        factor_denominator: number;
      }>();
    if (!uom) throw new Error('UOM_NOT_FOUND');
    return {
      id: uom.id,
      code: uom.uom_code,
      num: uom.factor_numerator,
      den: uom.factor_denominator,
    };
  }
  const base = await db
    .prepare(
      `SELECT id, uom_code FROM product_uoms
       WHERE tenant_id = ? AND product_id = ? AND is_base = 1 LIMIT 1`,
    )
    .bind(tenantId, productId)
    .first<{ id: string; uom_code: string }>();
  return { id: base?.id ?? null, code: base?.uom_code ?? 'UND', num: 1, den: 1 };
}

export async function processSupplierReturnCreateAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessSupplierReturnCreateInput,
  options: ProcessSupplierReturnOptions = {},
): Promise<{
  returnId: string;
  snapshotTotalCents: number;
  emitsFiscalDocument: false;
  movesStock: false;
}> {
  const receipt = await db
    .prepare(
      `SELECT r.id, r.branch_id, r.purchase_order_id, po.supplier_id
       FROM purchase_receipts r
       INNER JOIN purchase_orders po
         ON po.tenant_id = r.tenant_id AND po.id = r.purchase_order_id
       WHERE r.tenant_id = ? AND r.id = ? LIMIT 1`,
    )
    .bind(tenantId, input.purchaseReceiptId)
    .first<{
      id: string;
      branch_id: string;
      purchase_order_id: string;
      supplier_id: string;
    }>();
  if (!receipt) throw new Error('RECEIPT_NOT_FOUND');
  if (input.branchId && input.branchId !== receipt.branch_id) throw new Error('BRANCH_MISMATCH');

  let invoice: { id: string; purchase_order_id: string } | null = null;
  if (input.supplierInvoiceId) {
    invoice = await db
      .prepare(
        `SELECT id, purchase_order_id FROM supplier_invoices
         WHERE tenant_id = ? AND id = ? LIMIT 1`,
      )
      .bind(tenantId, input.supplierInvoiceId)
      .first<{ id: string; purchase_order_id: string }>();
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');
    if (invoice.purchase_order_id !== receipt.purchase_order_id)
      throw new Error('INVOICE_RECEIPT_MISMATCH');
  }

  const snapshots: {
    productId: string;
    batchId: string | null;
    soldUomId: string | null;
    soldUomCode: string | null;
    enteredQuantityMicrounits: number;
    factorNumerator: number;
    factorDenominator: number;
    baseQuantityMicrounits: number;
    unitCostCents: number;
    lineTotalCents: number;
    domain: SupplierReturnItemInput;
  }[] = [];

  for (const line of input.items) {
    const receiptLine = await db
      .prepare(
        `SELECT product_id, quantity_microunits, unit_cost_cents, batch_number
         FROM purchase_receipt_lines
         WHERE tenant_id = ? AND receipt_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, receipt.id, line.productId)
      .first<{
        product_id: string;
        quantity_microunits: number;
        unit_cost_cents: number;
        batch_number: string | null;
      }>();
    if (!receiptLine) throw new Error('PRODUCT_NOT_ON_RECEIPT');
    let invoicedMicrounits: number | null = null;
    let snapshotUnitCostCents = receiptLine.unit_cost_cents;
    if (invoice) {
      const invLine = await db
        .prepare(
          `SELECT invoiced_qty_microunits, unit_cost_cents
           FROM supplier_invoice_lines
           WHERE tenant_id = ? AND invoice_id = ? AND product_id = ? LIMIT 1`,
        )
        .bind(tenantId, invoice.id, line.productId)
        .first<{ invoiced_qty_microunits: number; unit_cost_cents: number }>();
      if (!invLine) throw new Error('PRODUCT_NOT_ON_INVOICE');
      invoicedMicrounits = invLine.invoiced_qty_microunits;
      snapshotUnitCostCents = invLine.unit_cost_cents;
    }
    const uom = await resolveUom(
      db,
      tenantId,
      line.productId,
      line.uomId ?? null,
      options.catalogUomEnabled === true,
    );
    const baseQuantityMicrounits = convertEnteredToBaseMicrounits({
      enteredQuantityMicrounits: line.enteredQuantityMicrounits,
      factorNumerator: uom.num,
      factorDenominator: uom.den,
    });
    const already = await alreadyReturnedMicrounits(db, tenantId, receipt.id, line.productId);
    const domain: SupplierReturnItemInput = {
      productId: line.productId,
      baseQuantityMicrounits,
      unitCostCents: snapshotUnitCostCents,
      snapshotUnitCostCents,
      receivedMicrounits: receiptLine.quantity_microunits,
      invoicedMicrounits,
      alreadyReturnedMicrounits: already,
    };
    const lineTotalCents = Math.floor(
      (baseQuantityMicrounits * snapshotUnitCostCents + QUANTITY_SCALE / 2) / QUANTITY_SCALE,
    );
    snapshots.push({
      productId: line.productId,
      batchId: line.batchId ?? receiptLine.batch_number,
      soldUomId: uom.id,
      soldUomCode: uom.code,
      enteredQuantityMicrounits: line.enteredQuantityMicrounits,
      factorNumerator: uom.num,
      factorDenominator: uom.den,
      baseQuantityMicrounits,
      unitCostCents: snapshotUnitCostCents,
      lineTotalCents,
      domain,
    });
  }

  const plan = planSupplierReturnCreate({
    items: snapshots.map((s) => s.domain),
    reason: input.reason,
  });
  const returnId = crypto.randomUUID();
  const preparedSerials = await loadSerialsForStockOperation(
    db,
    tenantId,
    receipt.branch_id,
    snapshots.map((snapshot, index) => ({
      productId: snapshot.productId,
      quantityMicrounits: snapshot.baseQuantityMicrounits,
      serialIds: input.items[index]?.serialIds ?? [],
    })),
    'AVAILABLE',
  );
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256Hex({
    action: 'SUPPLIER_RETURN',
    entity_id: returnId,
    prev: prevHash,
    phase: 'CREATE',
  });
  await runD1AtomicPlan(db, (builder) => {
    builder.add(
      db
        .prepare(
          `INSERT INTO supplier_returns (
             id, tenant_id, branch_id, supplier_id, supplier_invoice_id, purchase_receipt_id,
             purchase_order_id, status, total_cents, reason, supplier_credit_note_ref,
             created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
        )
        .bind(
          returnId,
          tenantId,
          receipt.branch_id,
          receipt.supplier_id,
          invoice?.id ?? null,
          receipt.id,
          receipt.purchase_order_id,
          plan.snapshotTotalCents,
          input.reason,
          input.supplierCreditNoteRef ?? null,
          userId,
        ),
    );
    for (const snap of snapshots) {
      builder.add(
        db
          .prepare(
            `INSERT INTO supplier_return_items (
               id, tenant_id, return_id, product_id, batch_id, sold_uom_id, sold_uom_code,
               entered_quantity_microunits, factor_numerator, factor_denominator,
               base_quantity_microunits, unit_cost_cents, line_total_cents
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            returnId,
            snap.productId,
            snap.batchId,
            snap.soldUomId,
            snap.soldUomCode,
            snap.enteredQuantityMicrounits,
            snap.factorNumerator,
            snap.factorDenominator,
            snap.baseQuantityMicrounits,
            snap.unitCostCents,
            snap.lineTotalCents,
          ),
      );
    }
    for (const serial of preparedSerials) {
      appendSerialManifestItemToPlan(builder, db, {
        tenantId,
        serialId: serial.serialId,
        operationType: 'SUPPLIER_RETURN_DRAFT',
        operationId: returnId,
        idempotencyKey: `supplier-return-draft:${returnId}`,
      });
    }
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'SUPPLIER_RETURN', 'supplier_return', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          receipt.branch_id,
          userId,
          returnId,
          JSON.stringify({ phase: 'CREATE', snapshotTotalCents: plan.snapshotTotalCents }),
          prevHash,
          rowHash,
        ),
    );
  });
  return {
    returnId,
    snapshotTotalCents: plan.snapshotTotalCents,
    emitsFiscalDocument: false,
    movesStock: false,
  };
}

export async function processSupplierReturnCancelAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessSupplierReturnIdInput,
): Promise<{
  returnId: string;
  status: 'CANCELLED';
  emitsFiscalDocument: false;
  movesStock: false;
}> {
  const row = await loadReturn(db, tenantId, input.returnId);
  assertSupplierReturnCancelAllowed({ status: row.status as SupplierReturnStatus });
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256Hex({
    action: 'SUPPLIER_RETURN',
    entity_id: row.id,
    prev: prevHash,
    phase: 'CANCEL',
  });
  await runD1AtomicPlan(db, (builder) => {
    builder.add(
      db
        .prepare(
          `UPDATE supplier_returns SET status = 'CANCELLED' WHERE tenant_id = ? AND id = ? AND status = 'OPEN'`,
        )
        .bind(tenantId, row.id),
    );
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'SUPPLIER_RETURN', 'supplier_return', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          row.branch_id,
          userId,
          row.id,
          JSON.stringify({ phase: 'CANCEL' }),
          prevHash,
          rowHash,
        ),
    );
  });
  return { returnId: row.id, status: 'CANCELLED', emitsFiscalDocument: false, movesStock: false };
}

export async function processSupplierReturnCloseAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessSupplierReturnCloseInput,
  options: ProcessSupplierReturnOptions = {},
): Promise<{
  returnId: string;
  status: 'CLOSED';
  emitsFiscalDocument: false;
  movesStock: true;
  alreadyClosed?: boolean;
}> {
  const row = await loadReturn(db, tenantId, input.returnId);
  if (row.status === 'CLOSED') {
    return {
      returnId: row.id,
      status: 'CLOSED',
      emitsFiscalDocument: false,
      movesStock: true,
      alreadyClosed: true,
    };
  }
  if (!row.purchase_receipt_id) throw new Error('RECEIPT_NOT_FOUND');
  const items = await loadReturnItems(db, tenantId, row.id);
  const returnSerials = await loadSupplierReturnSerials(db, tenantId, row.id);
  const domainItems: SupplierReturnItemInput[] = [];
  for (const item of items) {
    const receiptLine = await db
      .prepare(
        `SELECT quantity_microunits, unit_cost_cents
         FROM purchase_receipt_lines
         WHERE tenant_id = ? AND receipt_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, row.purchase_receipt_id, item.product_id)
      .first<{ quantity_microunits: number; unit_cost_cents: number }>();
    if (!receiptLine) throw new Error('PRODUCT_NOT_ON_RECEIPT');
    let invoicedMicrounits: number | null = null;
    let snapshotUnitCostCents = receiptLine.unit_cost_cents;
    if (row.supplier_invoice_id) {
      const invLine = await db
        .prepare(
          `SELECT invoiced_qty_microunits, unit_cost_cents
           FROM supplier_invoice_lines
           WHERE tenant_id = ? AND invoice_id = ? AND product_id = ? LIMIT 1`,
        )
        .bind(tenantId, row.supplier_invoice_id, item.product_id)
        .first<{ invoiced_qty_microunits: number; unit_cost_cents: number }>();
      if (!invLine) throw new Error('PRODUCT_NOT_ON_INVOICE');
      invoicedMicrounits = invLine.invoiced_qty_microunits;
      snapshotUnitCostCents = invLine.unit_cost_cents;
    }
    const already = await alreadyReturnedMicrounits(
      db,
      tenantId,
      row.purchase_receipt_id,
      item.product_id,
      row.id,
    );
    domainItems.push({
      productId: item.product_id,
      baseQuantityMicrounits: item.base_quantity_microunits,
      unitCostCents: item.unit_cost_cents,
      snapshotUnitCostCents,
      receivedMicrounits: receiptLine.quantity_microunits,
      invoicedMicrounits,
      alreadyReturnedMicrounits: already,
    });
  }

  let ap: { id: string; status: SupplierReturnApStatus; balanceDueCents: number } | null = null;
  if (row.purchase_order_id) {
    const apRow = await db
      .prepare(
        `SELECT id, status, balance_due_cents FROM accounts_payable
         WHERE tenant_id = ? AND supplier_id = ? AND purchase_order_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(tenantId, row.supplier_id, row.purchase_order_id)
      .first<{ id: string; status: string; balance_due_cents: number }>();
    if (apRow) {
      ap = {
        id: apRow.id,
        status: apRow.status as SupplierReturnApStatus,
        balanceDueCents: apRow.balance_due_cents,
      };
    }
  }

  const closePlan = assertSupplierReturnClosable({
    status: row.status as SupplierReturnStatus,
    items: domainItems,
    priceDiffOverride: input.priceDiffOverride === true,
    authorizedByUserId: input.authorizedByUserId ?? null,
    ap: ap ? { status: ap.status, balanceDueCents: ap.balanceDueCents } : null,
  });

  const stockPlans: {
    productId: string;
    qty: number;
    qtyMicrounits: number;
    unitCostCents: number;
    batchId: string | null;
    newPmp: number;
    stockAfter: number;
    stockAfterMicrounits: number;
  }[] = [];
  for (const item of items) {
    const snap = await db
      .prepare(
        `SELECT stock, stock_microunits, pmp_unit_cost_cents FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, row.branch_id, item.product_id)
      .first<{ stock: number; stock_microunits: number; pmp_unit_cost_cents: number }>();
    const stockMicro = snap?.stock_microunits ?? 0;
    assertSupplierReturnStockEnough({
      stockMicrounits: stockMicro,
      outboundMicrounits: item.base_quantity_microunits,
    });
    const qty = item.base_quantity_microunits / QUANTITY_SCALE;
    const prevStock = snap?.stock ?? 0;
    const newPmp = refreshAvgCostOnOutboundCents({
      previousStock: prevStock,
      previousPmpCents: snap?.pmp_unit_cost_cents ?? 0,
      outboundQty: qty,
      outboundUnitCostCents: item.unit_cost_cents,
    });
    stockPlans.push({
      productId: item.product_id,
      qty,
      qtyMicrounits: item.base_quantity_microunits,
      unitCostCents: item.unit_cost_cents,
      batchId: item.batch_id,
      newPmp,
      stockAfter: prevStock - qty,
      stockAfterMicrounits: stockMicro - item.base_quantity_microunits,
    });
  }

  const chartOn = options.ledgerChartOfAccountsEnabled === true && closePlan.apDeltaCents > 0;
  const chartAccounts = chartOn
    ? await loadChartAccountsByCode(db, tenantId)
    : new Map<string, string>();
  const prevHash = await previousAuditHash(db, tenantId);
  const auditAction = closePlan.requiresPriceDiffAudit ? 'SUPPLIER_PRICE_DIFF' : 'SUPPLIER_RETURN';
  const rowHash = await sha256Hex({
    action: auditAction,
    entity_id: row.id,
    prev: prevHash,
    phase: 'CLOSE',
  });

  await runD1AtomicPlan(db, async (builder) => {
    builder.add(
      db
        .prepare(
          `UPDATE supplier_returns
           SET status = 'CLOSED', authorized_by_user_id = ?
           WHERE tenant_id = ? AND id = ? AND status = 'OPEN'`,
        )
        .bind(input.authorizedByUserId ?? null, tenantId, row.id),
    );
    for (const sp of stockPlans) {
      builder.add(
        db
          .prepare(
            `UPDATE branch_product_stock
             SET stock = stock - ?,
                 stock_microunits = stock_microunits - ?,
                 pmp_unit_cost_cents = ?,
                 version = version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(sp.qty, sp.qtyMicrounits, sp.newPmp, tenantId, row.branch_id, sp.productId),
      );
      appendLocationStockDeltaToPlan(builder, db, {
        tenantId,
        branchId: row.branch_id,
        productId: sp.productId,
        deltaMicrounits: -sp.qtyMicrounits,
        batchId: sp.batchId,
      });
      builder.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
               id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
               quantity_delta_microunits, unit_cost_cents, stock_after, stock_after_microunits,
               user_id, reference_id
             ) VALUES (?, ?, ?, ?, ?, 'DEVOLUCION_PROVEEDOR', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            row.branch_id,
            sp.productId,
            sp.batchId,
            -sp.qty,
            -sp.qtyMicrounits,
            sp.unitCostCents,
            sp.stockAfter,
            sp.stockAfterMicrounits,
            userId,
            row.id,
          ),
      );
    }
    for (const serial of returnSerials) {
      await appendSerialTransitionToPlan(builder, db, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'AVAILABLE',
        nextStatus: 'RETURNED_SUPPLIER',
        expectedVersion: serial.version,
        eventType: 'SUPPLIER_RETURN',
        operationType: 'SUPPLIER_RETURN',
        operationId: row.id,
        idempotencyKey: `supplier-return:${row.id}:${serial.serialId}`,
        actorUserId: userId,
      });
    }
    if (ap && closePlan.nextApBalanceCents !== null && closePlan.nextApStatus) {
      builder.add(
        db
          .prepare(
            `UPDATE accounts_payable SET balance_due_cents = ?, status = ?
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(closePlan.nextApBalanceCents, closePlan.nextApStatus, ap.id, tenantId),
      );
    }
    if (chartOn) {
      await appendJournalToPlan(builder, db, {
        tenantId,
        branchId: row.branch_id,
        userId,
        accountsByCode: chartAccounts,
        prevAuditHash: prevHash,
        entry: planSupplierReturnJournal({
          sourceId: row.id,
          postDate: new Date().toISOString().slice(0, 10),
          amountCents: closePlan.apDeltaCents,
        }),
      });
    }
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, ?, 'supplier_return', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          row.branch_id,
          userId,
          auditAction,
          row.id,
          JSON.stringify({
            phase: 'CLOSE',
            apDeltaCents: closePlan.apDeltaCents,
            requiresPriceDiffAudit: closePlan.requiresPriceDiffAudit,
          }),
          prevHash,
          rowHash,
        ),
    );
  });

  return {
    returnId: row.id,
    status: 'CLOSED',
    emitsFiscalDocument: false,
    movesStock: true,
  };
}

async function loadSupplierReturnSerials(
  db: D1DatabaseLike,
  tenantId: string,
  returnId: string,
): Promise<readonly PreparedSerialIdentity[]> {
  const rows = await db
    .prepare(
      `SELECT sn.id, sn.product_id, sn.branch_id, sn.location_id, sn.status, sn.version
       FROM serial_numbers sn
       INNER JOIN serial_manifest_items smi
         ON smi.tenant_id = sn.tenant_id AND smi.serial_id = sn.id
       INNER JOIN serial_manifests sm
         ON sm.tenant_id = smi.tenant_id AND sm.id = smi.manifest_id
       WHERE sn.tenant_id = ? AND sm.operation_type = 'SUPPLIER_RETURN_DRAFT'
         AND sm.operation_id = ? AND sn.status = 'AVAILABLE'`,
    )
    .bind(tenantId, returnId)
    .all<{
      id: string;
      product_id: string;
      branch_id: string;
      location_id: string;
      status: string;
      version: number;
    }>();
  return (rows.results ?? [])
    .filter(
      (row) =>
        Boolean(row.id && row.product_id && row.branch_id && row.location_id) &&
        Number.isSafeInteger(row.version),
    )
    .map((row) => ({
      serialId: row.id,
      productId: row.product_id,
      branchId: row.branch_id,
      locationId: row.location_id,
      status: row.status,
      version: row.version,
    }));
}
