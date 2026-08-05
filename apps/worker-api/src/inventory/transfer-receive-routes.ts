/**
 * Transferencias + recepción parcial OC — Sprint 20.
 */
import {
  assertTransferLineConservation,
  assertTransferTransition,
  type TransferStatus,
} from '@kipuspay/domain-inventory';
import {
  assertPurchaseOrderTransition,
  planPartialReceive,
  type PurchaseOrderStatus,
} from '@kipuspay/domain-cash';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isStockTransfersEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_STOCK_TRANSFERS === '1' || env?.FEATURE_STOCK_TRANSFERS === 'true';
}

export function isPartialReceiveEnabled(env: WorkerEnv | undefined): boolean {
  return (
    env?.FEATURE_PURCHASING_PARTIAL_RECEIVE === '1' ||
    env?.FEATURE_PURCHASING_PARTIAL_RECEIVE === 'true'
  );
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

type LoadTransferRowResult =
  | { ok: true; status: TransferStatus }
  | { ok: false; status: number; body: { error: string; code: string } };

async function loadTransferRow(
  db: D1Database,
  transferId: string,
  tenantId: string,
  target: TransferStatus,
): Promise<LoadTransferRowResult> {
  const row = await db
    .prepare(`SELECT status FROM stock_transfers WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(transferId, tenantId)
    .first<{ status: TransferStatus }>();
  if (!row)
    return { ok: false, status: 404, body: { error: 'Transfer not found', code: 'NOT_FOUND' } };
  try {
    assertTransferTransition(row.status, target);
  } catch (e) {
    return {
      ok: false,
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'TRANSFER_INVALID' },
    };
  }
  return { ok: true, status: row.status };
}

type ValidateReceiveLinesResult =
  { ok: true } | { ok: false; status: number; body: { error: string; code: string } };

function validateReceiveLines(
  lines: readonly {
    lineId?: string;
    qtyReceived?: number;
    qtyShrink?: number;
    shrinkReason?: string | null;
  }[],
  qtySentById: ReadonlyMap<string, number>,
): ValidateReceiveLinesResult {
  for (const line of lines) {
    const sent = qtySentById.get(line.lineId ?? '');
    if (sent === undefined) {
      return {
        ok: false,
        status: 422,
        body: { error: 'UNKNOWN_TRANSFER_LINE', code: 'UNKNOWN_TRANSFER_LINE' },
      };
    }
    try {
      assertTransferLineConservation({
        qtySent: sent,
        qtyReceived: line.qtyReceived ?? 0,
        qtyShrink: line.qtyShrink ?? 0,
      });
    } catch (e) {
      return {
        ok: false,
        status: 422,
        body: { error: String(e instanceof Error ? e.message : e), code: 'TRANSFER_QTY_MISMATCH' },
      };
    }
    if ((line.qtyShrink ?? 0) > 0 && !(line.shrinkReason && line.shrinkReason.trim())) {
      return {
        ok: false,
        status: 422,
        body: { error: 'SHRINK_REASON_REQUIRED', code: 'SHRINK_REASON_REQUIRED' },
      };
    }
  }
  return { ok: true };
}

interface PoContext {
  status: PurchaseOrderStatus;
  orderedQtyByProduct: ReadonlyMap<string, number>;
  previouslyReceivedQtyByProduct: ReadonlyMap<string, number>;
}

interface NormalizedReceiveLine {
  productId: string;
  quantity: number;
  unitCostCents: number;
  batchNumber: string | null;
  expiryDate: string | null;
}

function normalizeReceiveLines(
  lines: readonly {
    productId?: string;
    quantity?: number;
    unitCostCents?: number;
    batchNumber?: string | null;
    expiryDate?: string | null;
  }[],
): NormalizedReceiveLine[] {
  return lines.map((l) => ({
    productId: l.productId ?? '',
    quantity: l.quantity ?? 0,
    unitCostCents: l.unitCostCents ?? 0,
    batchNumber: l.batchNumber ?? null,
    expiryDate: l.expiryDate ?? null,
  }));
}

function accumulateReceivedStmts(
  db: D1Database,
  poId: string,
  previouslyReceived: ReadonlyMap<string, number>,
  lines: readonly { productId?: string; quantity?: number }[],
): D1PreparedStatement[] {
  return lines.map((l) => {
    const productId = l.productId ?? '';
    const quantityReceived = (previouslyReceived.get(productId) ?? 0) + (l.quantity ?? 0);
    return db
      .prepare(
        `UPDATE purchase_order_items
         SET quantity_received = ?
         WHERE purchase_order_id = ? AND product_id = ?`,
      )
      .bind(quantityReceived, poId, productId);
  });
}

type LoadPoContextResult =
  | { ok: true; po: PoContext }
  | { ok: false; status: number; body: { error: string; code: string } };

async function loadPoContext(
  db: D1Database,
  poId: string,
  tenantId: string,
): Promise<LoadPoContextResult> {
  const po = await db
    .prepare(`SELECT status FROM purchase_orders WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(poId, tenantId)
    .first<{ status: PurchaseOrderStatus }>();
  if (!po) return { ok: false, status: 404, body: { error: 'PO not found', code: 'NOT_FOUND' } };

  const poLines = await db
    .prepare(
      `SELECT product_id, quantity_ordered AS quantity, quantity_received, unit_cost_cents
       FROM purchase_order_items WHERE purchase_order_id = ?`,
    )
    .bind(poId)
    .all<{
      product_id: string;
      quantity: number;
      quantity_received: number;
      unit_cost_cents: number;
    }>();

  return {
    ok: true,
    po: {
      status: po.status,
      orderedQtyByProduct: new Map((poLines.results ?? []).map((l) => [l.product_id, l.quantity])),
      previouslyReceivedQtyByProduct: new Map(
        (poLines.results ?? []).map((l) => [l.product_id, l.quantity_received ?? 0]),
      ),
    },
  };
}

export async function runShipTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { transferId?: string },
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();
  const transferId = body.transferId?.trim() ?? '';
  if (!transferId)
    return { status: 400, body: { error: 'transferId required', code: 'BAD_REQUEST' } };

  const row = await loadTransferRow(env.DB, transferId, tenantId, 'IN_TRANSIT');
  if (!row.ok) return { status: row.status, body: row.body };

  await env.DB.prepare(
    `UPDATE stock_transfers SET status = 'IN_TRANSIT', shipped_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(transferId, tenantId)
    .run();
  return { status: 200, body: { id: transferId, status: 'IN_TRANSIT' } };
}

export async function runReceiveTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    transferId?: string;
    lines?: readonly {
      lineId?: string;
      qtyReceived?: number;
      qtyShrink?: number;
      shrinkReason?: string | null;
    }[];
  },
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();
  const transferId = body.transferId?.trim() ?? '';
  if (!transferId)
    return { status: 400, body: { error: 'transferId required', code: 'BAD_REQUEST' } };

  const row = await loadTransferRow(env.DB, transferId, tenantId, 'RECEIVED');
  if (!row.ok) return { status: row.status, body: row.body };

  const dbLines = await env.DB.prepare(
    `SELECT id, qty_sent FROM stock_transfer_lines WHERE transfer_id = ? AND tenant_id = ?`,
  )
    .bind(transferId, tenantId)
    .all<{ id: string; qty_sent: number }>();

  const byId = new Map((dbLines.results ?? []).map((l) => [l.id, l.qty_sent]));
  const validated = validateReceiveLines(body.lines ?? [], byId);
  if (!validated.ok) return { status: validated.status, body: validated.body };

  const stmts = [
    ...(body.lines ?? []).map((line) =>
      env
        .DB!.prepare(
          `UPDATE stock_transfer_lines
         SET qty_received = ?, qty_shrink = ?, shrink_reason = ?
         WHERE id = ? AND tenant_id = ?`,
        )
        .bind(
          line.qtyReceived ?? 0,
          line.qtyShrink ?? 0,
          line.shrinkReason ?? null,
          line.lineId,
          tenantId,
        ),
    ),
    env.DB.prepare(
      `UPDATE stock_transfers SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
    ).bind(transferId, tenantId),
  ];
  await env.DB.batch(stmts);
  return { status: 200, body: { id: transferId, status: 'RECEIVED' } };
}

