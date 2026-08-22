/** Sprint 38 — locations/racks API, flag default-off y tenant desde JWT. */
import {
  createInventoryLocationAtomic,
  deactivateInventoryLocationAtomic,
  processInventoryLocationTransferAtomic,
  updateInventoryLocationAtomic,
} from '@kipuspay/adapters-d1';
import { allocateStockByLocation } from '@kipuspay/domain-inventory';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isInventoryLocationsEnabled } from '../auth/features.js';
import { ENTERED_QUANTITY_RULE, parseMicrounitsInput } from '../http/quantity-input.js';

export { isInventoryLocationsEnabled };

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_INVENTORY_LOCATIONS off', code: 'FEATURE_OFF' },
  };
}

function gate(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  privileged = false,
): HttpResult | null {
  if (!isInventoryLocationsEnabled(env)) return featureOff();
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const operational = role === 'cashier' || role === 'admin' || role === 'owner';
  const allowed = privileged ? role === 'admin' || role === 'owner' : operational;
  return allowed ? null : { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
}

export async function runListInventoryLocationsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  query: { branchId?: string; includeInactive?: boolean },
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const branchId = query.branchId?.trim() ?? '';
  if (!branchId) return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  const rows = await env!
    .DB!.prepare(
      `SELECT id, branch_id, code, name, is_active, created_at, updated_at
     FROM inventory_locations
     WHERE tenant_id = ? AND branch_id = ? AND (? = 1 OR is_active = 1)
     ORDER BY code, id`,
    )
    .bind(tenantId, branchId, query.includeInactive ? 1 : 0)
    .all();
  return { status: 200, body: { items: rows.results ?? [] } };
}

export async function runCreateInventoryLocationHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!branchId || !code) {
    return { status: 400, body: { error: 'branchId and code required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await createInventoryLocationAtomic(env!.DB!, tenantId, userId, {
      branchId,
      code,
      name: typeof body.name === 'string' ? body.name : null,
      actorIsAdminOrOwner: true,
    });
    return { status: 201, body: result };
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : 'LOCATION_CREATE_FAILED';
    return { status: 422, body: { error: codeValue, code: codeValue } };
  }
}

export async function runUpdateInventoryLocationHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
  const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!branchId || !locationId || !code) {
    return {
      status: 400,
      body: { error: 'branchId, locationId and code required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await updateInventoryLocationAtomic(env!.DB!, tenantId, userId, {
      branchId,
      locationId,
      code,
      name: typeof body.name === 'string' ? body.name : null,
      actorIsAdminOrOwner: true,
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : 'LOCATION_UPDATE_FAILED';
    return { status: 422, body: { error: codeValue, code: codeValue } };
  }
}

export async function runDeactivateInventoryLocationHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  _userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
  const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : '';
  if (!branchId || !locationId) {
    return {
      status: 400,
      body: { error: 'branchId and locationId required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await deactivateInventoryLocationAtomic(env!.DB!, tenantId, {
      branchId,
      locationId,
      actorIsAdminOrOwner: true,
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : 'LOCATION_DEACTIVATE_FAILED';
    return { status: 422, body: { error: codeValue, code: codeValue } };
  }
}

export async function runInventoryLocationStockHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  query: { branchId?: string; locationId?: string; productId?: string },
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const branchId = query.branchId?.trim() ?? '';
  if (!branchId) return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  const locationId = query.locationId?.trim() || null;
  const productId = query.productId?.trim() || null;
  const rows = await env!
    .DB!.prepare(
      `SELECT s.location_id, l.code AS location_code, s.product_id, p.name AS product_name,
            s.quantity_microunits, b.stock_microunits AS branch_quantity_microunits
     FROM inventory_location_stock s
     JOIN inventory_locations l
       ON l.tenant_id = s.tenant_id AND l.branch_id = s.branch_id AND l.id = s.location_id
     JOIN products p ON p.tenant_id = s.tenant_id AND p.id = s.product_id
     JOIN branch_product_stock b
       ON b.tenant_id = s.tenant_id AND b.branch_id = s.branch_id
      AND b.product_id = s.product_id
     WHERE s.tenant_id = ? AND s.branch_id = ?
       AND (? IS NULL OR s.location_id = ?)
       AND (? IS NULL OR s.product_id = ?)
     ORDER BY l.code, p.name, s.product_id`,
    )
    .bind(tenantId, branchId, locationId, locationId, productId, productId)
    .all();
  return { status: 200, body: { items: rows.results ?? [] } };
}

export async function runInventoryLocationTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  // US-05 AC1/AC3: parser único fail-closed (sin Number()): '\u00A012',
  // ' 12 ', true y [] ya no se convierten en cantidad — 400 estable antes
  // del plan atómico.
  const qty = parseMicrounitsInput(body.quantityMicrounits, ENTERED_QUANTITY_RULE);
  if (!qty.ok) {
    return {
      status: 400,
      body: { error: 'QUANTITY_MICROUNITS_INVALID', code: 'QUANTITY_MICROUNITS_INVALID' },
    };
  }
  try {
    const result = await processInventoryLocationTransferAtomic(env!.DB!, tenantId, userId, {
      branchId: typeof body.branchId === 'string' ? body.branchId : '',
      sourceLocationId: typeof body.sourceLocationId === 'string' ? body.sourceLocationId : '',
      destinationLocationId:
        typeof body.destinationLocationId === 'string' ? body.destinationLocationId : '',
      productId: typeof body.productId === 'string' ? body.productId : '',
      batchId: typeof body.batchId === 'string' ? body.batchId : null,
      quantityMicrounits: qty.microunits,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
      actorIsAdminOrOwner: true,
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'LOCATION_TRANSFER_FAILED';
    return { status: 422, body: { error: code, code } };
  }
}

export async function runInventoryLocationPickingHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  // US-05: la cantidad llega CRUDA (query text o número) y se valida con el
  // parser único fail-closed; el tipo declarado ya no promete un number.
  query: { branchId?: string; productId?: string; quantityMicrounits?: unknown },
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const branchId = query.branchId?.trim() ?? '';
  const productId = query.productId?.trim() ?? '';
  const requestedQty = parseMicrounitsInput(query.quantityMicrounits, ENTERED_QUANTITY_RULE);
  if (!branchId || !productId || !requestedQty.ok) {
    return { status: 400, body: { error: 'invalid picking query', code: 'BAD_REQUEST' } };
  }
  const requested = requestedQty.microunits;
  const rows = await env!
    .DB!.prepare(
      `SELECT s.location_id, l.code AS location_code, s.batch_id,
            b.expiration_date, s.quantity_microunits
     FROM inventory_location_batch_stock s
     JOIN inventory_locations l
       ON l.tenant_id = s.tenant_id AND l.branch_id = s.branch_id
      AND l.id = s.location_id AND l.is_active = 1
     JOIN inventory_batches b ON b.tenant_id = s.tenant_id AND b.id = s.batch_id
     WHERE s.tenant_id = ? AND s.branch_id = ? AND s.product_id = ?
       AND s.quantity_microunits > 0
     ORDER BY COALESCE(b.expiration_date, '9999-12-31'), l.code, s.batch_id`,
    )
    .bind(tenantId, branchId, productId)
    .all<{
      location_id: string;
      location_code: string;
      batch_id: string;
      expiration_date: string | null;
      quantity_microunits: number;
    }>();
  try {
    const items = allocateStockByLocation(
      (rows.results ?? []).map((row) => ({
        locationId: row.location_id,
        locationCode: row.location_code,
        batchId: row.batch_id,
        expiresAtIso: row.expiration_date,
        quantityMicrounits: row.quantity_microunits,
      })),
      requested,
      new Date().toISOString().slice(0, 10),
    );
    return { status: 200, body: { items } };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PICKING_FAILED';
    return { status: 422, body: { error: code, code } };
  }
}
