/**
 * Sprint 18 — conteo físico, merma, alertas Dueño (Arquitectura §5.3).
 */
import {
  assertCountDiffAuthorized,
  assertCountMutable,
  assertInventoryCountTransition,
  assertStockLossReject,
  evaluateStockAlerts,
  firstExpiringAtUtc,
  planApproveStockLoss,
  suggestReorderQty,
  type InventoryCountStatus,
  type StockLossCategory,
  type StockLossStatus,
} from '@kipuspay/domain-inventory';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isInventoryOpsEnabled(env: WorkerEnv | undefined): boolean {
  return (
    env?.FEATURE_INVENTORY_BATCHES === '1' ||
    env?.FEATURE_INVENTORY_BATCHES === 'true' ||
    env?.FEATURE_INVENTORY_BOM === '1' ||
    env?.FEATURE_INVENTORY_BOM === 'true'
  );
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_INVENTORY_* off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

export async function runCreateInventoryCountHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { branchId?: string; differenceThresholdCents?: number },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const branchId = body.branchId?.trim() ?? '';
  if (!branchId) return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO inventory_counts (
         id, tenant_id, branch_id, created_by_user_id, status, blind, difference_threshold_cents
       ) VALUES (?, ?, ?, ?, 'COUNTING', 1, ?)`,
  )
    .bind(id, tenantId, branchId, userId, body.differenceThresholdCents ?? 0)
    .run();
  return { status: 200, body: { id, status: 'COUNTING', blind: true } };
}

export async function runSubmitCountReviewHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    countId?: string;
    lines?: readonly {
      productId?: string;
      countedQty?: number;
      systemQty?: number;
      unitCostCents?: number;
      batchId?: string | null;
    }[];
  },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const countId = body.countId?.trim() ?? '';
  if (!countId) return { status: 400, body: { error: 'countId required', code: 'BAD_REQUEST' } };

  const count = await env.DB.prepare(
    `SELECT status FROM inventory_counts WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(countId, tenantId)
    .first<{ status: InventoryCountStatus }>();
  if (!count) return { status: 404, body: { error: 'Count not found', code: 'NOT_FOUND' } };
  try {
    assertCountMutable(count.status);
    assertInventoryCountTransition(count.status, 'DIFFERENCE_REVIEW');
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'COUNT_INVALID' },
    };
  }

  const lines = body.lines ?? [];
  const stmts = [
    ...lines.map((l) => {
      const counted = l.countedQty ?? 0;
      const system = l.systemQty ?? 0;
      const diff = counted - system;
      const unitCost = l.unitCostCents ?? 0;
      return env
        .DB!.prepare(
          `INSERT INTO inventory_count_lines (
             id, count_id, product_id, batch_id, counted_qty, system_qty, difference_qty,
             unit_cost_cents, diff_value_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          countId,
          l.productId ?? '',
          l.batchId ?? null,
          counted,
          system,
          diff,
          unitCost,
          Math.round(diff * unitCost),
        );
    }),
    env.DB.prepare(
      `UPDATE inventory_counts SET status = 'DIFFERENCE_REVIEW' WHERE id = ? AND tenant_id = ?`,
    ).bind(countId, tenantId),
  ];
  await env.DB.batch(stmts);
  return {
    status: 200,
    body: { id: countId, status: 'DIFFERENCE_REVIEW', lineCount: lines.length },
  };
}

/* eslint-disable complexity -- approve count: authz + AJUSTE multi-línea en un batch */
export async function runApproveCountHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { countId?: string; authorizedByUserId?: string | null },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const countId = body.countId?.trim() ?? '';
  if (!countId) return { status: 400, body: { error: 'countId required', code: 'BAD_REQUEST' } };

  const count = await env.DB.prepare(
    `SELECT status, difference_threshold_cents, branch_id
     FROM inventory_counts WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(countId, tenantId)
    .first<{
      status: InventoryCountStatus;
      difference_threshold_cents: number | null;
      branch_id: string;
    }>();
  if (!count) return { status: 404, body: { error: 'Count not found', code: 'NOT_FOUND' } };

  const lines = await env.DB.prepare(
    `SELECT product_id, difference_qty, unit_cost_cents FROM inventory_count_lines WHERE count_id = ?`,
  )
    .bind(countId)
    .all<{ product_id: string; difference_qty: number; unit_cost_cents: number }>();

  try {
    assertInventoryCountTransition(count.status, 'APPROVED');
    assertCountDiffAuthorized({
      lines: (lines.results ?? []).map((l) => ({
        productId: l.product_id,
        differenceQty: l.difference_qty,
        unitCostCents: l.unit_cost_cents ?? 0,
      })),
      differenceThresholdCents: count.difference_threshold_cents ?? 0,
      authorizedByUserId: body.authorizedByUserId ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'AUTH_TOKEN_REQUIRED' ? 403 : 422;
    return { status, body: { error: msg, code: msg } };
  }

  const stmts = [
    env.DB.prepare(
      `UPDATE inventory_counts
       SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
    ).bind(userId, countId, tenantId),
    ...(lines.results ?? [])
      .filter((l) => l.difference_qty !== 0)
      .map((l) =>
        env
          .DB!.prepare(
            `UPDATE branch_product_stock
           SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(l.difference_qty, tenantId, count.branch_id, l.product_id),
      ),
    ...(lines.results ?? [])
      .filter((l) => l.difference_qty !== 0)
      .map((l) =>
        env
          .DB!.prepare(
            `INSERT INTO inventory_movements (
               id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
               unit_cost_cents, stock_after, user_id, reference_id
             ) VALUES (?, ?, ?, ?, 'AJUSTE', ?, ?,
               (SELECT stock FROM branch_product_stock
                WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
               ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            count.branch_id,
            l.product_id,
            l.difference_qty,
            l.unit_cost_cents ?? 0,
            tenantId,
            count.branch_id,
            l.product_id,
            userId,
            countId,
          ),
      ),
  ];
  await env.DB.batch(stmts);
  return { status: 200, body: { id: countId, status: 'APPROVED' } };
}
/* eslint-enable complexity */

export async function runCreateStockLossHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    productId?: string;
    batchId?: string | null;
    quantity?: number;
    category?: StockLossCategory;
    evidenceR2Key?: string | null;
    reason?: string;
  },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const id = crypto.randomUUID();
  try {
    // Validate shape via approve planner preconditions loosely
    if (!(body.quantity && body.quantity > 0)) throw new Error('INVALID_LOSS_QTY');
    if (!(body.reason && body.reason.trim())) throw new Error('LOSS_REASON_REQUIRED');
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'LOSS_REJECTED' },
    };
  }
  await env.DB.prepare(
    `INSERT INTO stock_losses (
         id, tenant_id, branch_id, product_id, batch_id, quantity, category,
         evidence_r2_key, reason, status, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
  )
    .bind(
      id,
      tenantId,
      body.branchId ?? '',
      body.productId ?? '',
      body.batchId ?? null,
      body.quantity,
      body.category ?? 'OTHER',
      body.evidenceR2Key ?? null,
      body.reason,
      userId,
    )
    .run();
  return { status: 200, body: { id, status: 'PENDING' } };
}

export async function runApproveStockLossHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { lossId?: string },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const lossId = body.lossId?.trim() ?? '';
  if (!lossId) return { status: 400, body: { error: 'lossId required', code: 'BAD_REQUEST' } };

  const row = await env.DB.prepare(
    `SELECT status, quantity, category, evidence_r2_key, reason, branch_id, product_id, batch_id
     FROM stock_losses WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(lossId, tenantId)
    .first<{
      status: StockLossStatus;
      quantity: number;
      category: StockLossCategory;
      evidence_r2_key: string | null;
      reason: string;
      branch_id: string;
      product_id: string;
      batch_id: string | null;
    }>();
  if (!row) return { status: 404, body: { error: 'Loss not found', code: 'NOT_FOUND' } };

  let plan;
  try {
    plan = planApproveStockLoss({
      status: row.status,
      quantity: row.quantity,
      category: row.category,
      evidenceR2Key: row.evidence_r2_key,
      reason: row.reason,
      approvedByUserId: userId,
    });
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'LOSS_REJECTED' },
    };
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE stock_losses
       SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
    ).bind(userId, lossId, tenantId),
    env.DB.prepare(
      `UPDATE branch_product_stock
       SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    ).bind(plan.adjustmentQty, tenantId, row.branch_id, row.product_id),
    env.DB.prepare(
      `INSERT INTO inventory_movements (
           id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
           unit_cost_cents, stock_after, user_id, reference_id
         ) VALUES (?, ?, ?, ?, ?, 'AJUSTE', ?, 0,
           (SELECT stock FROM branch_product_stock
            WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
           ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      tenantId,
      row.branch_id,
      row.product_id,
      row.batch_id,
      plan.adjustmentQty,
      tenantId,
      row.branch_id,
      row.product_id,
      userId,
      lossId,
    ),
  ]);
  return {
    status: 200,
    body: { id: lossId, status: plan.nextStatus, adjustmentQty: plan.adjustmentQty },
  };
}

export async function runRejectStockLossHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { lossId?: string },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const lossId = body.lossId?.trim() ?? '';
  const row = await env.DB.prepare(
    `SELECT status FROM stock_losses WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(lossId, tenantId)
    .first<{ status: StockLossStatus }>();
  if (!row) return { status: 404, body: { error: 'Loss not found', code: 'NOT_FOUND' } };
  try {
    assertStockLossReject(row.status);
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'LOSS_REJECTED' },
    };
  }
  await env.DB.prepare(`UPDATE stock_losses SET status = 'REJECTED' WHERE id = ? AND tenant_id = ?`)
    .bind(lossId, tenantId)
    .run();
  return { status: 200, body: { id: lossId, status: 'REJECTED' } };
}

/* eslint-disable complexity -- alerts: policies × stock × batches */
export async function runOwnerStockAlertsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  query: { branchId?: string; expiryWarnDays?: number },
): Promise<HttpResult> {
  if (
    !isInventoryOpsEnabled(env) &&
    env?.FEATURE_OWNER_MODE !== '1' &&
    env?.FEATURE_OWNER_MODE !== 'true'
  ) {
    return featureOff();
  }
  const branchId = query.branchId?.trim() ?? '';
  if (!branchId) return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  if (!env?.DB) return dbUnavailable();
  const warnDays = query.expiryWarnDays ?? 30;
  const nowIso = new Date().toISOString();

  const policies = await env.DB.prepare(
    `SELECT product_id, min_stock, reorder_point, reorder_qty
     FROM branch_stock_policies
     WHERE tenant_id = ? AND branch_id = ? AND is_active = 1`,
  )
    .bind(tenantId, branchId)
    .all<{
      product_id: string;
      min_stock: number;
      reorder_point: number;
      reorder_qty: number;
    }>();

  const alerts: Record<string, unknown>[] = [];
  for (const pol of policies.results ?? []) {
    const stockRow = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
    )
      .bind(tenantId, branchId, pol.product_id)
      .first<{ stock: number }>();
    const batches = await env.DB.prepare(
      `SELECT id, product_id, stock, expiration_date FROM inventory_batches
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
         AND is_active = 1 AND deleted_at IS NULL AND stock > 0`,
    )
      .bind(tenantId, branchId, pol.product_id)
      .all<{
        id: string;
        product_id: string;
        stock: number;
        expiration_date: string | null;
      }>();
    const batchModels = (batches.results ?? []).map((b) => ({
      batchId: b.id,
      productId: b.product_id,
      qty: b.stock,
      expiresAtUtc: b.expiration_date
        ? `${b.expiration_date}T00:00:00.000Z`
        : '9999-12-31T00:00:00.000Z',
    }));
    const stockAlerts = evaluateStockAlerts({
      productId: pol.product_id,
      stock: stockRow?.stock ?? 0,
      minStock: pol.min_stock,
      reorderPoint: pol.reorder_point,
      earliestExpiryUtc: firstExpiringAtUtc(batchModels),
      nowIsoUtc: nowIso,
      expiryWarnDays: warnDays,
    });
    const reorderQty = suggestReorderQty({
      stock: stockRow?.stock ?? 0,
      reorderPoint: pol.reorder_point,
      reorderQty: pol.reorder_qty,
    });
    for (const a of stockAlerts) {
      alerts.push({
        ...a,
        suggestReorderQty: a.kind === 'REORDER' || a.kind === 'STOCKOUT' ? reorderQty : 0,
      });
    }
  }

  return {
    status: 200,
    body: { branchId, alertCount: alerts.length, alerts },
  };
}
/* eslint-enable complexity */
