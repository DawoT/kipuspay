/**
 * Sprint 20 — stock transfers ACID (espejo origen/destino + cancel).
 * Preflight fuera; una sola db.batch vía runD1AtomicPlan.
 */
import {
  assertShrinkJustified,
  assertTransferLineConservation,
  assertTransferTransition,
  planCancelInTransit,
  planReceiveStockDeltas,
  planShipStockDeltas,
  QUANTITY_SCALE,
  refreshAvgCostCents,
  type TransferStatus,
} from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { sha256Hex } from './crypto.js';
import {
  appendLocationStockDeltaToPlan,
  defaultLocationId,
} from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  appendSerialManifestItemToPlan,
  loadSerialsForStockOperation,
  type PreparedSerialIdentity,
} from './process-inventory-serial-atomic.js';

export interface TransferLineInput {
  readonly productId: string;
  readonly qtySent: number;
  readonly batchId?: string | null;
  readonly serialIds?: readonly string[];
}

interface TransferRow {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  status: TransferStatus;
}

interface TransferLineRow {
  id: string;
  product_id: string;
  qty_sent: number;
}

interface StockSnap {
  stock: number;
  stock_microunits: number;
  pmp_unit_cost_cents: number;
}

export async function createStockTransferAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly fromBranchId: string;
    readonly toBranchId: string;
    readonly notes?: string | null;
    readonly lines: readonly TransferLineInput[];
  },
): Promise<{ readonly id: string; readonly status: 'DRAFT' }> {
  if (input.fromBranchId === input.toBranchId) throw new Error('TRANSFER_SAME_BRANCH');
  if (input.lines.length === 0) throw new Error('TRANSFER_REQUIRES_LINES');
  for (const line of input.lines) {
    if (!(line.qtySent > 0) || !Number.isFinite(line.qtySent)) {
      throw new Error('INVALID_TRANSFER_QTY');
    }
  }
  const id = crypto.randomUUID();
  const serials = await loadSerialsForStockOperation(
    db,
    tenantId,
    input.fromBranchId,
    input.lines.map((line) => ({
      productId: line.productId,
      quantityMicrounits: Math.round(line.qtySent * QUANTITY_SCALE),
      serialIds: line.serialIds ?? [],
    })),
    'AVAILABLE',
  );
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO stock_transfers (
               id, tenant_id, from_branch_id, to_branch_id, status, notes, created_by_user_id
             ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)`,
        )
        .bind(id, tenantId, input.fromBranchId, input.toBranchId, input.notes ?? null, userId),
    );
    for (const line of input.lines) {
      plan.add(
        db
          .prepare(
            `INSERT INTO stock_transfer_lines (
                 id, tenant_id, transfer_id, product_id, batch_id,
                 qty_sent, qty_received, qty_shrink
               ) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            id,
            line.productId,
            line.batchId ?? null,
            line.qtySent,
          ),
      );
    }
    for (const serial of serials) {
      appendSerialManifestItemToPlan(plan, db, {
        tenantId,
        serialId: serial.serialId,
        operationType: 'STOCK_TRANSFER_DRAFT',
        operationId: id,
        idempotencyKey: `stock-transfer-draft:${id}`,
      });
    }
  });
  return { id, status: 'DRAFT' };
}

