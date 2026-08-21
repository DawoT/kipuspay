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
import {
  appendLocationStockDeltaToPlan,
  appendSerialManifestItemToPlan,
  appendSerialTransitionToPlan,
  loadSerialsForStockOperation,
  runD1AtomicPlan,
  type PreparedSerialIdentity,
} from '@kipuspay/adapters-d1';
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

// US-05 guard tipado fail-closed ante costo degenerado: la columna
// inventory_count_lines.unit_cost_cents es NULLABLE (migrations 0011) y el PMP
// autoritativo cruza el driver como number | null. Un costo ausente, no entero
// o negativo NUNCA se coalesce implícitamente a 0 — un ajuste valorizado con
// costo-0-implícito llegaría a diff_value_cents / inventory_movements.
function isValidUnitCostCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Exige costo tipado en una línea persistida del conteo; falla cerrado si es degenerado. */
function requireStoredUnitCostCents(line: { unit_cost_cents: number | null }): number {
  if (!isValidUnitCostCents(line.unit_cost_cents)) {
    throw new Error('COUNT_UNIT_COST_REQUIRED');
  }
  return line.unit_cost_cents;
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
  // S39-H1: el umbral de authz es SERVER-side (política del tenant), nunca del
  // cliente — un cashier no puede auto-definir un umbral gigante para aprobar
  // diferencias valorizadas sin autorización.
  const policy = await env.DB.prepare(
    `SELECT max_amount_without_auth_cents FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ max_amount_without_auth_cents: number }>();
  const threshold = policy?.max_amount_without_auth_cents ?? 2000;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO inventory_counts (
         id, tenant_id, branch_id, created_by_user_id, status, blind, difference_threshold_cents
       ) VALUES (?, ?, ?, ?, 'COUNTING', 1, ?)`,
  )
    .bind(id, tenantId, branchId, userId, threshold)
    .run();
  return { status: 200, body: { id, status: 'COUNTING', blind: true } };
}

