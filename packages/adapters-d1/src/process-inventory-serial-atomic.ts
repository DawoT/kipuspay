/**
 * Sprint 39 — serial identity engine. Every command emits one guarded D1 batch;
 * the projection, immutable event and operation manifest never commit separately.
 */
import { canTransitionSerial, type SerialState } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';

const SERIAL_STATUSES = new Set([
  'AVAILABLE',
  'RESERVED',
  'SOLD',
  'IN_TRANSIT',
  'RETURNED_INSPECTION',
  'LOST',
  'DAMAGED',
  'RETURNED_SUPPLIER',
]);

const serialAuditTails = new WeakMap<AtomicPlanBuilder, Map<string, Promise<string | null>>>();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function appendSerialAuditToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly actorUserId?: string | null;
    readonly action: 'SERIAL_ASSIGN' | 'SERIAL_TRANSITION';
    readonly serialId: string;
    readonly branchId: string;
    readonly payload: Record<string, unknown>;
  },
): Promise<void> {
  let serialTails = serialAuditTails.get(plan);
  if (!serialTails) {
    serialTails = new Map();
    serialAuditTails.set(plan, serialTails);
  }
  let previousPromise = serialTails.get(input.serialId);
  if (!previousPromise) {
    previousPromise = db
      .prepare(
        `SELECT row_hash FROM audit_events
         WHERE tenant_id = ? AND entity_type = 'serial_number' AND entity_id = ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(input.tenantId, input.serialId)
      .first<{ row_hash: string }>()
      .then((row) => row?.row_hash ?? null);
  }
  const previousHash = await previousPromise;
  const payloadJson = JSON.stringify(input.payload);
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: input.action,
      entityType: 'serial_number',
      entityId: input.serialId,
      payload: input.payload,
      previousHash,
    }),
  );
  serialTails.set(input.serialId, Promise.resolve(rowHash));
  const auditGuardId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN COALESCE((
           SELECT row_hash FROM audit_events
           WHERE tenant_id = ? AND entity_type = 'serial_number' AND entity_id = ?
           ORDER BY rowid DESC LIMIT 1
         ), '') = COALESCE(?, '') THEN 1 ELSE 0 END`,
      )
      .bind(auditGuardId, input.tenantId, input.serialId, previousHash),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, ?, ?, 'serial_number', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.branchId,
        input.actorUserId ?? null,
        input.action,
        input.serialId,
        payloadJson,
        previousHash,
        rowHash,
      ),
  );
  plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(auditGuardId));
}

export interface SerialSelection {
  readonly productId: string;
  readonly quantityMicrounits: number;
  readonly serialIds?: readonly string[];
}

export function assertSerialSelectionCoverage(
  trackingModeByProduct: ReadonlyMap<string, string>,
  selections: readonly SerialSelection[],
): void {
  const allIds = new Set<string>();
  for (const selection of selections) {
    if (trackingModeByProduct.get(selection.productId) !== 'REQUIRED') continue;
    if (
      !Number.isSafeInteger(selection.quantityMicrounits) ||
      selection.quantityMicrounits <= 0 ||
      selection.quantityMicrounits % 1_000_000 !== 0
    ) {
      throw new Error('SERIAL_QUANTITY_INVALID');
    }
    const ids = selection.serialIds ?? [];
    if (ids.length === 0) throw new Error('SERIAL_MANIFEST_REQUIRED');
    if (ids.length !== selection.quantityMicrounits / 1_000_000) {
      throw new Error('SERIAL_MANIFEST_COUNT_MISMATCH');
    }
    for (const id of ids) {
      if (!required(id)) throw new Error('SERIAL_CONTEXT_REQUIRED');
      if (allIds.has(id)) throw new Error('SERIAL_DUPLICATE');
      allIds.add(id);
    }
  }
}

export interface PreparedSerialIdentity {
  readonly serialId: string;
  readonly productId: string;
  readonly branchId: string;
  readonly locationId: string;
  readonly status: string;
  readonly version: number;
}

