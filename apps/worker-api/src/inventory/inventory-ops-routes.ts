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
import { appendLocationStockDeltaToPlan, runD1AtomicPlan } from '@kipuspay/adapters-d1';
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
      countedQtyMicrounits?: number;
      locationId?: string;
      /** @deprecated ignorado: autoridad server-side */
      systemQty?: number;
      /** @deprecated ignorado: autoridad server-side */
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
    `SELECT status, branch_id FROM inventory_counts WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(countId, tenantId)
    .first<{ status: InventoryCountStatus; branch_id: string }>();
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

  const clientLines = body.lines ?? [];
  let lines: {
    productId: string;
    batchId: string | null;
    locationId: string;
    countedMicrounits: number;
    systemMicrounits: number;
    differenceMicrounits: number;
    unitCostCents: number;
  }[];
  try {
    lines = await Promise.all(
      clientLines.map(async (line) => {
        const productId = line.productId?.trim() ?? '';
        if (!productId) throw new Error('COUNT_PRODUCT_REQUIRED');
        const countedMicrounits =
          line.countedQtyMicrounits ?? Math.round((line.countedQty ?? 0) * 1_000_000);
        if (!Number.isSafeInteger(countedMicrounits) || countedMicrounits < 0) {
          throw new Error('COUNT_INVALID_QUANTITY');
        }
        const requestedLocationId = line.locationId?.trim() || null;
        const authority = await env
          .DB!.prepare(
            `SELECT COALESCE(s.quantity_microunits, 0) AS quantity_microunits,
                b.pmp_unit_cost_cents,
                COALESCE(?, d.id) AS location_id
         FROM branch_product_stock b
         LEFT JOIN inventory_locations d
           ON d.tenant_id = b.tenant_id AND d.branch_id = b.branch_id
          AND d.code = 'DEFAULT' AND d.is_active = 1
         LEFT JOIN inventory_location_stock s
           ON s.tenant_id = b.tenant_id AND s.branch_id = b.branch_id
          AND s.product_id = b.product_id AND s.location_id = COALESCE(?, d.id)
         WHERE b.tenant_id = ? AND b.branch_id = ? AND b.product_id = ?
         LIMIT 1`,
          )
          .bind(requestedLocationId, requestedLocationId, tenantId, count.branch_id, productId)
          .first<{
            quantity_microunits: number;
            pmp_unit_cost_cents: number;
            location_id: string | null;
          }>();
        if (!authority?.location_id) throw new Error('COUNT_STOCK_NOT_FOUND');
        const differenceMicrounits = countedMicrounits - authority.quantity_microunits;
        return {
          productId,
          batchId: line.batchId ?? null,
          locationId: authority.location_id,
          countedMicrounits,
          systemMicrounits: authority.quantity_microunits,
          differenceMicrounits,
          unitCostCents: authority.pmp_unit_cost_cents ?? 0,
        };
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 422, body: { error: message, code: message } };
  }
  const stmts = [
    ...lines.map((l) => {
      return env
        .DB!.prepare(
          `INSERT INTO inventory_count_lines (
             id, tenant_id, branch_id, count_id, location_id, product_id, batch_id,
             counted_qty, counted_qty_microunits,
             system_qty, system_qty_microunits, difference_qty, difference_qty_microunits,
             unit_cost_cents, diff_value_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          count.branch_id,
          countId,
          l.locationId,
          l.productId,
          l.batchId,
          l.countedMicrounits / 1_000_000,
          l.countedMicrounits,
          l.systemMicrounits / 1_000_000,
          l.systemMicrounits,
          l.differenceMicrounits / 1_000_000,
          l.differenceMicrounits,
          l.unitCostCents,
          Math.round((l.differenceMicrounits * l.unitCostCents) / 1_000_000),
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
    `SELECT product_id, batch_id, location_id, difference_qty,
            difference_qty_microunits, unit_cost_cents
     FROM inventory_count_lines WHERE count_id = ? AND tenant_id = ?`,
  )
    .bind(countId, tenantId)
    .all<{
      product_id: string;
      batch_id: string | null;
      location_id: string;
      difference_qty: number;
      difference_qty_microunits: number;
      unit_cost_cents: number;
    }>();

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
           SET stock = stock + ?,
               stock_microunits = stock_microunits + ?,
               updated_at = CURRENT_TIMESTAMP, version = version + 1
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(
            l.difference_qty,
            l.difference_qty_microunits,
            tenantId,
            count.branch_id,
            l.product_id,
          ),
      ),
    ...(lines.results ?? [])
      .filter((l) => l.difference_qty !== 0)
      .map((l) =>
        env
          .DB!.prepare(
            `INSERT INTO inventory_movements (
               id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
               quantity_delta_microunits, unit_cost_cents, stock_after,
               stock_after_microunits, user_id, reference_id
             ) VALUES (?, ?, ?, ?, 'AJUSTE', ?, ?, ?,
               (SELECT stock FROM branch_product_stock
                WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
               (SELECT stock_microunits FROM branch_product_stock
                WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
               ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            count.branch_id,
            l.product_id,
            l.difference_qty,
            l.difference_qty_microunits,
            l.unit_cost_cents ?? 0,
            tenantId,
            count.branch_id,
            l.product_id,
            tenantId,
            count.branch_id,
            l.product_id,
            userId,
            countId,
          ),
      ),
  ];
  await runD1AtomicPlan(env.DB, (atomicPlan) => {
    for (const statement of stmts) atomicPlan.add(statement);
    for (const line of lines.results ?? []) {
      const deltaMicrounits =
        line.difference_qty_microunits ?? Math.round(line.difference_qty * 1_000_000);
      if (deltaMicrounits === 0) continue;
      appendLocationStockDeltaToPlan(atomicPlan, env.DB!, {
        tenantId,
        branchId: count.branch_id,
        productId: line.product_id,
        deltaMicrounits,
        locationId: line.location_id,
        batchId: line.batch_id,
      });
    }
  });
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
         id, tenant_id, branch_id, product_id, batch_id, quantity, quantity_microunits, category,
         evidence_r2_key, reason, status, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
  )
    .bind(
      id,
      tenantId,
      body.branchId ?? '',
      body.productId ?? '',
      body.batchId ?? null,
      body.quantity,
      Math.round(body.quantity * 1000000),
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
    `SELECT status, quantity, quantity_microunits, category, evidence_r2_key, reason, branch_id, product_id, batch_id
     FROM stock_losses WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(lossId, tenantId)
    .first<{
      status: StockLossStatus;
      quantity: number;
      quantity_microunits: number;
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

  const stockLossStatements = [
    env.DB.prepare(
      `UPDATE stock_losses
       SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
    ).bind(userId, lossId, tenantId),
    env.DB.prepare(
      `UPDATE branch_product_stock
       SET stock = stock + ?,
           stock_microunits = stock_microunits + ?,
           updated_at = CURRENT_TIMESTAMP, version = version + 1
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
    ).bind(
      plan.adjustmentQty,
      Math.round(plan.adjustmentQty * 1000000),
      tenantId,
      row.branch_id,
      row.product_id,
    ),
    env.DB.prepare(
      `INSERT INTO inventory_movements (
           id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
           quantity_delta_microunits, unit_cost_cents, stock_after,
           stock_after_microunits, user_id, reference_id
         ) VALUES (?, ?, ?, ?, ?, 'AJUSTE', ?, ?, 0,
           (SELECT stock FROM branch_product_stock
            WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
           (SELECT stock_microunits FROM branch_product_stock
            WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
           ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      tenantId,
      row.branch_id,
      row.product_id,
      row.batch_id,
      plan.adjustmentQty,
      Math.round(plan.adjustmentQty * 1000000),
      tenantId,
      row.branch_id,
      row.product_id,
      tenantId,
      row.branch_id,
      row.product_id,
      userId,
      lossId,
    ),
  ];
  const deltaMicrounits = Math.round(plan.adjustmentQty * 1_000_000);
  await runD1AtomicPlan(env.DB, (atomicPlan) => {
    for (const statement of stockLossStatements) atomicPlan.add(statement);
    appendLocationStockDeltaToPlan(atomicPlan, env.DB!, {
      tenantId,
      branchId: row.branch_id,
      productId: row.product_id,
      deltaMicrounits,
      batchId: row.batch_id,
    });
  });
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
