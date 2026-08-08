/**
 * Sprint 38 / ADR-0022 — stock por ubicación y transferencia intra-sucursal.
 * Preflight fuera; todos los writes de cada hecho usan un único db.batch.
 */
import { assertLocationCanDeactivate, planLocationTransfer } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';

export interface LocationAtomicActorInput {
  readonly branchId: string;
  readonly actorIsAdminOrOwner: boolean;
}

function assertPrivileged(input: LocationAtomicActorInput): void {
  if (!input.actorIsAdminOrOwner) throw new Error('LOCATION_FORBIDDEN');
  if (!input.branchId.trim()) throw new Error('LOCATION_BRANCH_REQUIRED');
}

async function sha256Hex(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const buf = await crypto.subtle.digest('SHA-256', bytes);
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

export function defaultLocationId(tenantId: string, branchId: string): string {
  return `loc-default:${tenantId}:${branchId}`;
}

export interface LocationStockDeltaInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly deltaMicrounits: number;
  readonly locationId?: string | null;
  readonly batchId?: string | null;
}

/**
 * Espeja un delta que el caller ya aplica al agregado branch. Solo agrega
 * statements al plan recibido: la frontera atómica sigue siendo el db.batch
 * del writer original.
 */
export function appendLocationStockDeltaToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: LocationStockDeltaInput,
): string {
  if (!Number.isSafeInteger(input.deltaMicrounits)) {
    throw new Error('LOCATION_INVALID_QUANTITY');
  }
  const locationId = input.locationId || defaultLocationId(input.tenantId, input.branchId);
  if (!input.locationId) {
    plan.add(
      db
        .prepare(
          `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
           SELECT ?, ?, ?, 'DEFAULT', 'Ubicación por defecto'
           WHERE NOT EXISTS (
             SELECT 1 FROM inventory_locations
             WHERE tenant_id = ? AND branch_id = ? AND code = 'DEFAULT'
           )`,
        )
        .bind(locationId, input.tenantId, input.branchId, input.tenantId, input.branchId),
    );
  }
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         )
         SELECT ?, ?, ?, ?, 0
         WHERE NOT EXISTS (
           SELECT 1 FROM inventory_location_stock
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
         )`,
      )
      .bind(
        input.tenantId,
        input.branchId,
        locationId,
        input.productId,
        input.tenantId,
        input.branchId,
        locationId,
        input.productId,
      ),
  );
  plan.add(
    db
      .prepare(
        `UPDATE inventory_location_stock
         SET quantity_microunits = quantity_microunits + ?,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?`,
      )
      .bind(input.deltaMicrounits, input.tenantId, input.branchId, locationId, input.productId),
  );
  if (input.batchId) {
    plan.add(
      db
        .prepare(
          `INSERT INTO inventory_location_batch_stock (
             tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
           )
           SELECT ?, ?, ?, ?, ?, 0
           WHERE NOT EXISTS (
             SELECT 1 FROM inventory_location_batch_stock
             WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
               AND product_id = ? AND batch_id = ?
           )`,
        )
        .bind(
          input.tenantId,
          input.branchId,
          locationId,
          input.productId,
          input.batchId,
          input.tenantId,
          input.branchId,
          locationId,
          input.productId,
          input.batchId,
        ),
    );
    plan.add(
      db
        .prepare(
          `UPDATE inventory_location_batch_stock
           SET quantity_microunits = quantity_microunits + ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND batch_id = ?`,
        )
        .bind(
          input.deltaMicrounits,
          input.tenantId,
          input.branchId,
          locationId,
          input.productId,
          input.batchId,
        ),
    );
  }
  return locationId;
}

export async function createInventoryLocationAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: LocationAtomicActorInput & {
    readonly code: string;
    readonly name?: string | null;
  },
): Promise<{ readonly locationId: string }> {
  assertPrivileged(input);
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('LOCATION_CODE_REQUIRED');
  const locationId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256Hex({
    action: 'CONFIG_CHANGE',
    entity_id: locationId,
    kind: 'LOCATION_CREATE',
    prev: prevHash,
  });
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO inventory_locations (
             id, tenant_id, branch_id, code, name
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(locationId, tenantId, input.branchId, code, input.name?.trim() || null),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'CONFIG_CHANGE', 'inventory_location', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          locationId,
          JSON.stringify({ kind: 'LOCATION_CREATE', code }),
          prevHash,
          rowHash,
        ),
    );
  });
  return { locationId };
}

export async function updateInventoryLocationAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: LocationAtomicActorInput & {
    readonly locationId: string;
    readonly code: string;
    readonly name?: string | null;
  },
): Promise<{ readonly locationId: string }> {
  assertPrivileged(input);
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error('LOCATION_CODE_REQUIRED');
  if (input.locationId === defaultLocationId(tenantId, input.branchId) && code !== 'DEFAULT') {
    throw new Error('LOCATION_DEFAULT_IMMUTABLE');
  }
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256Hex({
    action: 'CONFIG_CHANGE',
    entity_id: input.locationId,
    kind: 'LOCATION_UPDATE',
    code,
    prev: prevHash,
  });
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 FROM inventory_locations
       WHERE tenant_id = ? AND branch_id = ? AND id = ? AND is_active = 1`,
      [tenantId, input.branchId, input.locationId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE inventory_locations
           SET code = ?, name = ?, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND id = ? AND is_active = 1`,
        )
        .bind(code, input.name?.trim() || null, tenantId, input.branchId, input.locationId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'CONFIG_CHANGE', 'inventory_location', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          input.locationId,
          JSON.stringify({ kind: 'LOCATION_UPDATE', code }),
          prevHash,
          rowHash,
        ),
    );
  });
  return { locationId: input.locationId };
}

export async function deactivateInventoryLocationAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  input: LocationAtomicActorInput & { readonly locationId: string },
): Promise<{ readonly locationId: string; readonly active: false }> {
  assertPrivileged(input);
  if (input.locationId === defaultLocationId(tenantId, input.branchId)) {
    throw new Error('LOCATION_DEFAULT_IMMUTABLE');
  }
  const sumCol = 'quantity_microunits';
  const total = await db
    .prepare(
      `SELECT COALESCE(SUM(${sumCol}), 0) AS total_qty FROM inventory_location_stock ` +
        'WHERE tenant_id = ? AND branch_id = ? AND location_id = ?',
    )
    .bind(tenantId, input.branchId, input.locationId)
    .first<{ total_qty: number }>();
  assertLocationCanDeactivate(total?.total_qty ?? 0);
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      'SELECT 1 FROM inventory_locations l ' +
        'WHERE l.tenant_id = ? AND l.branch_id = ? AND l.id = ? AND l.is_active = 1 ' +
        'AND NOT EXISTS ( ' +
        'SELECT 1 FROM inventory_location_stock s ' +
        'WHERE s.tenant_id = l.tenant_id AND s.branch_id = l.branch_id AND s.location_id = l.id ' +
        'AND s.quantity_microunits > 0 )',
      [tenantId, input.branchId, input.locationId],
    );
    plan.add(
      db
        .prepare(
          `UPDATE inventory_locations SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND id = ? AND is_active = 1`,
        )
        .bind(tenantId, input.branchId, input.locationId),
    );
  });
  return { locationId: input.locationId, active: false };
}

export interface LocationTransferInput extends LocationAtomicActorInput {
  readonly sourceLocationId: string;
  readonly destinationLocationId: string;
  readonly productId: string;
  readonly batchId?: string | null;
  readonly quantityMicrounits: number;
  readonly idempotencyKey: string;
}

export interface LocationTransferResult {
  readonly transferId: string;
  readonly sourceAfterMicrounits: number;
  readonly destinationAfterMicrounits: number;
  readonly alreadyApplied: boolean;
}

export async function processInventoryLocationTransferAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: LocationTransferInput,
): Promise<LocationTransferResult> {
  assertPrivileged(input);
  if (input.sourceLocationId === input.destinationLocationId) {
    throw new Error('LOCATION_TRANSFER_SAME');
  }
  if (!input.idempotencyKey.trim()) throw new Error('LOCATION_IDEMPOTENCY_REQUIRED');

  const existing = await db
    .prepare(
      `SELECT id FROM inventory_location_transfers
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, input.idempotencyKey)
    .first<{ id: string }>();
  if (existing) {
    const current = await loadTransferBalances(db, tenantId, input);
    return {
      transferId: existing.id,
      sourceAfterMicrounits: current.source,
      destinationAfterMicrounits: current.destination,
      alreadyApplied: true,
    };
  }

  const balances = await loadTransferBalances(db, tenantId, input);
  const transfer = planLocationTransfer({
    sourceQuantityMicrounits: balances.source,
    destinationQuantityMicrounits: balances.destination,
    transferQuantityMicrounits: input.quantityMicrounits,
  });
  const transferId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, tenantId);
  const payload = {
    sourceLocationId: input.sourceLocationId,
    destinationLocationId: input.destinationLocationId,
    productId: input.productId,
    batchId: input.batchId ?? null,
    quantityMicrounits: input.quantityMicrounits,
  };
  const rowHash = await sha256Hex({
    action: 'LOCATION_TRANSFER',
    entity_id: transferId,
    ...payload,
    prev: prevHash,
  });

  await runD1AtomicPlan(db, (plan) => {
    const batchGuard = input.batchId
      ? ` AND EXISTS (
            SELECT 1 FROM inventory_location_batch_stock
            WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
              AND product_id = ? AND batch_id = ? AND quantity_microunits >= ?
          )`
      : '';
    const guardParams: unknown[] = [
      tenantId,
      input.branchId,
      input.sourceLocationId,
      tenantId,
      input.branchId,
      input.destinationLocationId,
      tenantId,
      input.branchId,
      input.sourceLocationId,
      input.productId,
      input.quantityMicrounits,
    ];
    if (input.batchId) {
      guardParams.push(
        tenantId,
        input.branchId,
        input.sourceLocationId,
        input.productId,
        input.batchId,
        input.quantityMicrounits,
      );
    }
    plan.guardState(
      `SELECT 1
       WHERE EXISTS (
         SELECT 1 FROM inventory_locations
         WHERE tenant_id = ? AND branch_id = ? AND id = ? AND is_active = 1
       ) AND EXISTS (
         SELECT 1 FROM inventory_locations
         WHERE tenant_id = ? AND branch_id = ? AND id = ? AND is_active = 1
       ) AND EXISTS (
         SELECT 1 FROM inventory_location_stock
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
           AND product_id = ? AND quantity_microunits >= ?
       )${batchGuard}`,
      guardParams,
    );
    appendTransferStatements(plan, db, tenantId, userId, input, transferId);
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'LOCATION_TRANSFER', 'inventory_location_transfer',
                     ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          transferId,
          JSON.stringify(payload),
          prevHash,
          rowHash,
        ),
    );
  });

  return {
    transferId,
    sourceAfterMicrounits: transfer.sourceAfterMicrounits,
    destinationAfterMicrounits: transfer.destinationAfterMicrounits,
    alreadyApplied: false,
  };
}