export async function loadSerialsForStockOperation(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  selections: readonly SerialSelection[],
  expectedStatus: string,
): Promise<readonly PreparedSerialIdentity[]> {
  if (selections.length === 0) return [];
  const productIds = [...new Set(selections.map((selection) => selection.productId))];
  const productPlaceholders = productIds.map(() => '?').join(',');
  const productRows = await db
    .prepare(
      `SELECT id, serial_tracking_mode FROM products
       WHERE tenant_id = ? AND id IN (${productPlaceholders}) AND deleted_at IS NULL`,
    )
    .bind(tenantId, ...productIds)
    .all<{ id: string; serial_tracking_mode: string }>();
  const modes = new Map<string, string>();
  for (const row of productRows.results ?? []) {
    modes.set(row.id, row.serial_tracking_mode);
  }
  if (modes.size !== productIds.length) throw new Error('SERIAL_PRODUCT_NOT_FOUND');
  assertSerialSelectionCoverage(modes, selections);
  const requested = selections.flatMap((selection) =>
    modes.get(selection.productId) === 'REQUIRED'
      ? (selection.serialIds ?? []).map((serialId) => ({
          serialId,
          productId: selection.productId,
        }))
      : [],
  );
  if (requested.length === 0) return [];
  const serialPlaceholders = requested.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT id, product_id, branch_id, location_id, status, version
       FROM serial_numbers
       WHERE tenant_id = ? AND branch_id = ? AND status = ?
         AND id IN (${serialPlaceholders})`,
    )
    .bind(tenantId, branchId, expectedStatus, ...requested.map((item) => item.serialId))
    .all<{
      id: string;
      product_id: string;
      branch_id: string;
      location_id: string;
      status: string;
      version: number;
    }>();
  const byId = new Map((rows.results ?? []).map((row) => [row.id, row]));
  const identities: PreparedSerialIdentity[] = [];
  const returnedIds = new Set<string>();
  for (const item of requested) {
    const row = byId.get(item.serialId);
    if (!row || row.product_id !== item.productId || returnedIds.has(row.id)) {
      throw new Error('SERIAL_IDENTITY_INVALID');
    }
    returnedIds.add(row.id);
    identities.push({
      serialId: row.id,
      productId: row.product_id,
      branchId: row.branch_id,
      locationId: row.location_id,
      status: row.status,
      version: row.version,
    });
  }
  return identities;
}

function required(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSerial(value: string): string {
  const normalized = value.trim().normalize('NFKC').toUpperCase();
  if (!normalized) throw new Error('SERIAL_NUMBER_REQUIRED');
  return normalized;
}

function serialDefaultLocationId(tenantId: string, branchId: string): string {
  return `loc-default:${tenantId}:${branchId}`;
}

function opaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `opaque_kp_${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}

export async function hashSerialLeaseToken(token: string): Promise<string> {
  if (!required(token)) throw new Error('SERIAL_LEASE_TOKEN_REQUIRED');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface SerialTransitionInput {
  readonly tenantId: string;
  readonly serialId: string;
  readonly branchId: string;
  readonly locationId: string;
  readonly productId: string;
  readonly expectedStatus: string;
  readonly nextStatus: string;
  readonly expectedVersion: number;
  readonly eventType: string;
  readonly operationType: string;
  readonly operationId: string;
  readonly operationLineId?: string | null;
  readonly idempotencyKey: string;
  readonly actorUserId?: string | null;
  readonly nextBranchId?: string;
  readonly nextLocationId?: string;
  readonly currentSaleItemId?: string | null;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export function appendSerialManifestItemToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly serialId: string;
    readonly operationType: string;
    readonly operationId: string;
    readonly operationLineId?: string | null;
    readonly idempotencyKey: string;
  },
): string {
  const manifestId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO serial_manifests (
           id, tenant_id, operation_type, operation_id, operation_line_id, idempotency_key
         )
         SELECT ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM serial_manifests WHERE tenant_id = ? AND idempotency_key = ?
         )`,
      )
      .bind(
        manifestId,
        input.tenantId,
        input.operationType,
        input.operationId,
        input.operationLineId ?? null,
        input.idempotencyKey,
        input.tenantId,
        input.idempotencyKey,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO serial_manifest_items (
           id, tenant_id, manifest_id, serial_id, quantity_microunits
         )
         SELECT ?, ?, m.id, ?, 1000000 FROM serial_manifests m
         WHERE m.tenant_id = ? AND m.idempotency_key = ?
           AND NOT EXISTS (
             SELECT 1 FROM serial_manifest_items i
             WHERE i.tenant_id = m.tenant_id AND i.manifest_id = m.id AND i.serial_id = ?
           )`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.serialId,
        input.tenantId,
        input.idempotencyKey,
        input.serialId,
      ),
  );
  return manifestId;
}