export async function runPartialReceivePoHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    purchaseOrderId?: string;
    branchId?: string;
    lines?: readonly {
      productId?: string;
      quantity?: number;
      unitCostCents?: number;
      batchNumber?: string | null;
      expiryDate?: string | null;
    }[];
  },
): Promise<HttpResult> {
  if (!isPartialReceiveEnabled(env)) return featureOff('FEATURE_PURCHASING_PARTIAL_RECEIVE');
  if (!env?.DB) return dbUnavailable();
  const poId = body.purchaseOrderId?.trim() ?? '';
  const branchId = body.branchId?.trim() ?? '';
  if (!poId || !branchId) {
    return {
      status: 400,
      body: { error: 'purchaseOrderId and branchId required', code: 'BAD_REQUEST' },
    };
  }

  const ctx = await loadPoContext(env.DB, poId, tenantId);
  if (!ctx.ok) return { status: ctx.status, body: ctx.body };

  const receiveLines = normalizeReceiveLines(body.lines ?? []);

  let plan;
  try {
    plan = planPartialReceive({
      purchaseOrderId: poId,
      currentStatus: ctx.po.status,
      orderedQtyByProduct: ctx.po.orderedQtyByProduct,
      previouslyReceivedQtyByProduct: ctx.po.previouslyReceivedQtyByProduct,
      lines: receiveLines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
      })),
    });
    assertPurchaseOrderTransition(ctx.po.status, plan.nextStatus);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { error: msg, code: msg } };
  }

  const receiptId = crypto.randomUUID();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO purchase_receipts (
           id, tenant_id, purchase_order_id, branch_id, received_by_user_id
         ) VALUES (?, ?, ?, ?, ?)`,
    ).bind(receiptId, tenantId, poId, branchId, userId),
    ...receiveLines.map((l) =>
      env
        .DB!.prepare(
          `INSERT INTO purchase_receipt_lines (
             id, tenant_id, receipt_id, product_id, batch_number, expiry_date, quantity, unit_cost_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          receiptId,
          l.productId,
          l.batchNumber,
          l.expiryDate,
          l.quantity,
          l.unitCostCents,
        ),
    ),
    ...accumulateReceivedStmts(
      env.DB,
      poId,
      ctx.po.previouslyReceivedQtyByProduct,
      body.lines ?? [],
    ),
    env.DB.prepare(`UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ?`).bind(
      plan.nextStatus,
      poId,
      tenantId,
    ),
  ];
  await env.DB.batch(stmts);

  return {
    status: 200,
    body: {
      receiptId,
      purchaseOrderId: poId,
      nextStatus: plan.nextStatus,
      apAmountCents: plan.apAmountCents,
    },
  };
}