async function loadTransferBalances(
  db: D1DatabaseLike,
  tenantId: string,
  input: LocationTransferInput,
): Promise<{ source: number; destination: number }> {
  const rows = await db
    .prepare(
      `SELECT location_id, quantity_microunits
       FROM inventory_location_stock
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
         AND location_id IN (?, ?)`,
    )
    .bind(
      tenantId,
      input.branchId,
      input.productId,
      input.sourceLocationId,
      input.destinationLocationId,
    )
    .all<{ location_id: string; quantity_microunits: number }>();
  const found = new Map(
    (rows.results ?? []).map((row) => [row.location_id, row.quantity_microunits]),
  );
  return {
    source: found.get(input.sourceLocationId) ?? 0,
    destination: found.get(input.destinationLocationId) ?? 0,
  };
}

function appendTransferStatements(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: LocationTransferInput,
  transferId: string,
): void {
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         )
         SELECT ?, ?, ?, ?, 0
         WHERE NOT EXISTS (
           SELECT 1 FROM inventory_location_stock
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
         )`,
      )
      .bind(
        tenantId,
        input.branchId,
        input.destinationLocationId,
        input.productId,
        tenantId,
        input.branchId,
        input.destinationLocationId,
        input.productId,
      ),
  );
  for (const [locationId, delta] of [
    [input.sourceLocationId, -input.quantityMicrounits],
    [input.destinationLocationId, input.quantityMicrounits],
  ] as const) {
    plan.add(
      db
        .prepare(
          `UPDATE inventory_location_stock
           SET quantity_microunits = quantity_microunits + ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?`,
        )
        .bind(delta, tenantId, input.branchId, locationId, input.productId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO inventory_movements (
             id, tenant_id, branch_id, product_id, batch_id, movement_type,
             quantity_delta, quantity_delta_microunits, unit_cost_cents,
             stock_after, stock_after_microunits, user_id, reference_id,
             location_id, counter_location_id
           )
           SELECT ?, ?, ?, ?, ?, 'LOCATION_TRANSFER', ?, ?, b.pmp_unit_cost_cents,
                  b.stock, b.stock_microunits, ?, ?, ?, ?
           FROM branch_product_stock b
           WHERE b.tenant_id = ? AND b.branch_id = ? AND b.product_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          input.productId,
          input.batchId ?? null,
          delta / 1_000_000,
          delta,
          userId,
          transferId,
          locationId,
          locationId === input.sourceLocationId
            ? input.destinationLocationId
            : input.sourceLocationId,
          tenantId,
          input.branchId,
          input.productId,
        ),
    );
  }
  if (input.batchId) appendBatchTransfer(plan, db, tenantId, input);
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_location_transfers (
           id, tenant_id, branch_id, source_location_id, destination_location_id,
           product_id, batch_id, quantity_microunits, idempotency_key,
           created_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        transferId,
        tenantId,
        input.branchId,
        input.sourceLocationId,
        input.destinationLocationId,
        input.productId,
        input.batchId ?? null,
        input.quantityMicrounits,
        input.idempotencyKey,
        userId,
      ),
  );
}

function appendBatchTransfer(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  input: LocationTransferInput & { readonly batchId?: string | null },
): void {
  const batchId = input.batchId!;
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_location_batch_stock (
           tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
         )
         SELECT ?, ?, ?, ?, ?, 0
         WHERE NOT EXISTS (
           SELECT 1 FROM inventory_location_batch_stock
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND batch_id = ?
         )`,
      )
      .bind(
        tenantId,
        input.branchId,
        input.destinationLocationId,
        input.productId,
        batchId,
        tenantId,
        input.branchId,
        input.destinationLocationId,
        input.productId,
        batchId,
      ),
  );
  for (const [locationId, delta] of [
    [input.sourceLocationId, -input.quantityMicrounits],
    [input.destinationLocationId, input.quantityMicrounits],
  ] as const) {
    plan.add(
      db
        .prepare(
          `UPDATE inventory_location_batch_stock
           SET quantity_microunits = quantity_microunits + ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND batch_id = ?`,
        )
        .bind(delta, tenantId, input.branchId, locationId, input.productId, batchId),
    );
  }
}