function assertTransitionInput(input: SerialTransitionInput): void {
  const context = [
    input.tenantId,
    input.serialId,
    input.branchId,
    input.locationId,
    input.productId,
  ];
  if (!context.every(required)) throw new Error('SERIAL_CONTEXT_REQUIRED');
  const knownStates =
    SERIAL_STATUSES.has(input.expectedStatus) && SERIAL_STATUSES.has(input.nextStatus);
  const coordinatesChange =
    (input.nextBranchId ?? input.branchId) !== input.branchId ||
    (input.nextLocationId ?? input.locationId) !== input.locationId;
  const lifecycleValid =
    knownStates &&
    (input.expectedStatus === input.nextStatus
      ? coordinatesChange
      : canTransitionSerial(input.expectedStatus as SerialState, input.nextStatus as SerialState));
  const transitionValid =
    lifecycleValid && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 1;
  if (!transitionValid) throw new Error('SERIAL_TRANSITION_INVALID');
  const operation = [input.eventType, input.operationType, input.operationId, input.idempotencyKey];
  if (!operation.every(required)) throw new Error('SERIAL_OPERATION_REQUIRED');
  if (
    !required(input.nextBranchId ?? input.branchId) ||
    !required(input.nextLocationId ?? input.locationId)
  ) {
    throw new Error('SERIAL_CONTEXT_REQUIRED');
  }
}

function appendOneUnitStockDebit(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly locationId: string;
    readonly productId: string;
    readonly referenceId: string;
    readonly movementType: string;
  },
): void {
  const stockGuardId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN EXISTS (
           SELECT 1 FROM branch_product_stock b
           INNER JOIN inventory_location_stock l
             ON l.tenant_id = b.tenant_id AND l.branch_id = b.branch_id
            AND l.product_id = b.product_id
           WHERE b.tenant_id = ? AND b.branch_id = ? AND b.product_id = ?
             AND l.location_id = ? AND b.stock_microunits >= 1000000
             AND l.quantity_microunits >= 1000000
         ) THEN 1 ELSE 0 END`,
      )
      .bind(stockGuardId, input.tenantId, input.branchId, input.productId, input.locationId),
  );
  plan.add(
    db
      .prepare(
        `UPDATE branch_product_stock
         SET stock_microunits = stock_microunits - 1000000,
             stock = (stock_microunits - 1000000) * 0.000001,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
           AND stock_microunits >= 1000000`,
      )
      .bind(input.tenantId, input.branchId, input.productId),
  );
  plan.add(
    db
      .prepare(
        `UPDATE inventory_location_stock
         SET quantity_microunits = quantity_microunits - 1000000,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
           AND quantity_microunits >= 1000000`,
      )
      .bind(input.tenantId, input.branchId, input.locationId, input.productId),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
           id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
           quantity_delta_microunits, unit_cost_cents, stock_after,
           stock_after_microunits, user_id, reference_id, location_id
         )
         SELECT ?, ?, ?, ?, ?, -1, -1000000, b.pmp_unit_cost_cents,
                b.stock, b.stock_microunits, ?, ?, ?
         FROM branch_product_stock b
         WHERE b.tenant_id = ? AND b.branch_id = ? AND b.product_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.branchId,
        input.productId,
        input.movementType,
        input.userId,
        input.referenceId,
        input.locationId,
        input.tenantId,
        input.branchId,
        input.productId,
      ),
  );
  plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(stockGuardId));
}

/**
 * Shared stock-writer cutover primitive. It intentionally uses its own temporary
 * CHECK guard so it composes with a writer that already owns plan.guardState().
 */
export async function appendSerialTransitionToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: SerialTransitionInput,
): Promise<void> {
  assertTransitionInput(input);
  const nextBranchId = input.nextBranchId ?? input.branchId;
  const nextLocationId = input.nextLocationId ?? input.locationId;
  const guardId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN EXISTS (
           SELECT 1 FROM serial_numbers
           WHERE tenant_id = ? AND id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND status = ? AND version = ?
         ) THEN 1 ELSE 0 END`,
      )
      .bind(
        guardId,
        input.tenantId,
        input.serialId,
        input.branchId,
        input.locationId,
        input.productId,
        input.expectedStatus,
        input.expectedVersion,
      ),
  );
  plan.add(
    db
      .prepare(
        `UPDATE serial_numbers
         SET status = ?, branch_id = ?, location_id = ?, current_sale_item_id = ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND id = ? AND branch_id = ? AND location_id = ?
           AND product_id = ? AND status = ? AND version = ?`,
      )
      .bind(
        input.nextStatus,
        nextBranchId,
        nextLocationId,
        input.currentSaleItemId ?? null,
        input.tenantId,
        input.serialId,
        input.branchId,
        input.locationId,
        input.productId,
        input.expectedStatus,
        input.expectedVersion,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO serial_number_events (
           id, tenant_id, serial_id, event_type, from_status, to_status,
           reference_type, reference_id, branch_id, location_id, actor_user_id,
           idempotency_key, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        input.tenantId,
        input.serialId,
        input.eventType,
        input.expectedStatus,
        input.nextStatus,
        input.operationType,
        input.operationId,
        nextBranchId,
        nextLocationId,
        input.actorUserId ?? null,
        input.idempotencyKey,
        JSON.stringify(input.payload ?? {}),
      ),
  );
  appendSerialManifestItemToPlan(plan, db, {
    tenantId: input.tenantId,
    serialId: input.serialId,
    operationType: input.operationType,
    operationId: input.operationId,
    operationLineId: input.operationLineId ?? null,
    idempotencyKey: `manifest:${input.operationType}:${input.operationId}:${input.operationLineId ?? '-'}`,
  });
  await appendSerialAuditToPlan(plan, db, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: 'SERIAL_TRANSITION',
    serialId: input.serialId,
    branchId: nextBranchId,
    payload: {
      eventType: input.eventType,
      fromStatus: input.expectedStatus,
      toStatus: input.nextStatus,
      operationType: input.operationType,
      operationId: input.operationId,
      operationLineId: input.operationLineId ?? null,
      locationId: nextLocationId,
    },
  });
  plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId));
}

