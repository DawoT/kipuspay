/**
 * Sprint 20 — recepción parcial OC + CxP + stock/lotes/PMP en una batch.
 */
/* eslint-disable complexity -- recepción ACID integra PMP, lote, ubicación y serie */
import { planCreateAp, planPartialReceive, type PurchaseOrderStatus } from '@kipuspay/domain-cash';
import { QUANTITY_SCALE, refreshAvgCostCents } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { appendLocationStockDeltaToPlan } from './process-inventory-location-atomic.js';
import { appendReceiptSerialIdentityToPlan } from './process-inventory-serial-atomic.js';

export interface PartialReceiveLineInput {
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostCents: number;
  readonly batchNumber?: string | null;
  readonly expiryDate?: string | null;
  readonly locationId?: string | null;
  readonly serialNumbers?: readonly string[];
}

export interface ProcessPartialReceiveInput {
  readonly purchaseOrderId: string;
  readonly branchId: string;
  readonly lines: readonly PartialReceiveLineInput[];
  readonly dueDateIso?: string;
  /** Sprint 29: con 3-way on, recepción no crea CxP (se crea al match de factura). */
  readonly deferAccountsPayable?: boolean;
}

export interface ProcessPartialReceiveResult {
  readonly receiptId: string;
  readonly purchaseOrderId: string;
  readonly nextStatus: PurchaseOrderStatus;
  readonly apId: string | null;
  readonly apAmountCents: number;
}

