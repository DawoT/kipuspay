/**
 * Sprint 19 — split bill → 1..N sales ACID + stock once (§5.3 regla 7).
 */
import {
  assertItemCancelAuthorized,
  assertOrderBillable,
  assertOrderItemTransition,
  assertOrderTransition,
  planOrderStockDeltas,
  planSplitBill,
  resolveOrderStockPolicy,
  type OrderItemStatus,
  type OrderStatus,
} from '@kipuspay/domain-sales';
import { QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { appendLocationStockDeltaToPlan } from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  loadSerialsForStockOperation,
} from './process-inventory-serial-atomic.js';

export interface OrderBillingPortionInput {
  readonly saleId: string;
  readonly itemIds: readonly string[];
}

export interface ProcessOrderBillingInput {
  readonly orderId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly paymentMethodId: string;
  readonly portions: readonly OrderBillingPortionInput[];
  readonly stockPolicy?: string | null;
  readonly clientName?: string;
  readonly serialIdsByItemId?: Readonly<Record<string, readonly string[]>>;
  /** S19-H2: documento según modo — 'NV' (control interno) o '03' (boleta). */
  readonly documentType?: 'NV' | '03';
}

export interface ProcessOrderBillingResult {
  readonly orderId: string;
  readonly orderStatus: 'PAID';
  readonly sales: readonly {
    readonly saleId: string;
    readonly amountCents: number;
    readonly itemIds: readonly string[];
    readonly number: number;
  }[];
}

interface OrderItemRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  status: OrderItemStatus;
  sale_id: string | null;
}

function lineAmountCents(row: OrderItemRow): number {
  return Math.round(row.unit_price_cents * row.quantity);
}