export async function configureSerialTrackingAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly productId: string;
    readonly serialTrackingMode: 'NONE' | 'REQUIRED';
  },
): Promise<{ readonly productId: string; readonly serialTrackingMode: 'NONE' | 'REQUIRED' }> {
  if (!required(tenantId) || !required(userId) || !required(input.productId)) {
    throw new Error('SERIAL_CONTEXT_REQUIRED');
  }
  if (input.serialTrackingMode !== 'NONE' && input.serialTrackingMode !== 'REQUIRED') {
    throw new Error('SERIAL_TRACKING_MODE_INVALID');
  }
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 FROM products p
       WHERE p.tenant_id = ? AND p.id = ? AND p.deleted_at IS NULL
         AND (? = 'NONE' OR p.product_type NOT IN ('WEIGH','service'))
         AND (
           p.serial_tracking_mode = ?
           OR (? = 'REQUIRED' AND NOT EXISTS (
             SELECT 1 FROM inventory_location_stock s
             WHERE s.tenant_id = p.tenant_id AND s.product_id = p.id
               AND s.quantity_microunits <> 0
           ))
           OR (? = 'NONE' AND NOT EXISTS (
             SELECT 1 FROM serial_numbers n
             WHERE n.tenant_id = p.tenant_id AND n.product_id = p.id
           ))
         )`,
      [
        tenantId,
        input.productId,
        input.serialTrackingMode,
        input.serialTrackingMode,
        input.serialTrackingMode,
        input.serialTrackingMode,
      ],
    );
    plan.add(
      db
        .prepare(
          `UPDATE products SET serial_tracking_mode = ?
           WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
        )
        .bind(input.serialTrackingMode, tenantId, input.productId),
    );
  });
  return { productId: input.productId, serialTrackingMode: input.serialTrackingMode };
}

export async function appendReceiptSerialIdentityToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly locationId: string;
    readonly productId: string;
    readonly purchaseReceiptLineId: string;
    readonly serialNumber: string;
    readonly operationId: string;
  },
): Promise<{ readonly serialId: string; readonly manifestId: string }> {
  const normalized = normalizeSerial(input.serialNumber);
  const context = [
    input.tenantId,
    input.userId,
    input.branchId,
    input.locationId,
    input.productId,
    input.purchaseReceiptLineId,
    input.operationId,
  ];
  if (!context.every(required)) throw new Error('SERIAL_CONTEXT_REQUIRED');
  const serialId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO serial_numbers (
           id, tenant_id, branch_id, location_id, product_id, serial_number,
           serial_number_normalized, status, purchase_receipt_line_id, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, 1)`,
      )
      .bind(
        serialId,
        input.tenantId,
        input.branchId,
        input.locationId,
        input.productId,
        input.serialNumber.trim(),
        normalized,
        input.purchaseReceiptLineId,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO serial_number_events (
           id, tenant_id, serial_id, event_type, from_status, to_status,
           reference_type, reference_id, branch_id, location_id, actor_user_id,
           idempotency_key, payload_json
         ) VALUES (?, ?, ?, 'SERIAL_ASSIGN', NULL, 'AVAILABLE',
                   'PURCHASE_RECEIPT_LINE', ?, ?, ?, ?, ?, '{}')`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        serialId,
        input.purchaseReceiptLineId,
        input.branchId,
        input.locationId,
        input.userId,
        `${input.operationId}:${normalized}`,
      ),
  );
  const manifestId = appendSerialManifestItemToPlan(plan, db, {
    tenantId: input.tenantId,
    serialId,
    operationType: 'PURCHASE_RECEIPT',
    operationId: input.operationId,
    operationLineId: input.purchaseReceiptLineId,
    idempotencyKey: `receipt-manifest:${input.operationId}:${input.purchaseReceiptLineId}`,
  });
  await appendSerialAuditToPlan(plan, db, {
    tenantId: input.tenantId,
    actorUserId: input.userId,
    action: 'SERIAL_ASSIGN',
    serialId,
    branchId: input.branchId,
    payload: {
      productId: input.productId,
      purchaseReceiptLineId: input.purchaseReceiptLineId,
      locationId: input.locationId,
      operationId: input.operationId,
    },
  });
  return { serialId, manifestId };
}