export async function shipStockTransferAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  transferId: string,
): Promise<{ readonly id: string; readonly status: 'IN_TRANSIT' }> {
  const xfer = await loadTransfer(db, tenantId, transferId);
  assertTransferTransition(xfer.status, 'IN_TRANSIT');
  const lines = await loadTransferLines(db, tenantId, transferId);
  if (lines.length === 0) throw new Error('TRANSFER_REQUIRES_LINES');
  const deltas = planShipStockDeltas({
    originBranchId: xfer.from_branch_id,
    lines: lines.map((l) => ({ productId: l.product_id, quantity: l.qty_sent })),
  });

  for (const d of deltas) {
    const snap = await loadStock(db, tenantId, d.branchId, d.productId);
    const needMicrounits = Math.round(-d.qtyDelta * QUANTITY_SCALE);
    if (!snap || snap.stock_microunits < needMicrounits) throw new Error('INSUFFICIENT_STOCK');
  }
  const transferSerials = await loadTransferSerials(db, tenantId, transferId, 'AVAILABLE');

  await runD1AtomicPlan(db, async (plan) => {
    plan.guardState(
      `SELECT 1 FROM stock_transfers WHERE id = ? AND tenant_id = ? AND status = 'DRAFT'`,
      [transferId, tenantId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE stock_transfers
           SET status = 'IN_TRANSIT', shipped_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ? AND status = 'DRAFT'`,
        )
        .bind(transferId, tenantId),
    );
    for (const d of deltas) {
      addDebitStock(
        plan,
        db,
        tenantId,
        userId,
        transferId,
        d.branchId,
        d.productId,
        -d.qtyDelta,
        d.movementType,
      );
    }
    for (const serial of transferSerials) {
      await appendSerialTransitionToPlan(plan, db, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'AVAILABLE',
        nextStatus: 'IN_TRANSIT',
        expectedVersion: serial.version,
        eventType: 'TRANSFER_SHIP',
        operationType: 'STOCK_TRANSFER',
        operationId: transferId,
        idempotencyKey: `transfer-ship:${transferId}:${serial.serialId}`,
        actorUserId: userId,
      });
    }
  });
  return { id: transferId, status: 'IN_TRANSIT' };
}

export async function receiveStockTransferAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly transferId: string;
    readonly lines: readonly {
      readonly lineId: string;
      readonly qtyReceived: number;
      readonly qtyShrink: number;
      readonly shrinkReason: string | null;
    }[];
  },
): Promise<{ readonly id: string; readonly status: 'RECEIVED' }> {
  const xfer = await loadTransfer(db, tenantId, input.transferId);
  assertTransferTransition(xfer.status, 'RECEIVED');
  const existing = await loadTransferLines(db, tenantId, input.transferId);
  const byId = new Map(existing.map((l) => [l.id, l]));

  const receiveLines = input.lines.map((l) => {
    const row = byId.get(l.lineId);
    if (!row) throw new Error('UNKNOWN_TRANSFER_LINE');
    assertTransferLineConservation({
      qtySent: row.qty_sent,
      qtyReceived: l.qtyReceived,
      qtyShrink: l.qtyShrink,
    });
    assertShrinkJustified(l.qtyShrink, l.shrinkReason);
    return {
      productId: row.product_id,
      qtyReceived: l.qtyReceived,
      qtyShrink: l.qtyShrink,
      shrinkReason: l.shrinkReason,
      lineId: l.lineId,
    };
  });

  const deltas = planReceiveStockDeltas({
    destinationBranchId: xfer.to_branch_id,
    lines: receiveLines,
  });
  const transferSerials = await loadTransferSerials(db, tenantId, input.transferId, 'IN_TRANSIT');

  const creditPlans: {
    productId: string;
    qty: number;
    newPmp: number;
    exists: boolean;
    movementType: string;
  }[] = [];

  for (const d of deltas) {
    if (d.movementType !== 'TRANSFER_IN' || d.qtyDelta <= 0) continue;
    const snap = await loadStock(db, tenantId, d.branchId, d.productId);
    const costRow = await db
      .prepare(`SELECT cost_cents FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(d.productId, tenantId)
      .first<{ cost_cents: number }>();
    const prevStock = snap?.stock ?? 0;
    const prevPmp = snap?.pmp_unit_cost_cents ?? 0;
    const inboundCost = costRow?.cost_cents ?? prevPmp;
    const newPmp = refreshAvgCostCents({
      previousStock: prevStock,
      previousPmpCents: prevPmp,
      inboundQty: d.qtyDelta,
      inboundUnitCostCents: inboundCost,
    });
    creditPlans.push({
      productId: d.productId,
      qty: d.qtyDelta,
      newPmp,
      exists: Boolean(snap),
      movementType: d.movementType,
    });
  }

  const initialPrevHash = await previousAuditHash(db, tenantId);
  let currentPrev = initialPrevHash;
  const varianceAudits: {
    lineId: string;
    productId: string;
    qtyShrink: number;
    reason: string | null;
    prevHash: string | null;
    rowHash: string;
    payloadJson: string;
  }[] = [];
  for (const l of input.lines) {
    if (l.qtyShrink <= 0) continue;
    const row = byId.get(l.lineId)!;
    const payload = {
      action: 'TRANSFER_VARIANCE',
      transferId: input.transferId,
      lineId: l.lineId,
      productId: row.product_id,
      qtyShrink: l.qtyShrink,
      reason: l.shrinkReason,
    };
    const payloadJson = JSON.stringify(payload);
    const rowHash = await sha256Hex(JSON.stringify({ ...payload, prev: currentPrev }));
    varianceAudits.push({
      lineId: l.lineId,
      productId: row.product_id,
      qtyShrink: l.qtyShrink,
      reason: l.shrinkReason,
      prevHash: currentPrev,
      rowHash,
      payloadJson,
    });
    currentPrev = rowHash;
  }

  await runD1AtomicPlan(db, async (plan) => {
    plan.guardState(
      `SELECT 1 FROM stock_transfers WHERE id = ? AND tenant_id = ? AND status = 'IN_TRANSIT'`,
      [input.transferId, tenantId],
    );
    for (const l of input.lines) {
      plan.add(
        db
          .prepare(
            `UPDATE stock_transfer_lines
             SET qty_received = ?, qty_shrink = ?, shrink_reason = ?
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(l.qtyReceived, l.qtyShrink, l.shrinkReason, l.lineId, tenantId),
      );
    }
    plan.add(
      db
        .prepare(
          `UPDATE stock_transfers
           SET status = 'RECEIVED', received_at = CURRENT_TIMESTAMP
           WHERE id = ? AND tenant_id = ? AND status = 'IN_TRANSIT'`,
        )
        .bind(input.transferId, tenantId),
    );

    for (const c of creditPlans) {
      addCreditStock(
        plan,
        db,
        tenantId,
        userId,
        input.transferId,
        xfer.to_branch_id,
        c.productId,
        c.qty,
        c.newPmp,
        c.exists,
        c.movementType,
      );
    }
    for (const serial of transferSerials) {
      await appendSerialTransitionToPlan(plan, db, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'IN_TRANSIT',
        nextStatus: 'AVAILABLE',
        expectedVersion: serial.version,
        eventType: 'TRANSFER_RECEIVE',
        operationType: 'STOCK_TRANSFER',
        operationId: input.transferId,
        idempotencyKey: `transfer-receive:${input.transferId}:${serial.serialId}`,
        actorUserId: userId,
        nextBranchId: xfer.to_branch_id,
        nextLocationId: defaultLocationId(tenantId, xfer.to_branch_id),
      });
    }

    for (const v of varianceAudits) {
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
                 id, tenant_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, 'TRANSFER_VARIANCE', 'stock_transfer', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            userId,
            input.transferId,
            v.payloadJson,
            v.prevHash,
            v.rowHash,
          ),
      );
    }
  });

  return { id: input.transferId, status: 'RECEIVED' };
}

export async function cancelStockTransferAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  transferId: string,
): Promise<{ readonly id: string; readonly status: 'CANCELLED' }> {
  const xfer = await loadTransfer(db, tenantId, transferId);
  assertTransferTransition(xfer.status, 'CANCELLED');
  const lines = await loadTransferLines(db, tenantId, transferId);
  const deltas = planCancelInTransit({
    originBranchId: xfer.from_branch_id,
    status: xfer.status,
    lines: lines.map((l) => ({ productId: l.product_id, quantity: l.qty_sent })),
  });
  const transferSerials =
    xfer.status === 'IN_TRANSIT'
      ? await loadTransferSerials(db, tenantId, transferId, 'IN_TRANSIT')
      : [];

  const creditPlans: { productId: string; qty: number; newPmp: number; exists: boolean }[] = [];
  for (const d of deltas) {
    if (d.qtyDelta <= 0) continue;
    const snap = await loadStock(db, tenantId, d.branchId, d.productId);
    creditPlans.push({
      productId: d.productId,
      qty: d.qtyDelta,
      newPmp: snap?.pmp_unit_cost_cents ?? 0,
      exists: Boolean(snap),
    });
  }

  await runD1AtomicPlan(db, async (plan) => {
    plan.guardState(
      `SELECT 1 FROM stock_transfers WHERE id = ? AND tenant_id = ? AND status IN ('DRAFT', 'IN_TRANSIT')`,
      [transferId, tenantId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE stock_transfers SET status = 'CANCELLED'
           WHERE id = ? AND tenant_id = ? AND status IN ('DRAFT', 'IN_TRANSIT')`,
        )
        .bind(transferId, tenantId),
    );
    for (const c of creditPlans) {
      addCreditStock(
        plan,
        db,
        tenantId,
        userId,
        transferId,
        xfer.from_branch_id,
        c.productId,
        c.qty,
        c.newPmp,
        c.exists,
        'TRANSFER_CANCEL',
      );
    }
    for (const serial of transferSerials) {
      await appendSerialTransitionToPlan(plan, db, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'IN_TRANSIT',
        nextStatus: 'AVAILABLE',
        expectedVersion: serial.version,
        eventType: 'TRANSFER_CANCEL',
        operationType: 'STOCK_TRANSFER',
        operationId: transferId,
        idempotencyKey: `transfer-cancel:${transferId}:${serial.serialId}`,
        actorUserId: userId,
      });
    }
  });
  return { id: transferId, status: 'CANCELLED' };
}

async function loadTransfer(
  db: D1DatabaseLike,
  tenantId: string,
  transferId: string,
): Promise<TransferRow> {
  const row = await db
    .prepare(
      `SELECT id, from_branch_id, to_branch_id, status
       FROM stock_transfers WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(transferId, tenantId)
    .first<TransferRow>();
  if (!row) throw new Error('TRANSFER_NOT_FOUND');
  return row;
}

async function loadTransferLines(
  db: D1DatabaseLike,
  tenantId: string,
  transferId: string,
): Promise<TransferLineRow[]> {
  const res = await db
    .prepare(
      `SELECT id, product_id, qty_sent FROM stock_transfer_lines
       WHERE transfer_id = ? AND tenant_id = ?`,
    )
    .bind(transferId, tenantId)
    .all<TransferLineRow>();
  return [...(res.results ?? [])];
}

async function loadTransferSerials(
  db: D1DatabaseLike,
  tenantId: string,
  transferId: string,
  status: string,
): Promise<readonly PreparedSerialIdentity[]> {
  const rows = await db
    .prepare(
      `SELECT sn.id, sn.product_id, sn.branch_id, sn.location_id, sn.status, sn.version
       FROM serial_numbers sn
       INNER JOIN serial_manifest_items smi
         ON smi.tenant_id = sn.tenant_id AND smi.serial_id = sn.id
       INNER JOIN serial_manifests sm
         ON sm.tenant_id = smi.tenant_id AND sm.id = smi.manifest_id
       WHERE sn.tenant_id = ? AND sm.operation_type = 'STOCK_TRANSFER_DRAFT'
         AND sm.operation_id = ? AND sn.status = ?`,
    )
    .bind(tenantId, transferId, status)
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

async function loadStock(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  productId: string,
): Promise<StockSnap | null> {
  return db
    .prepare(
      `SELECT stock, stock_microunits, pmp_unit_cost_cents FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
    )
    .bind(tenantId, branchId, productId)
    .first<StockSnap>();
}

function addDebitStock(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  refId: string,
  branchId: string,
  productId: string,
  qtyAbs: number,
  movementType: string,
): void {
  const qtyMicrounits = Math.round(qtyAbs * QUANTITY_SCALE);
  plan.add(
    db
      .prepare(
        `UPDATE branch_product_stock
         SET stock = stock - ?,
             stock_microunits = stock_microunits - ?,
             updated_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND stock_microunits >= ?`,
      )
      .bind(qtyAbs, qtyMicrounits, tenantId, branchId, productId, qtyMicrounits),
  );
  appendLocationStockDeltaToPlan(plan, db, {
    tenantId,
    branchId,
    productId,
    deltaMicrounits: -qtyMicrounits,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
             id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
             quantity_delta_microunits, unit_cost_cents, stock_after,
             stock_after_microunits, user_id, reference_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 0,
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
        productId,
        movementType,
        -qtyAbs,
        -qtyMicrounits,
        tenantId,
        branchId,
        productId,
        tenantId,
        branchId,
        productId,
        userId,
        refId,
      ),
  );
}

function addCreditStock(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  refId: string,
  branchId: string,
  productId: string,
  qty: number,
  newPmp: number,
  exists: boolean,
  movementType: string,
): void {
  const qtyMicrounits = Math.round(qty * QUANTITY_SCALE);
  if (exists) {
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
        .bind(qty, qtyMicrounits, newPmp, tenantId, branchId, productId),
    );
  } else {
    plan.add(
      db
        .prepare(
          `INSERT INTO branch_product_stock (
               tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents, version
             ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(tenantId, branchId, productId, qty, qtyMicrounits, newPmp),
    );
  }
  appendLocationStockDeltaToPlan(plan, db, {
    tenantId,
    branchId,
    productId,
    deltaMicrounits: qtyMicrounits,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
             id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
             quantity_delta_microunits, unit_cost_cents, stock_after,
             stock_after_microunits, user_id, reference_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 0,
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
        productId,
        movementType,
        qty,
        qtyMicrounits,
        tenantId,
        branchId,
        productId,
        tenantId,
        branchId,
        productId,
        userId,
        refId,
      ),
  );
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