export async function processPartialReceiveAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessPartialReceiveInput,
): Promise<ProcessPartialReceiveResult> {
  if (input.lines.length === 0) throw new Error('RECEIPT_REQUIRES_LINES');

  const po = await db
    .prepare(
      `SELECT id, status, supplier_id FROM purchase_orders
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(input.purchaseOrderId, tenantId)
    .first<{ id: string; status: PurchaseOrderStatus; supplier_id: string }>();
  if (!po) throw new Error('PO_NOT_FOUND');

  const itemsRes = await db
    .prepare(
      `SELECT product_id, quantity_ordered, quantity_received, quantity_received_microunits, unit_cost_cents
       FROM purchase_order_items WHERE purchase_order_id = ?`,
    )
    .bind(input.purchaseOrderId)
    .all<{
      product_id: string;
      quantity_ordered: number;
      quantity_received: number;
      quantity_received_microunits: number;
      unit_cost_cents: number;
    }>();
  const items = itemsRes.results ?? [];
  const orderedQtyByProduct = new Map(items.map((i) => [i.product_id, i.quantity_ordered]));
  const previouslyReceivedQtyByProduct = new Map(
    items.map((i) => [i.product_id, i.quantity_received ?? 0]),
  );
  const previouslyReceivedQtyMicrounitsByProduct = new Map(
    items.map((i) => [i.product_id, i.quantity_received_microunits ?? 0]),
  );

  const receivePlan = planPartialReceive({
    purchaseOrderId: input.purchaseOrderId,
    currentStatus: po.status,
    orderedQtyByProduct,
    previouslyReceivedQtyByProduct,
    lines: input.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitCostCents: l.unitCostCents,
    })),
  });

  const dueDateIso =
    input.dueDateIso ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const deferAp = input.deferAccountsPayable === true;
  const apId = deferAp ? null : crypto.randomUUID();
  const apPlan =
    apId === null
      ? null
      : planCreateAp({
          id: apId,
          tenantId,
          supplierId: po.supplier_id,
          purchaseOrderId: input.purchaseOrderId,
          amountCents: receivePlan.apAmountCents,
          dueDateIso,
        });

  const stockPlans: {
    productId: string;
    qty: number;
    unitCostCents: number;
    newPmp: number;
    exists: boolean;
    batchId: string | null;
    batchNumber: string | null;
    expiryDate: string | null;
  }[] = [];

  for (const line of input.lines) {
    const tracking = await db
      .prepare(
        `SELECT serial_tracking_mode FROM products
         WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(tenantId, line.productId)
      .first<{ serial_tracking_mode: string }>();
    if (tracking?.serial_tracking_mode === 'REQUIRED') {
      const serials = line.serialNumbers ?? [];
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity % 1 !== 0) {
        throw new Error('SERIAL_QUANTITY_INVALID');
      }
      if (serials.length === 0) throw new Error('SERIAL_MANIFEST_REQUIRED');
      if (serials.length !== line.quantity) throw new Error('SERIAL_MANIFEST_COUNT_MISMATCH');
      const normalized = serials.map((serial) => serial.trim().normalize('NFKC').toUpperCase());
      if (new Set(normalized).size !== normalized.length) throw new Error('SERIAL_DUPLICATE');
    } else if ((line.serialNumbers?.length ?? 0) > 0) {
      throw new Error('SERIAL_TRACKING_NOT_REQUIRED');
    }
    const snap = await db
      .prepare(
        `SELECT stock, pmp_unit_cost_cents FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, input.branchId, line.productId)
      .first<{ stock: number; pmp_unit_cost_cents: number }>();
    const prevStock = snap?.stock ?? 0;
    const prevPmp = snap?.pmp_unit_cost_cents ?? 0;
    const newPmp = refreshAvgCostCents({
      previousStock: prevStock,
      previousPmpCents: prevPmp,
      inboundQty: line.quantity,
      inboundUnitCostCents: line.unitCostCents,
    });
    const batchId = line.batchNumber ? crypto.randomUUID() : null;
    stockPlans.push({
      productId: line.productId,
      qty: line.quantity,
      unitCostCents: line.unitCostCents,
      newPmp,
      exists: Boolean(snap),
      batchId,
      batchNumber: line.batchNumber ?? null,
      expiryDate: line.expiryDate ?? null,
    });
  }

  const receiptId = crypto.randomUUID();

  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO purchase_receipts (
               id, tenant_id, purchase_order_id, branch_id, received_by_user_id
             ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(receiptId, tenantId, input.purchaseOrderId, input.branchId, userId),
    );

    for (const line of input.lines) {
      const qtyMicrounits = Math.round(line.quantity * QUANTITY_SCALE);
      const receiptLineId = crypto.randomUUID();
      plan.add(
        db
          .prepare(
            `INSERT INTO purchase_receipt_lines (
                 id, tenant_id, receipt_id, product_id, batch_number, expiry_date,
                 quantity, quantity_microunits, unit_cost_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            receiptLineId,
            tenantId,
            receiptId,
            line.productId,
            line.batchNumber ?? null,
            line.expiryDate ?? null,
            line.quantity,
            qtyMicrounits,
            line.unitCostCents,
          ),
      );
      for (const serialNumber of line.serialNumbers ?? []) {
        await appendReceiptSerialIdentityToPlan(plan, db, {
          tenantId,
          userId,
          branchId: input.branchId,
          locationId: line.locationId || `loc-default:${tenantId}:${input.branchId}`,
          productId: line.productId,
          purchaseReceiptLineId: receiptLineId,
          serialNumber,
          operationId: `receipt:${receiptId}`,
        });
      }
      const prev = previouslyReceivedQtyByProduct.get(line.productId) ?? 0;
      const prevMicrounits = previouslyReceivedQtyMicrounitsByProduct.get(line.productId) ?? 0;
      plan.add(
        db
          .prepare(
            `UPDATE purchase_order_items
             SET quantity_received = ?,
                 quantity_received_microunits = ?
             WHERE purchase_order_id = ? AND product_id = ?`,
          )
          .bind(
            prev + line.quantity,
            prevMicrounits + qtyMicrounits,
            input.purchaseOrderId,
            line.productId,
          ),
      );
    }

    plan.add(
      db
        .prepare(`UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ?`)
        .bind(receivePlan.nextStatus, input.purchaseOrderId, tenantId),
    );

    if (apPlan) {
      plan.add(
        db
          .prepare(
            `INSERT INTO accounts_payable (
                 id, tenant_id, supplier_id, purchase_order_id,
                 original_amount_cents, balance_due_cents, due_date, status
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            apPlan.apId,
            apPlan.tenantId,
            apPlan.supplierId,
            apPlan.purchaseOrderId,
            apPlan.originalAmountCents,
            apPlan.balanceDueCents,
            apPlan.dueDateIso,
            apPlan.status,
          ),
      );
    }

    for (const s of stockPlans) {
      addInboundStock(plan, db, tenantId, userId, receiptId, input.branchId, s);
    }
  });

  return {
    receiptId,
    purchaseOrderId: input.purchaseOrderId,
    nextStatus: receivePlan.nextStatus,
    apId,
    apAmountCents: deferAp ? 0 : receivePlan.apAmountCents,
  };
}

function addInboundStock(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  receiptId: string,
  branchId: string,
  s: {
    productId: string;
    qty: number;
    unitCostCents: number;
    newPmp: number;
    exists: boolean;
    batchId: string | null;
    batchNumber: string | null;
    expiryDate: string | null;
  },
): void {
  const qtyMicrounits = Math.round(s.qty * QUANTITY_SCALE);
  if (s.batchId && s.batchNumber) {
    plan.add(
      db
        .prepare(
          `INSERT INTO inventory_batches (
               id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          s.batchId,
          tenantId,
          branchId,
          s.productId,
          s.batchNumber,
          s.expiryDate,
          s.qty,
          qtyMicrounits,
        ),
    );
  }

  if (s.exists) {
    plan.add(
      db
        .prepare(
          `UPDATE branch_product_stock
           SET stock = stock + ?,
               stock_microunits = stock_microunits + ?,
               pmp_unit_cost_cents = ?,
               updated_at = CURRENT_TIMESTAMP, version = version + 1
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
        )
        .bind(s.qty, qtyMicrounits, s.newPmp, tenantId, branchId, s.productId),
    );
  } else {
    plan.add(
      db
        .prepare(
          `INSERT INTO branch_product_stock (
               tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents, version
             ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(tenantId, branchId, s.productId, s.qty, qtyMicrounits, s.newPmp),
    );
  }
  appendLocationStockDeltaToPlan(plan, db, {
    tenantId,
    branchId,
    productId: s.productId,
    deltaMicrounits: qtyMicrounits,
    batchId: s.batchId,
  });

  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
             id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
             quantity_delta_microunits, unit_cost_cents, stock_after,
             stock_after_microunits, user_id, reference_id
           ) VALUES (?, ?, ?, ?, ?, 'COMPRA', ?, ?, ?,
             (SELECT stock FROM branch_product_stock
              WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
             (SELECT stock_microunits FROM branch_product_stock
              WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
             ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tenantId,
        branchId,
        s.productId,
        s.batchId,
        s.qty,
        qtyMicrounits,
        s.unitCostCents,
        tenantId,
        branchId,
        s.productId,
        tenantId,
        branchId,
        s.productId,
        userId,
        receiptId,
      ),
  );
}