export async function createSerialManifestAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly branchId: string;
    readonly purchaseReceiptLineId: string;
    readonly locationId?: string | null;
    readonly serialNumbers: readonly string[];
  },
): Promise<{ readonly manifestId: string; readonly serialCount: number }> {
  if (
    !required(tenantId) ||
    !required(userId) ||
    !required(input.branchId) ||
    !required(input.purchaseReceiptLineId)
  ) {
    throw new Error('SERIAL_CONTEXT_REQUIRED');
  }
  if (input.serialNumbers.length === 0) throw new Error('SERIAL_MANIFEST_REQUIRED');
  const normalized = input.serialNumbers.map(normalizeSerial);
  if (new Set(normalized).size !== normalized.length) throw new Error('SERIAL_DUPLICATE');
  const receiptLine = await db
    .prepare(
      `SELECT prl.id, prl.product_id, prl.quantity_microunits, pr.branch_id,
              p.serial_tracking_mode
       FROM purchase_receipt_lines prl
       INNER JOIN purchase_receipts pr
         ON pr.tenant_id = prl.tenant_id AND pr.id = prl.receipt_id
       INNER JOIN products p
         ON p.tenant_id = prl.tenant_id AND p.id = prl.product_id
       WHERE prl.tenant_id = ? AND prl.id = ? AND pr.branch_id = ? LIMIT 1`,
    )
    .bind(tenantId, input.purchaseReceiptLineId, input.branchId)
    .first<{
      id: string;
      product_id: string;
      quantity_microunits: number;
      branch_id: string;
      serial_tracking_mode: string;
    }>();
  if (!receiptLine) throw new Error('RECEIPT_LINE_NOT_FOUND');
  if (receiptLine.serial_tracking_mode !== 'REQUIRED')
    throw new Error('SERIAL_TRACKING_NOT_REQUIRED');
  if (receiptLine.quantity_microunits !== normalized.length * 1_000_000) {
    throw new Error('SERIAL_MANIFEST_COUNT_MISMATCH');
  }
  const placeholders = normalized.map(() => '?').join(',');
  const duplicate = await db
    .prepare(
      `SELECT id FROM serial_numbers
       WHERE tenant_id = ? AND serial_number_normalized IN (${placeholders}) LIMIT 1`,
    )
    .bind(tenantId, ...normalized)
    .first<{ id: string }>();
  if (duplicate) throw new Error('SERIAL_DUPLICATE');

  const locationId = input.locationId || serialDefaultLocationId(tenantId, input.branchId);
  const operationId = `receipt:${input.purchaseReceiptLineId}`;
  const manifestIds: string[] = [];
  await runD1AtomicPlan(db, async (plan) => {
    plan.guardState(
      `SELECT 1 FROM purchase_receipt_lines prl
       INNER JOIN purchase_receipts pr
         ON pr.tenant_id = prl.tenant_id AND pr.id = prl.receipt_id
       WHERE prl.tenant_id = ? AND prl.id = ? AND pr.branch_id = ?
         AND prl.quantity_microunits = ?`,
      [tenantId, input.purchaseReceiptLineId, input.branchId, normalized.length * 1_000_000],
    );
    for (let index = 0; index < normalized.length; index++) {
      const serialId = crypto.randomUUID();
      plan.add(
        db
          .prepare(
            `INSERT INTO serial_numbers (
               id, tenant_id, branch_id, location_id, product_id, serial_number,
               serial_number_normalized, status, purchase_receipt_line_id, version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, 1)`,
          )
          .bind(
            serialId,
            tenantId,
            input.branchId,
            locationId,
            receiptLine.product_id,
            input.serialNumbers[index]!.trim(),
            normalized[index],
            input.purchaseReceiptLineId,
          ),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO serial_number_events (
               id, tenant_id, serial_id, event_type, from_status, to_status,
               reference_type, reference_id, branch_id, location_id, actor_user_id,
               idempotency_key, payload_json
             ) VALUES (?, ?, ?, 'SERIAL_ASSIGN', NULL, 'AVAILABLE',
                       'PURCHASE_RECEIPT_LINE', ?, ?, ?, ?, ?, '{}')`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            serialId,
            input.purchaseReceiptLineId,
            input.branchId,
            locationId,
            userId,
            `${operationId}:${normalized[index]}`,
          ),
      );
      const manifestId = appendSerialManifestItemToPlan(plan, db, {
        tenantId,
        serialId,
        operationType: 'PURCHASE_RECEIPT',
        operationId,
        operationLineId: input.purchaseReceiptLineId,
        idempotencyKey: `receipt-manifest:${operationId}:${input.purchaseReceiptLineId}`,
      });
      await appendSerialAuditToPlan(plan, db, {
        tenantId,
        actorUserId: userId,
        action: 'SERIAL_ASSIGN',
        serialId,
        branchId: input.branchId,
        payload: {
          productId: receiptLine.product_id,
          purchaseReceiptLineId: input.purchaseReceiptLineId,
          locationId,
          operationId,
        },
      });
      if (manifestIds.length === 0) manifestIds.push(manifestId);
    }
  });
  return { manifestId: manifestIds[0]!, serialCount: normalized.length };
}

export async function acquireSerialLeaseAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  terminalId: string,
  input: { readonly serialId: string; readonly idempotencyKey: string },
): Promise<{ readonly leaseToken: string; readonly replayed: false }> {
  if (
    !required(tenantId) ||
    !required(userId) ||
    !required(terminalId) ||
    !required(input.serialId) ||
    !required(input.idempotencyKey)
  ) {
    throw new Error('SERIAL_CONTEXT_REQUIRED');
  }
  const existingLease = await db
    .prepare(
      `SELECT id, terminal_id, status FROM serial_terminal_leases
       WHERE tenant_id = ? AND serial_id = ? LIMIT 1`,
    )
    .bind(tenantId, input.serialId)
    .first<{ id: string; terminal_id: string; status: string }>();
  if (existingLease?.status === 'ACTIVE') {
    throw new Error(
      existingLease.terminal_id === terminalId
        ? 'SERIAL_LEASE_REPLAY'
        : 'SERIAL_LEASED_BY_OTHER_TERMINAL',
    );
  }
  if (existingLease?.status === 'CONSUMED') throw new Error('SERIAL_LEASE_REPLAY');
  const serial = await db
    .prepare(
      `SELECT sn.id, pt.id AS terminal_id
       FROM serial_numbers sn
       LEFT JOIN pos_terminals pt
         ON pt.tenant_id = sn.tenant_id AND pt.id = ?
        AND pt.branch_id = sn.branch_id AND pt.active = 1
       WHERE sn.tenant_id = ? AND sn.id = ? AND sn.status = 'AVAILABLE' LIMIT 1`,
    )
    .bind(terminalId, tenantId, input.serialId)
    .first<{ id: string; terminal_id: string | null }>();
  if (!serial) throw new Error('SERIAL_NOT_AVAILABLE');
  if (!serial.terminal_id) throw new Error('SERIAL_TERMINAL_BRANCH_INVALID');
  const leaseToken = opaqueToken();
  const tokenHash = await hashSerialLeaseToken(leaseToken);
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 FROM serial_numbers s
       INNER JOIN pos_terminals pt
         ON pt.tenant_id = s.tenant_id AND pt.id = ?
        AND pt.branch_id = s.branch_id AND pt.active = 1
       WHERE s.tenant_id = ? AND s.id = ? AND s.status = 'AVAILABLE'
         AND NOT EXISTS (
           SELECT 1 FROM serial_terminal_leases l
           WHERE l.tenant_id = s.tenant_id AND l.serial_id = s.id AND l.status = 'ACTIVE'
         )`,
      [terminalId, tenantId, input.serialId],
    );
    if (existingLease) {
      plan.add(
        db
          .prepare(
            `UPDATE serial_terminal_leases
             SET terminal_id = ?, token_hash = ?, status = 'ACTIVE',
                 consumed_at = NULL, released_at = NULL, revoked_at = NULL,
                 version = version + 1
             WHERE tenant_id = ? AND id = ? AND status IN ('RELEASED','REVOKED')`,
          )
          .bind(terminalId, tokenHash, tenantId, existingLease.id),
      );
    } else {
      plan.add(
        db
          .prepare(
            `INSERT INTO serial_terminal_leases (
               id, tenant_id, serial_id, terminal_id, token_hash, status, version
             ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1)`,
          )
          .bind(crypto.randomUUID(), tenantId, input.serialId, terminalId, tokenHash),
      );
    }
  });
  return { leaseToken, replayed: false };
}

export async function releaseSerialLeaseAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  terminalId: string,
  input: { readonly serialId: string; readonly leaseToken: string },
): Promise<{ readonly serialId: string; readonly status: 'RELEASED' }> {
  const tokenHash = await hashSerialLeaseToken(input.leaseToken);
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1
       FROM serial_terminal_leases l
       INNER JOIN serial_numbers sn
         ON sn.tenant_id = l.tenant_id AND sn.id = l.serial_id
       INNER JOIN pos_terminals pt
         ON pt.tenant_id = l.tenant_id AND pt.id = l.terminal_id
        AND pt.branch_id = sn.branch_id AND pt.active = 1
       WHERE l.tenant_id = ? AND l.serial_id = ? AND l.terminal_id = ?
         AND l.token_hash = ? AND l.status = 'ACTIVE'`,
      [tenantId, input.serialId, terminalId, tokenHash],
    );
    plan.add(
      db
        .prepare(
          `UPDATE serial_terminal_leases
           SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, version = version + 1
           WHERE tenant_id = ? AND serial_id = ? AND terminal_id = ?
             AND token_hash = ? AND status = 'ACTIVE'`,
        )
        .bind(tenantId, input.serialId, terminalId, tokenHash),
    );
  });
  return { serialId: input.serialId, status: 'RELEASED' };
}

export async function disposeSerialAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly serialId: string;
    readonly disposition: 'RETURN_TO_STOCK' | 'DAMAGED' | 'LOST' | 'RETURN_TO_SUPPLIER';
  },
): Promise<{ readonly serialId: string; readonly status: string }> {
  const serial = await db
    .prepare(
      `SELECT id, branch_id, location_id, product_id, status, version
       FROM serial_numbers WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.serialId)
    .first<{
      id: string;
      branch_id: string;
      location_id: string;
      product_id: string;
      status: string;
      version: number;
    }>();
  if (!serial) throw new Error('SERIAL_NOT_FOUND');
  const nextByDisposition = {
    RETURN_TO_STOCK: 'AVAILABLE',
    DAMAGED: 'DAMAGED',
    LOST: 'LOST',
    RETURN_TO_SUPPLIER: 'RETURNED_SUPPLIER',
  } as const;
  const nextStatus = nextByDisposition[input.disposition];
  if (!nextStatus) throw new Error('SERIAL_DISPOSITION_INVALID');
  if (input.disposition === 'RETURN_TO_STOCK' && serial.status !== 'RETURNED_INSPECTION') {
    throw new Error('SERIAL_DISPOSITION_INVALID');
  }
  await runD1AtomicPlan(db, async (plan) => {
    if (
      serial.status !== 'RESERVED' &&
      (nextStatus === 'DAMAGED' || nextStatus === 'LOST' || nextStatus === 'RETURNED_SUPPLIER')
    ) {
      appendOneUnitStockDebit(plan, db, {
        tenantId,
        userId,
        branchId: serial.branch_id,
        locationId: serial.location_id,
        productId: serial.product_id,
        referenceId: input.serialId,
        movementType: nextStatus,
      });
    }
    await appendSerialTransitionToPlan(plan, db, {
      tenantId,
      serialId: serial.id,
      branchId: serial.branch_id,
      locationId: serial.location_id,
      productId: serial.product_id,
      expectedStatus: serial.status,
      nextStatus,
      expectedVersion: serial.version,
      eventType: 'SERIAL_TRANSITION',
      operationType: 'DISPOSITION',
      operationId: input.serialId,
      idempotencyKey: `disposition:${input.serialId}:${serial.version}`,
      actorUserId: userId,
      currentSaleItemId: null,
      payload: { disposition: input.disposition },
    });
  });
  return { serialId: serial.id, status: nextStatus };
}