export async function processOrderBillingAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessOrderBillingInput,
  nowMs: number = Date.now(),
): Promise<ProcessOrderBillingResult> {
  const order = await db
    .prepare(`SELECT id, branch_id, status FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(input.orderId, tenantId)
    .first<{ id: string; branch_id: string; status: OrderStatus }>();
  if (!order) throw new Error('ORDER_NOT_FOUND');
  assertOrderBillable(order.status);

  const itemsRes = await db
    .prepare(
      `SELECT id, product_id, product_name, quantity, unit_price_cents, status, sale_id
       FROM order_items WHERE order_id = ? AND tenant_id = ?`,
    )
    .bind(input.orderId, tenantId)
    .all<OrderItemRow>();
  const allItems = itemsRes.results ?? [];
  const billable = allItems.filter((r) => r.status !== 'CANCELLED');
  if (billable.some((r) => r.status === 'BILLED' || r.sale_id)) {
    throw new Error('ORDER_ALREADY_BILLED');
  }
  if (billable.length === 0) throw new Error('ORDER_NO_BILLABLE_ITEMS');

  const byId = new Map(billable.map((r) => [r.id, r]));
  const amountCentsByItem = new Map(billable.map((r) => [r.id, lineAmountCents(r)]));
  const portions = planSplitBill({
    orderId: input.orderId,
    orderStatus: order.status,
    itemIds: billable.map((r) => r.id),
    portions: input.portions,
    amountCentsByItem,
  });

  const seriesRow = await db
    .prepare(
      `SELECT id, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ? AND series = ?
       LIMIT 1`,
    )
    .bind(tenantId, order.branch_id, input.documentType ?? 'NV', input.series)
    .first<{ id: string; current_number: number }>();
  if (!seriesRow) throw new Error('SERIES_NOT_FOUND');
  const seriesStartNumber = Number(seriesRow.current_number ?? 0);

  const policy = resolveOrderStockPolicy(
    input.stockPolicy === undefined || input.stockPolicy === null
      ? null
      : String(input.stockPolicy),
  );
  const stockDeltas = planOrderStockDeltas({
    policy,
    phase: 'bill',
    lines: billable.map((r) => ({ productId: r.product_id, quantity: r.quantity })),
  });
  const preparedSerials = await loadSerialsForStockOperation(
    db,
    tenantId,
    order.branch_id,
    billable.map((item) => ({
      productId: item.product_id,
      quantityMicrounits: Math.round(item.quantity * QUANTITY_SCALE),
      serialIds: input.serialIdsByItemId?.[item.id] ?? [],
    })),
    'AVAILABLE',
  );

  const limaTs = new Date(nowMs).toISOString().replace('T', ' ').slice(0, 19);
  assertOrderTransition(order.status, 'PAID');

  await runD1AtomicPlan(db, async (plan) => {
    const saleItemByOrderItem = new Map<string, { saleItemId: string; saleId: string }>();
    for (let portionIndex = 0; portionIndex < portions.length; portionIndex++) {
      const portion = portions[portionIndex]!;
      const portionRows = portion.itemIds.map((id) => byId.get(id)!);
      const totalAmount = portion.amountCents;
      const taxable = Math.round(totalAmount / 1.18);
      const igv = totalAmount - taxable;

      plan.add(
        db
          .prepare(
            `INSERT INTO sales (
                 id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
                 offline_client_sale_id, client_document_type, client_document_number, client_name,
                 document_type, series, number, currency, exchange_rate,
                 total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
                 total_discount_cents, total_cogs_cents, total_amount_cents,
                 issued_at_lima, sunat_status, must_submit_by
               )
               SELECT
                 ?, ?, ?, ?, ?, NULL, ?, '1', '00000000', ?, ?, ?,
                 ?, 'PEN', 1.0, ?, 0, ?, 0, 0, 0, ?, ?, ?, NULL`,
          )
          .bind(
            portion.saleId,
            tenantId,
            order.branch_id,
            input.cashRegisterSessionId,
            userId,
            `order-bill-${portion.saleId}`,
            input.clientName ?? 'Cliente',
            input.documentType ?? 'NV',
            input.series,
            seriesStartNumber + 1 + portionIndex,
            taxable,
            igv,
            totalAmount,
            limaTs,
            input.documentType === '03' ? 'PENDING' : 'NOT_APPLICABLE',
          ),
      );

      let accumulatedLineTaxable = 0;
      let accumulatedLineIgv = 0;
      for (let i = 0; i < portionRows.length; i++) {
        const row = portionRows[i];
        if (!row) continue;
        const isLast = i === portionRows.length - 1;
        const lineTotal = lineAmountCents(row);
        let lineTaxable = Math.round(lineTotal / 1.18);
        let lineIgv = lineTotal - lineTaxable;

        if (isLast) {
          lineTaxable = taxable - accumulatedLineTaxable;
          lineIgv = igv - accumulatedLineIgv;
        } else {
          accumulatedLineTaxable += lineTaxable;
          accumulatedLineIgv += lineIgv;
        }

        const saleItemId = crypto.randomUUID();
        saleItemByOrderItem.set(row.id, { saleItemId, saleId: portion.saleId });
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_items (
                   id, tenant_id, sale_id, product_id, product_name, product_type,
                   quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                   subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                   total_amount_cents, is_uncatalogued, batch_id
                 ) VALUES (?, ?, ?, ?, ?, 'physical', ?, ?, 0, 0, ?, '10', ?, 0, ?, 0, NULL)`,
            )
            .bind(
              saleItemId,
              tenantId,
              portion.saleId,
              row.product_id,
              row.product_name,
              row.quantity,
              row.unit_price_cents,
              lineTaxable,
              lineIgv,
              lineTotal,
            ),
        );
        plan.add(
          db
            .prepare(
              `UPDATE order_items
               SET status = 'BILLED', sale_id = ?
               WHERE id = ? AND tenant_id = ? AND status != 'CANCELLED' AND sale_id IS NULL`,
            )
            .bind(portion.saleId, row.id, tenantId),
        );
      }

      plan.add(
        db
          .prepare(
            `INSERT INTO sale_payments (
                 id, tenant_id, sale_id, payment_method_id, amount_cents
               ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), tenantId, portion.saleId, input.paymentMethodId, totalAmount),
      );
    }

    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series
           SET current_number = current_number + ?
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(portions.length, seriesRow.id, tenantId),
    );

    for (const delta of stockDeltas) {
      const qty = -delta.qtyDelta;
      const qtyMicrounits = Math.round(qty * QUANTITY_SCALE);
      plan.add(
        db
          .prepare(
            `UPDATE branch_product_stock
             SET stock = stock - ?,
                 stock_microunits = stock_microunits - ?,
                 updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND stock_microunits >= ?`,
          )
          .bind(qty, qtyMicrounits, tenantId, order.branch_id, delta.productId, qtyMicrounits),
      );
      appendLocationStockDeltaToPlan(plan, db, {
        tenantId,
        branchId: order.branch_id,
        productId: delta.productId,
        deltaMicrounits: -qtyMicrounits,
      });
      plan.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
                 id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
                 quantity_delta_microunits, unit_cost_cents, stock_after,
                 stock_after_microunits, user_id, reference_id
               ) VALUES (?, ?, ?, ?, 'VENTA', ?, ?, 0,
                 (SELECT stock FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 (SELECT stock_microunits FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            order.branch_id,
            delta.productId,
            delta.qtyDelta,
            -qtyMicrounits,
            tenantId,
            order.branch_id,
            delta.productId,
            tenantId,
            order.branch_id,
            delta.productId,
            userId,
            input.orderId,
          ),
      );
    }

    for (const item of billable) {
      const target = saleItemByOrderItem.get(item.id);
      if (!target) continue;
      for (const serialId of input.serialIdsByItemId?.[item.id] ?? []) {
        const serial = preparedSerials.find((candidate) => candidate.serialId === serialId);
        if (!serial) throw new Error('SERIAL_IDENTITY_INVALID');
        await appendSerialTransitionToPlan(plan, db, {
          tenantId,
          serialId,
          branchId: serial.branchId,
          locationId: serial.locationId,
          productId: serial.productId,
          expectedStatus: 'AVAILABLE',
          nextStatus: 'SOLD',
          expectedVersion: serial.version,
          eventType: 'SALE',
          operationType: 'ORDER_BILLING',
          operationId: input.orderId,
          operationLineId: item.id,
          idempotencyKey: `order:${input.orderId}:${serialId}`,
          actorUserId: userId,
          currentSaleItemId: target.saleItemId,
        });
      }
    }

    plan.add(
      db
        .prepare(
          `UPDATE orders
           SET status = 'PAID', closed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ? AND status IN ('FIRED', 'READY')`,
        )
        .bind(input.orderId, tenantId),
    );
  });

  return {
    orderId: input.orderId,
    orderStatus: 'PAID',
    sales: portions.map((p, i) => ({
      saleId: p.saleId,
      amountCents: p.amountCents,
      itemIds: [...p.itemIds],
      number: seriesStartNumber + 1 + i,
    })),
  };
}

/** Cancel order item with one-shot authz token (READY) + audit. */
export async function cancelOrderItemAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly orderItemId: string;
    readonly authTokenHash: string | null;
    readonly authorizedByUserId: string | null;
  },
): Promise<{ readonly id: string; readonly status: 'CANCELLED' }> {
  const item = await db
    .prepare(`SELECT id, status, order_id FROM order_items WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(input.orderItemId, tenantId)
    .first<{ id: string; status: OrderItemStatus; order_id: string }>();
  if (!item) throw new Error('ORDER_ITEM_NOT_FOUND');

  assertItemCancelAuthorized(item.status, input.authorizedByUserId);
  assertOrderItemTransition(item.status, 'CANCELLED');

  let tokenId: string | null = null;
  if (item.status === 'READY') {
    if (!input.authTokenHash?.trim()) throw new Error('AUTH_TOKEN_REQUIRED');
    const tok = await db
      .prepare(
        `SELECT id FROM authorization_tokens
         WHERE tenant_id = ? AND token_hash = ?
           AND used_at IS NULL AND expires_at > datetime('now')
         LIMIT 1`,
      )
      .bind(tenantId, input.authTokenHash)
      .first<{ id: string }>();
    if (!tok) throw new Error('AUTH_TOKEN_INVALID');
    tokenId = tok.id;
  }

  const prevHash = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();

  const auditId = crypto.randomUUID();
  const payload = {
    action: 'ORDER_ITEM_CANCEL',
    orderItemId: item.id,
    orderId: item.order_id,
    authorizedByUserId: input.authorizedByUserId,
  };
  const rowHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ ...payload, prev: prevHash?.row_hash ?? null })),
  );
  const rowHash = [...new Uint8Array(rowHashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await runD1AtomicPlan(db, (plan: AtomicPlanBuilder) => {
    plan.add(
      db
        .prepare(
          `UPDATE order_items
           SET status = 'CANCELLED', authorized_by_user_id = ?
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(input.authorizedByUserId, item.id, tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, 'ORDER_ITEM_CANCEL', 'order_item', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          userId,
          item.id,
          JSON.stringify(payload),
          prevHash?.row_hash ?? null,
          rowHash,
        ),
    );
    if (tokenId) {
      plan.add(
        db
          .prepare(
            `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
          )
          .bind(tokenId, tenantId),
      );
    }
  });

  return { id: item.id, status: 'CANCELLED' };
}