// eslint-disable-next-line complexity -- count review: authz × AJUSTE multi-línea
export async function runSubmitCountReviewHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role = '',
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
      observedSerialIds?: readonly string[];
    }[];
  },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  // S39-H1: enviar a revisión un conteo con manifiestos seriales exige
  // admin/owner (nunca cashier).
  if (role !== 'admin' && role !== 'owner') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
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
    countLineId: string;
    serials: readonly PreparedSerialIdentity[];
  }[];
  try {
    lines = await Promise.all(
      clientLines.map(
        // eslint-disable-next-line complexity -- serial + aggregate authority validation
        async (line) => {
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
                COALESCE(?, d.id) AS location_id,
                p.serial_tracking_mode
         FROM branch_product_stock b
         INNER JOIN products p
           ON p.tenant_id = b.tenant_id AND p.id = b.product_id
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
              serial_tracking_mode: string;
            }>();
          if (!authority?.location_id) throw new Error('COUNT_STOCK_NOT_FOUND');
          const serials =
            authority.serial_tracking_mode === 'REQUIRED'
              ? await loadSerialsForStockOperation(
                  env.DB!,
                  tenantId,
                  count.branch_id,
                  [
                    {
                      productId,
                      quantityMicrounits: countedMicrounits,
                      serialIds: line.observedSerialIds ?? [],
                    },
                  ],
                  'AVAILABLE',
                )
              : [];
          if (serials.some((serial) => serial.locationId !== authority.location_id)) {
            throw new Error('SERIAL_IDENTITY_INVALID');
          }
          const differenceMicrounits = countedMicrounits - authority.quantity_microunits;
          if (!isValidUnitCostCents(authority.pmp_unit_cost_cents)) {
            throw new Error('COUNT_UNIT_COST_INVALID');
          }
          return {
            productId,
            batchId: line.batchId ?? null,
            locationId: authority.location_id,
            countedMicrounits,
            systemMicrounits: authority.quantity_microunits,
            differenceMicrounits,
            unitCostCents: authority.pmp_unit_cost_cents,
            countLineId: crypto.randomUUID(),
            serials,
          };
        },
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 422, body: { error: message, code: message } };
  }
  await runD1AtomicPlan(env.DB, (atomicPlan) => {
    atomicPlan.guardState(
      `SELECT 1 FROM inventory_counts
       WHERE id = ? AND tenant_id = ? AND status = 'COUNTING'`,
      [countId, tenantId],
    );
    for (const line of lines) {
      atomicPlan.add(
        env
          .DB!.prepare(
            `INSERT INTO inventory_count_lines (
             id, tenant_id, branch_id, count_id, location_id, product_id, batch_id,
             counted_qty, counted_qty_microunits,
             system_qty, system_qty_microunits, difference_qty, difference_qty_microunits,
             unit_cost_cents, diff_value_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            line.countLineId,
            tenantId,
            count.branch_id,
            countId,
            line.locationId,
            line.productId,
            line.batchId,
            line.countedMicrounits / 1_000_000,
            line.countedMicrounits,
            line.systemMicrounits / 1_000_000,
            line.systemMicrounits,
            line.differenceMicrounits / 1_000_000,
            line.differenceMicrounits,
            line.unitCostCents,
            Math.round((line.differenceMicrounits * line.unitCostCents) / 1_000_000),
          ),
      );
      for (const serial of line.serials) {
        appendSerialManifestItemToPlan(atomicPlan, env.DB!, {
          tenantId,
          serialId: serial.serialId,
          operationType: 'INVENTORY_COUNT_SUBMIT',
          operationId: countId,
          operationLineId: line.countLineId,
          idempotencyKey: `count-submit:${countId}:${line.countLineId}`,
        });
      }
    }
    atomicPlan.add(
      env
        .DB!.prepare(
          `UPDATE inventory_counts SET status = 'DIFFERENCE_REVIEW'
         WHERE id = ? AND tenant_id = ? AND status = 'COUNTING'`,
        )
        .bind(countId, tenantId),
    );
  });
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
  role = '',
  body: { countId?: string; authorizedByUserId?: string | null; adjustmentReason?: string | null },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  // S39-H1: aprobar un conteo con ajustes valorizados exige admin/owner del
  // usuario DE SESIÓN (el umbral ya es server-side; el rol no se negocia).
  if (role !== 'admin' && role !== 'owner') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  const countId = body.countId?.trim() ?? '';
  if (!countId) return { status: 400, body: { error: 'countId required', code: 'BAD_REQUEST' } };

  // S18-H3: el autorizador de un ajuste sobre umbral debe ser admin/owner
  // (nunca un string libre sin rol). El creador no puede auto-autorizarse.
  const authzUserId = body.authorizedByUserId?.trim() ?? '';
  if (authzUserId) {
    const approver = await env.DB.prepare(
      `SELECT role FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(authzUserId, tenantId)
      .first<{ role: string }>();
    const role = approver?.role ?? '';
    if (role !== 'admin' && role !== 'owner') {
      return {
        status: 403,
        body: { error: 'Forbidden: approver must be admin/owner', code: 'FORBIDDEN_ROLE' },
      };
    }
  }

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
    `SELECT l.id, l.product_id, l.batch_id, l.location_id, l.difference_qty,
            l.difference_qty_microunits, l.unit_cost_cents, p.serial_tracking_mode
     FROM inventory_count_lines l
     INNER JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
     WHERE l.count_id = ? AND l.tenant_id = ?`,
  )
    .bind(countId, tenantId)
    .all<{
      id: string;
      product_id: string;
      batch_id: string | null;
      location_id: string;
      difference_qty: number;
      difference_qty_microunits: number;
      unit_cost_cents: number | null;
      serial_tracking_mode: string;
    }>();

  const lostSerials: Array<PreparedSerialIdentity & { countLineId: string }> = [];
  const serialSetGuards: Array<{
    productId: string;
    locationId: string;
    currentIds: readonly string[];
  }> = [];
  try {
    for (const line of lines.results ?? []) {
      if (line.serial_tracking_mode !== 'REQUIRED') continue;
      const observed = await env.DB.prepare(
        `SELECT sn.id
         FROM serial_manifests sm
         INNER JOIN serial_manifest_items smi
           ON smi.tenant_id = sm.tenant_id AND smi.manifest_id = sm.id
         INNER JOIN serial_numbers sn
           ON sn.tenant_id = smi.tenant_id AND sn.id = smi.serial_id
         WHERE sm.tenant_id = ? AND sm.operation_type = 'INVENTORY_COUNT_SUBMIT'
           AND sm.operation_id = ? AND sm.operation_line_id = ?`,
      )
        .bind(tenantId, countId, line.id)
        .all<{ id: string }>();
      const current = await env.DB.prepare(
        `SELECT id, product_id, branch_id, location_id, status, version
         FROM serial_numbers
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
           AND status = 'AVAILABLE'`,
      )
        .bind(tenantId, count.branch_id, line.location_id, line.product_id)
        .all<{
          id: string;
          product_id: string;
          branch_id: string;
          location_id: string;
          status: string;
          version: number;
        }>();
      const currentById = new Map((current.results ?? []).map((serial) => [serial.id, serial]));
      const observedIds = new Set((observed.results ?? []).map((serial) => serial.id));
      if ([...observedIds].some((serialId) => !currentById.has(serialId))) {
        throw new Error('SERIAL_COUNT_UNEXPECTED_IDENTITY');
      }
      const missing = [...currentById.values()].filter((serial) => !observedIds.has(serial.id));
      if (line.difference_qty_microunits !== -missing.length * 1_000_000) {
        throw new Error('SERIAL_COUNT_DIFF_MISMATCH');
      }
      lostSerials.push(
        ...missing.map((serial) => ({
          serialId: serial.id,
          productId: serial.product_id,
          branchId: serial.branch_id,
          locationId: serial.location_id,
          status: serial.status,
          version: serial.version,
          countLineId: line.id,
        })),
      );
      serialSetGuards.push({
        productId: line.product_id,
        locationId: line.location_id,
        currentIds: [...currentById.keys()],
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 422, body: { error: message, code: message } };
  }

  try {
    assertInventoryCountTransition(count.status, 'APPROVED');
    // S18-H3: 0 ajustes sin motivo — si hay diferencia valorizada > umbral,
    // el motivo es obligatorio.
    const hasDiff = (lines.results ?? []).some((l) => l.difference_qty !== 0);
    if (hasDiff && !(body.adjustmentReason ?? '').trim()) {
      return { status: 422, body: { error: 'Ajuste requiere motivo', code: 'REASON_REQUIRED' } };
    }
    assertCountDiffAuthorized({
      lines: (lines.results ?? []).map((l) => ({
        productId: l.product_id,
        differenceQty: l.difference_qty,
        unitCostCents: requireStoredUnitCostCents(l),
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
       SET status = 'APPROVED', approved_by_user_id = ?, approved_at = CURRENT_TIMESTAMP,
           adjustment_reason = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(userId, (body.adjustmentReason ?? '').trim() || null, countId, tenantId),
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
            requireStoredUnitCostCents(l),
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
  await runD1AtomicPlan(env.DB, async (atomicPlan) => {
    atomicPlan.guardState(
      `SELECT 1 FROM inventory_counts
       WHERE id = ? AND tenant_id = ? AND status = 'DIFFERENCE_REVIEW'`,
      [countId, tenantId],
    );
    const serialGuardIds: string[] = [];
    for (const guard of serialSetGuards) {
      const guardId = crypto.randomUUID();
      serialGuardIds.push(guardId);
      const inClause =
        guard.currentIds.length > 0
          ? ` AND (
              SELECT COUNT(*) FROM serial_numbers
              WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
                AND status = 'AVAILABLE'
                AND id IN (${guard.currentIds.map(() => '?').join(',')})
            ) = ?`
          : '';
      const params: unknown[] = [
        guardId,
        tenantId,
        count.branch_id,
        guard.locationId,
        guard.productId,
        guard.currentIds.length,
      ];
      if (guard.currentIds.length > 0) {
        params.push(
          tenantId,
          count.branch_id,
          guard.locationId,
          guard.productId,
          ...guard.currentIds,
          guard.currentIds.length,
        );
      }
      atomicPlan.add(
        env
          .DB!.prepare(
            `INSERT INTO atomic_guards (id, ok)
           SELECT ?, CASE WHEN (
             SELECT COUNT(*) FROM serial_numbers
             WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
               AND status = 'AVAILABLE'
           ) = ?${inClause} THEN 1 ELSE 0 END`,
          )
          .bind(...params),
      );
    }
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
    for (const serial of lostSerials) {
      await appendSerialTransitionToPlan(atomicPlan, env.DB!, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'AVAILABLE',
        nextStatus: 'LOST',
        expectedVersion: serial.version,
        eventType: 'COUNT_LOSS',
        operationType: 'INVENTORY_COUNT',
        operationId: countId,
        operationLineId: serial.countLineId,
        idempotencyKey: `count-approve:${countId}:${serial.serialId}`,
        actorUserId: userId,
      });
    }
    for (const guardId of serialGuardIds) {
      atomicPlan.add(env.DB!.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId));
    }
  });
  return { status: 200, body: { id: countId, status: 'APPROVED' } };
}
/* eslint-enable complexity */

/* eslint-disable complexity -- serial manifest plus location/aggregate authority branches */
export async function runCreateStockLossHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    productId?: string;
    locationId?: string | null;
    batchId?: string | null;
    quantity?: number;
    category?: StockLossCategory;
    evidenceR2Key?: string | null;
    reason?: string;
    serialIds?: readonly string[];
  },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  const id = crypto.randomUUID();
  const branchId = body.branchId?.trim() ?? '';
  const productId = body.productId?.trim() ?? '';
  const quantityMicrounits = Math.round((body.quantity ?? 0) * 1_000_000);
  let locationId = body.locationId?.trim() || null;
  let serials: readonly PreparedSerialIdentity[] = [];
  try {
    // Validate shape via approve planner preconditions loosely
    if (!(body.quantity && body.quantity > 0)) throw new Error('INVALID_LOSS_QTY');
    if (!(body.reason && body.reason.trim())) throw new Error('LOSS_REASON_REQUIRED');
    if (!branchId || !productId) throw new Error('LOSS_CONTEXT_REQUIRED');
    const product = await env.DB.prepare(
      `SELECT serial_tracking_mode FROM products
       WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(tenantId, productId)
      .first<{ serial_tracking_mode: string }>();
    serials =
      product?.serial_tracking_mode === 'REQUIRED'
        ? await loadSerialsForStockOperation(
            env.DB,
            tenantId,
            branchId,
            [{ productId, quantityMicrounits, serialIds: body.serialIds ?? [] }],
            'AVAILABLE',
          )
        : [];
    if (serials.length > 0) {
      const serialLocations = new Set(serials.map((serial) => serial.locationId));
      if (serialLocations.size !== 1) throw new Error('SERIAL_IDENTITY_INVALID');
      const actualLocationId = serials[0]!.locationId;
      if (locationId && locationId !== actualLocationId) throw new Error('SERIAL_IDENTITY_INVALID');
      locationId = actualLocationId;
    }
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e);
    return {
      status: 422,
      body: {
        error: message,
        code: message.startsWith('SERIAL_') ? message : 'LOSS_REJECTED',
      },
    };
  }
  await runD1AtomicPlan(env.DB, (atomicPlan) => {
    atomicPlan.add(
      env
        .DB!.prepare(
          `INSERT INTO stock_losses (
           id, tenant_id, branch_id, location_id, product_id, batch_id,
           quantity, quantity_microunits, category, evidence_r2_key, reason,
           status, created_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        )
        .bind(
          id,
          tenantId,
          branchId,
          locationId,
          productId,
          body.batchId ?? null,
          body.quantity,
          quantityMicrounits,
          body.category ?? 'OTHER',
          body.evidenceR2Key ?? null,
          body.reason,
          userId,
        ),
    );
    for (const serial of serials) {
      appendSerialManifestItemToPlan(atomicPlan, env.DB!, {
        tenantId,
        serialId: serial.serialId,
        operationType: 'STOCK_LOSS',
        operationId: id,
        idempotencyKey: `stock-loss:${id}`,
      });
    }
  });
  return { status: 200, body: { id, status: 'PENDING' } };
}

export async function runApproveStockLossHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role = '',
  body: { lossId?: string },
): Promise<HttpResult> {
  if (!isInventoryOpsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  // S39-H1: aprobar una merma valorizada exige admin/owner (nunca cashier).
  if (role !== 'admin' && role !== 'owner') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  const lossId = body.lossId?.trim() ?? '';
  if (!lossId) return { status: 400, body: { error: 'lossId required', code: 'BAD_REQUEST' } };

  const row = await env.DB.prepare(
    `SELECT status, quantity, quantity_microunits, category, evidence_r2_key, reason,
            branch_id, location_id, product_id, batch_id
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
      location_id: string | null;
      product_id: string;
      batch_id: string | null;
    }>();
  if (!row) return { status: 404, body: { error: 'Loss not found', code: 'NOT_FOUND' } };

  let plan;
  let serials: readonly PreparedSerialIdentity[] = [];
  try {
    plan = planApproveStockLoss({
      status: row.status,
      quantity: row.quantity,
      category: row.category,
      evidenceR2Key: row.evidence_r2_key,
      reason: row.reason,
      approvedByUserId: userId,
    });
    const product = await env.DB.prepare(
      `SELECT serial_tracking_mode FROM products
       WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(tenantId, row.product_id)
      .first<{ serial_tracking_mode: string }>();
    if (product?.serial_tracking_mode === 'REQUIRED') {
      const manifest = await env.DB.prepare(
        `SELECT sn.id
         FROM serial_manifests sm
         INNER JOIN serial_manifest_items smi
           ON smi.tenant_id = sm.tenant_id AND smi.manifest_id = sm.id
         INNER JOIN serial_numbers sn
           ON sn.tenant_id = smi.tenant_id AND sn.id = smi.serial_id
         WHERE sm.tenant_id = ? AND sm.operation_type = 'STOCK_LOSS'
           AND sm.operation_id = ?`,
      )
        .bind(tenantId, lossId)
        .all<{ id: string }>();
      serials = await loadSerialsForStockOperation(
        env.DB,
        tenantId,
        row.branch_id,
        [
          {
            productId: row.product_id,
            quantityMicrounits: row.quantity_microunits,
            serialIds: (manifest.results ?? []).map((serial) => serial.id),
          },
        ],
        'AVAILABLE',
      );
    }
    if (row.location_id && serials.some((serial) => serial.locationId !== row.location_id)) {
      throw new Error('SERIAL_IDENTITY_INVALID');
    }
  } catch (e) {
    const message = String(e instanceof Error ? e.message : e);
    return {
      status: 422,
      body: {
        error: message,
        code: message.startsWith('SERIAL_') ? message : 'LOSS_REJECTED',
      },
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
  await runD1AtomicPlan(env.DB, async (atomicPlan) => {
    if (serials.length > 0) {
      atomicPlan.guardState(
        `SELECT 1 FROM stock_losses sl
         WHERE sl.id = ? AND sl.tenant_id = ? AND sl.status = 'PENDING'
           AND EXISTS (
             SELECT 1 FROM branch_product_stock b
             WHERE b.tenant_id = sl.tenant_id AND b.branch_id = sl.branch_id
               AND b.product_id = sl.product_id AND b.stock_microunits >= ?
           )
           AND EXISTS (
             SELECT 1 FROM inventory_location_stock l
             WHERE l.tenant_id = sl.tenant_id AND l.branch_id = sl.branch_id
               AND l.location_id = ? AND l.product_id = sl.product_id
               AND l.quantity_microunits >= ?
           )`,
        [lossId, tenantId, -deltaMicrounits, row.location_id, -deltaMicrounits],
      );
    }
    for (const statement of stockLossStatements) atomicPlan.add(statement);
    appendLocationStockDeltaToPlan(atomicPlan, env.DB!, {
      tenantId,
      branchId: row.branch_id,
      productId: row.product_id,
      deltaMicrounits,
      locationId: row.location_id,
      batchId: row.batch_id,
    });
    const nextSerialStatus =
      row.category === 'DAMAGED' || row.category === 'EXPIRED' ? 'DAMAGED' : 'LOST';
    for (const serial of serials) {
      await appendSerialTransitionToPlan(atomicPlan, env.DB!, {
        tenantId,
        serialId: serial.serialId,
        branchId: serial.branchId,
        locationId: serial.locationId,
        productId: serial.productId,
        expectedStatus: 'AVAILABLE',
        nextStatus: nextSerialStatus,
        expectedVersion: serial.version,
        eventType: 'STOCK_LOSS',
        operationType: 'STOCK_LOSS',
        operationId: lossId,
        idempotencyKey: `stock-loss-approve:${lossId}:${serial.serialId}`,
        actorUserId: userId,
      });
    }
  });
  return {
    status: 200,
    body: { id: lossId, status: plan.nextStatus, adjustmentQty: plan.adjustmentQty },
  };
}
/* eslint-enable complexity */

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