export async function processInventorySerialLossAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: { readonly serialId: string; readonly reason: string },
): Promise<{ readonly serialId: string; readonly status: 'LOST' }> {
  if (!required(input.reason)) throw new Error('SERIAL_LOSS_REASON_REQUIRED');
  const serial = await db
    .prepare(
      `SELECT id, branch_id, location_id, product_id, status, version
       FROM serial_numbers
       WHERE tenant_id = ? AND id = ? AND status IN ('AVAILABLE','RESERVED') LIMIT 1`,
    )
    .bind(tenantId, input.serialId)
    .first<{
      id: string;
      branch_id: string;
      location_id: string;
      product_id: string;
      status: string;
      version: number;
    }>();
  if (!serial) throw new Error('SERIAL_NOT_LOSS_ELIGIBLE');
  await runD1AtomicPlan(db, async (plan) => {
    if (serial.status === 'AVAILABLE') {
      appendOneUnitStockDebit(plan, db, {
        tenantId,
        userId,
        branchId: serial.branch_id,
        locationId: serial.location_id,
        productId: serial.product_id,
        referenceId: input.serialId,
        movementType: 'MERMA',
      });
    }
    await appendSerialTransitionToPlan(plan, db, {
      tenantId,
      serialId: serial.id,
      branchId: serial.branch_id,
      locationId: serial.location_id,
      productId: serial.product_id,
      expectedStatus: serial.status,
      nextStatus: 'LOST',
      expectedVersion: serial.version,
      eventType: 'LOSS',
      operationType: 'STOCK_LOSS',
      operationId: input.serialId,
      idempotencyKey: `loss:${input.serialId}:${serial.version}`,
      actorUserId: userId,
      payload: { reason: input.reason.trim() },
    });
  });
  return { serialId: serial.id, status: 'LOST' };
}

