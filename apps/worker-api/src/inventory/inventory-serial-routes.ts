/** Sprint 39 — serial identity API. Tenant identity always comes from verified JWT. */
import {
  acquireSerialLeaseAtomic,
  configureSerialTrackingAtomic,
  createSerialManifestAtomic,
  disposeSerialAtomic,
  releaseSerialLeaseAtomic,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isInventorySerialsEnabled } from '../auth/features.js';

export { isInventorySerialsEnabled };

export interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function gate(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  privileged = false,
): HttpResult | null {
  if (!isInventorySerialsEnabled(env)) {
    return {
      status: 404,
      body: { error: 'FEATURE_INVENTORY_SERIALS off', code: 'FEATURE_OFF' },
    };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const operational = role === 'cashier' || role === 'admin' || role === 'owner';
  const allowed = privileged ? role === 'admin' || role === 'owner' : operational;
  return allowed ? null : { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function adapterError(error: unknown, fallback: string): HttpResult {
  const candidate = error instanceof Error ? error.message : '';
  const expected = /^SERIAL_[A-Z0-9_]+$/.test(candidate);
  const code = expected ? candidate : fallback;
  const actions: Record<string, string> = {
    SERIAL_STOCK_EXISTS: 'Descarga el stock del producto antes de activar el rastreo.',
    SERIAL_LEASE_CONFLICT:
      'Libera la reserva desde el terminal que la adquirió e intenta de nuevo.',
  };
  return {
    status: expected ? 422 : 500,
    body: {
      error: code,
      code,
      action:
        actions[code] ?? 'Corrige la serie o libera el lease desde el terminal que lo adquirió.',
    },
  };
}

export async function runConfigureSerialTrackingHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const productId = stringField(body, 'productId');
  const serialTrackingMode = stringField(body, 'serialTrackingMode');
  if (!productId || (serialTrackingMode !== 'NONE' && serialTrackingMode !== 'REQUIRED')) {
    return {
      status: 400,
      body: { error: 'productId and valid serialTrackingMode required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await configureSerialTrackingAtomic(env!.DB!, tenantId, userId, {
      productId,
      serialTrackingMode,
    });
    return { status: 200, body: result };
  } catch (error) {
    return adapterError(error, 'SERIAL_TRACKING_CONFIG_FAILED');
  }
}

async function loadSerialRows(
  db: D1Database,
  tenantId: string,
  serialNumber: string,
  productId: string | null,
  status: string | null,
): Promise<readonly unknown[]> {
  let sql = `SELECT id AS serial_id, serial_number, product_id, branch_id, location_id,
                    status, current_sale_item_id AS sale_item_id, updated_at
             FROM serial_numbers
             WHERE tenant_id = ?`;
  const binds: unknown[] = [tenantId];
  if (serialNumber) {
    sql += ` AND serial_number_normalized = ?`;
    binds.push(serialNumber);
  }
  if (productId) {
    sql += ` AND product_id = ?`;
    binds.push(productId);
  }
  if (status) {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  sql += ` ORDER BY updated_at DESC, id LIMIT 100`;
  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all();
  return rows.results ?? [];
}

export async function runSearchSerialsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  query: { serialNumber?: string; productId?: string; status?: string },
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const serialNumber = query.serialNumber?.trim().normalize('NFKC').toUpperCase() ?? '';
  const productId = query.productId?.trim() || null;
  const status = query.status?.trim() || null;
  if (!serialNumber && !productId) {
    return {
      status: 400,
      body: { error: 'serialNumber or productId required', code: 'BAD_REQUEST' },
    };
  }
  const items = await loadSerialRows(env!.DB!, tenantId, serialNumber, productId, status);
  return { status: 200, body: { items } };
}

export async function runCreateSerialManifestHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const branchId = stringField(body, 'branchId');
  const purchaseReceiptLineId = stringField(body, 'purchaseReceiptLineId');
  const locationId = stringField(body, 'locationId');
  const serialNumbers = Array.isArray(body.serialNumbers)
    ? body.serialNumbers
        .filter((serial): serial is string => typeof serial === 'string')
        .map((serial) => serial.trim())
        .filter(Boolean)
    : [];
  if (!branchId || !purchaseReceiptLineId || serialNumbers.length === 0) {
    return {
      status: 400,
      body: {
        error: 'branchId, purchaseReceiptLineId and serialNumbers required',
        code: 'BAD_REQUEST',
      },
    };
  }
  try {
    const result = await createSerialManifestAtomic(env!.DB!, tenantId, userId, {
      branchId,
      purchaseReceiptLineId,
      ...(locationId ? { locationId } : {}),
      serialNumbers,
    });
    return { status: 201, body: result };
  } catch (error) {
    return adapterError(error, 'SERIAL_MANIFEST_FAILED');
  }
}

export async function runAcquireSerialLeaseHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  terminalId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const serialId = stringField(body, 'serialId');
  const idempotencyKey = stringField(body, 'idempotencyKey');
  if (!serialId || !terminalId.trim() || !idempotencyKey) {
    return {
      status: 400,
      body: { error: 'serialId, terminalId and idempotencyKey required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await acquireSerialLeaseAtomic(env!.DB!, tenantId, userId, terminalId.trim(), {
      serialId,
      idempotencyKey,
    });
    return { status: 201, body: result };
  } catch (error) {
    return adapterError(error, 'SERIAL_LEASE_FAILED');
  }
}

export async function runReleaseSerialLeaseHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string | undefined,
  terminalId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role);
  if (denied) return denied;
  const serialId = stringField(body, 'serialId');
  const leaseToken = stringField(body, 'leaseToken');
  if (!serialId || !terminalId.trim() || !leaseToken) {
    return {
      status: 400,
      body: { error: 'serialId, terminalId and leaseToken required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await releaseSerialLeaseAtomic(env!.DB!, tenantId, terminalId.trim(), {
      serialId,
      leaseToken,
    });
    return { status: 200, body: result };
  } catch (error) {
    return adapterError(error, 'SERIAL_LEASE_RELEASE_FAILED');
  }
}

export async function runDisposeSerialHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = gate(env, tenantId, role, true);
  if (denied) return denied;
  const serialId = stringField(body, 'serialId');
  const disposition = stringField(body, 'disposition');
  if (!serialId || !disposition) {
    return {
      status: 400,
      body: { error: 'serialId and disposition required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await disposeSerialAtomic(env!.DB!, tenantId, userId, {
      serialId,
      disposition: disposition as 'RETURN_TO_STOCK' | 'DAMAGED' | 'LOST' | 'RETURN_TO_SUPPLIER',
    });
    return { status: 200, body: result };
  } catch (error) {
    return adapterError(error, 'SERIAL_DISPOSITION_FAILED');
  }
}
