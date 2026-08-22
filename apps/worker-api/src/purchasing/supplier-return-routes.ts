/**
 * Sprint 34 — devolución a proveedor (FEATURE_PURCHASING_RETURNS, default off).
 */
import {
  processSupplierReturnCancelAtomic,
  processSupplierReturnCloseAtomic,
  processSupplierReturnCreateAtomic,
  type ProcessSupplierReturnCreateInput,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  parseMicrounitsInput,
  type MicrounitsParser,
} from '../http/microunits-input.js';

export function isPurchasingReturnsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_PURCHASING_RETURNS === '1' || env?.FEATURE_PURCHASING_RETURNS === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'FEATURE_PURCHASING_RETURNS off', code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'SUPPLIER_RETURN_ITEMS_REQUIRED',
  'SUPPLIER_RETURN_INVALID_AMOUNT',
  'SUPPLIER_RETURN_INVALID_STATUS',
  'SUPPLIER_RETURN_ALREADY_CLOSED',
  'SUPPLIER_RETURN_ALREADY_TERMINAL',
  'SUPPLIER_RETURN_QTY_EXCEEDED',
  'SUPPLIER_RETURN_COST_MISMATCH',
  'AP_ALREADY_PAID',
  'AP_INSUFFICIENT',
  'INSUFFICIENT_STOCK',
  'PRODUCT_NOT_ON_RECEIPT',
  'PRODUCT_NOT_ON_INVOICE',
  'BRANCH_MISMATCH',
  'INVOICE_RECEIPT_MISMATCH',
  'AUTH_REQUIRED',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'SUPPLIER_RETURN_FAILED';
  if (
    code === 'SUPPLIER_RETURN_NOT_FOUND' ||
    code === 'RECEIPT_NOT_FOUND' ||
    code === 'INVOICE_NOT_FOUND'
  ) {
    return { status: 404, body: { error: code, code } };
  }
  const status =
    CLIENT_422.has(code) || code.startsWith('UOM_') || code.startsWith('QTY_') ? 422 : 400;
  return { status, body: { error: code, code } };
}

function opts(env: WorkerEnv | undefined) {
  return {
    catalogUomEnabled: env?.FEATURE_CATALOG_UOM === '1' || env?.FEATURE_CATALOG_UOM === 'true',
    ledgerChartOfAccountsEnabled:
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true',
  };
}

interface ReturnItemInput {
  productId: string;
  enteredQuantityMicrounits: number;
  uomId: string | null;
  batchId: string | null;
}

/**
 * Convierte las filas crudas del body a items validados (V-21): null si
 * algún `enteredQuantityMicrounits` es de tipo inválido o si el helper
 * inyectado lanza — fail-closed, sin coerción Number().
 */
function parseReturnItems(
  rawItems: unknown,
  parseMicrounits: MicrounitsParser,
): ReturnItemInput[] | null {
  if (!Array.isArray(rawItems)) return [];
  const items: ReturnItemInput[] = [];
  for (const raw of rawItems) {
    const row = raw as Record<string, unknown>;
    let enteredQuantityMicrounits: number;
    try {
      const parsed = parseMicrounits(row.enteredQuantityMicrounits);
      if (!parsed.ok) return null;
      enteredQuantityMicrounits = parsed.microunits;
    } catch {
      return null;
    }
    items.push({
      productId: typeof row.productId === 'string' ? row.productId : '',
      enteredQuantityMicrounits,
      uomId: typeof row.uomId === 'string' ? row.uomId : null,
      batchId: typeof row.batchId === 'string' ? row.batchId : null,
    });
  }
  return items;
}

/** Payload canónico del create (mapeo tipado del body crudo). */
function returnCreatePayload(
  body: Record<string, unknown>,
  purchaseReceiptId: string,
  reason: string,
  items: ReturnItemInput[],
): ProcessSupplierReturnCreateInput {
  return {
    branchId: typeof body.branchId === 'string' ? body.branchId : '',
    purchaseReceiptId,
    supplierInvoiceId:
      typeof body.supplierInvoiceId === 'string' ? body.supplierInvoiceId : null,
    reason,
    supplierCreditNoteRef:
      typeof body.supplierCreditNoteRef === 'string' ? body.supplierCreditNoteRef : null,
    items,
  };
}

export async function runCreateSupplierReturnHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
  parseMicrounits: MicrounitsParser = parseMicrounitsInput,
): Promise<HttpResult> {
  if (!isPurchasingReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const invalidMicrounits = (): HttpResult => ({
    status: 400,
    body: { error: 'invalid enteredQuantityMicrounits', code: 'INVALID_MICROUNITS' },
  });
  const purchaseReceiptId =
    typeof body.purchaseReceiptId === 'string' ? body.purchaseReceiptId : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const parsedItems = parseReturnItems(body.items, parseMicrounits);
  if (!parsedItems) return invalidMicrounits();
  const returnableItems = parsedItems.filter((l) => l.productId.length > 0);
  if (!purchaseReceiptId || returnableItems.length === 0) {
    return {
      status: 400,
      body: { error: 'purchaseReceiptId and items required', code: 'BAD_REQUEST' },
    };
  }
  const payload = returnCreatePayload(body, purchaseReceiptId, reason, returnableItems);
  try {
    const result = await processSupplierReturnCreateAtomic(env.DB, tenantId, userId, payload, opts(
      env,
    ));
    return { status: 200, body: { ...result } };
  } catch (err) {
    return mapError(err);
  }
}

export async function runCloseSupplierReturnHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isPurchasingReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const returnId = typeof body.returnId === 'string' ? body.returnId : '';
  if (!returnId) return { status: 400, body: { error: 'returnId required', code: 'BAD_REQUEST' } };
  try {
    const result = await processSupplierReturnCloseAtomic(
      env.DB,
      tenantId,
      userId,
      {
        returnId,
        priceDiffOverride: body.priceDiffOverride === true,
        authorizedByUserId:
          typeof body.authorizedByUserId === 'string' ? body.authorizedByUserId : null,
      },
      opts(env),
    );
    return { status: 200, body: { ...result } };
  } catch (err) {
    return mapError(err);
  }
}

export async function runCancelSupplierReturnHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isPurchasingReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const returnId = typeof body.returnId === 'string' ? body.returnId : '';
  if (!returnId) return { status: 400, body: { error: 'returnId required', code: 'BAD_REQUEST' } };
  try {
    const result = await processSupplierReturnCancelAtomic(env.DB, tenantId, userId, { returnId });
    return { status: 200, body: { ...result } };
  } catch (err) {
    return mapError(err);
  }
}

export async function runOwnerSupplierReturnsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role = '',
): Promise<HttpResult> {
  if (!isPurchasingReturnsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  // T-1: reporte Dueño solo admin/owner (nunca cashier).
  if (role !== 'owner' && role !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }

  const open = await env.DB.prepare(
    `SELECT id, branch_id, supplier_id, status, total_cents, reason, created_at
     FROM supplier_returns
     WHERE tenant_id = ? AND status = 'OPEN'
     ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      branch_id: string;
      supplier_id: string;
      status: string;
      total_cents: number;
      reason: string;
      created_at: string;
    }>();
  return {
    status: 200,
    body: {
      openReturns: (open.results ?? []).map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        supplierId: r.supplier_id,
        status: r.status,
        totalCents: r.total_cents,
        reason: r.reason,
        createdAt: r.created_at,
      })),
    },
  };
}