export async function processInventorySerialCountAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly countId: string;
    readonly branchId: string;
    readonly locationId: string;
    readonly productId: string;
    readonly observedSerialIds: readonly string[];
  },
): Promise<{ readonly countId: string; readonly lostSerialIds: readonly string[] }> {
  const observed = new Set(input.observedSerialIds);
  if (observed.size !== input.observedSerialIds.length) throw new Error('SERIAL_DUPLICATE');
  const rows = await db
    .prepare(
      `SELECT id, version FROM serial_numbers
       WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
         AND status = 'AVAILABLE'`,
    )
    .bind(tenantId, input.branchId, input.locationId, input.productId)
    .all<{ id: string; version: number }>();
  const available = rows.results ?? [];
  const availableIds = new Set(available.map((row) => row.id));
  if (input.observedSerialIds.some((id) => !availableIds.has(id))) {
    throw new Error('SERIAL_COUNT_IDENTITY_INVALID');
  }
  const missing = available.filter((row) => !observed.has(row.id));
  await runD1AtomicPlan(db, async (plan) => {
    for (const serial of missing) {
      appendOneUnitStockDebit(plan, db, {
        tenantId,
        userId,
        branchId: input.branchId,
        locationId: input.locationId,
        productId: input.productId,
        referenceId: input.countId,
        movementType: 'AJUSTE_CONTEO',
      });
      await appendSerialTransitionToPlan(plan, db, {
        tenantId,
        serialId: serial.id,
        branchId: input.branchId,
        locationId: input.locationId,
        productId: input.productId,
        expectedStatus: 'AVAILABLE',
        nextStatus: 'LOST',
        expectedVersion: serial.version,
        eventType: 'COUNT_LOSS',
        operationType: 'INVENTORY_COUNT',
        operationId: input.countId,
        idempotencyKey: `count:${input.countId}:${serial.id}`,
        actorUserId: userId,
      });
    }
  });
  return { countId: input.countId, lostSerialIds: missing.map((serial) => serial.id) };
}
