/**
 * Transferencias + recepción parcial OC — Sprint 20.
 * HTTP thin → adapters ACID (stock espejo / CxP).
 */
import {
  cancelStockTransferAtomic,
  createStockTransferAtomic,
  processPartialReceiveAtomic,
  receiveStockTransferAtomic,
  shipStockTransferAtomic,
} from '@kipuspay/adapters-d1';
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

function mapDomainError(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  const client =
    msg.includes('NOT_FOUND') ||
    msg.includes('INVALID') ||
    msg.includes('MISMATCH') ||
    msg.includes('REQUIRED') ||
    msg.includes('EXCEEDS') ||
    msg.includes('INSUFFICIENT') ||
    msg.includes('SAME_BRANCH') ||
    msg.includes('REQUIRES');
  return {
    status: client ? 422 : 500,
    body: { error: msg, code: msg },
  };
}

export async function runCreateTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    fromBranchId?: string;
    toBranchId?: string;
    notes?: string | null;
    lines?: readonly { productId?: string; qtySent?: number; batchId?: string | null }[];
  },
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();
  const fromBranchId = body.fromBranchId?.trim() ?? '';
  const toBranchId = body.toBranchId?.trim() ?? '';
  if (!fromBranchId || !toBranchId) {
    return {
      status: 400,
      body: { error: 'fromBranchId and toBranchId required', code: 'BAD_REQUEST' },
    };
  }
  try {
    const result = await createStockTransferAtomic(env.DB, tenantId, userId, {
      fromBranchId,
      toBranchId,
      notes: body.notes ?? null,
      lines: (body.lines ?? []).map((l) => ({
        productId: l.productId ?? '',
        qtySent: l.qtySent ?? 0,
        batchId: l.batchId ?? null,
      })),
    });
    return { status: 201, body: { ...result } };
  } catch (e) {
    return mapDomainError(e);
  }
}

export async function runShipTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { transferId?: string },
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();
  const transferId = body.transferId?.trim() ?? '';
  if (!transferId) {
    return { status: 400, body: { error: 'transferId required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await shipStockTransferAtomic(env.DB, tenantId, userId, transferId);
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapDomainError(e);
  }
}

export async function runReceiveTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
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
  if (!transferId) {
    return { status: 400, body: { error: 'transferId required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await receiveStockTransferAtomic(env.DB, tenantId, userId, {
      transferId,
      lines: (body.lines ?? []).map((l) => ({
        lineId: l.lineId ?? '',
        qtyReceived: l.qtyReceived ?? 0,
        qtyShrink: l.qtyShrink ?? 0,
        shrinkReason: l.shrinkReason ?? null,
      })),
    });
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapDomainError(e);
  }
}

export async function runCancelTransferHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: { transferId?: string },
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();
  const transferId = body.transferId?.trim() ?? '';
  if (!transferId) {
    return { status: 400, body: { error: 'transferId required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await cancelStockTransferAtomic(env.DB, tenantId, userId, transferId);
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapDomainError(e);
  }
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
  try {
    const result = await processPartialReceiveAtomic(env.DB, tenantId, userId, {
      purchaseOrderId: poId,
      branchId,
      lines: (body.lines ?? []).map((l) => ({
        productId: l.productId ?? '',
        quantity: l.quantity ?? 0,
        unitCostCents: l.unitCostCents ?? 0,
        batchNumber: l.batchNumber ?? null,
        expiryDate: l.expiryDate ?? null,
      })),
    });
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapDomainError(e);
  }
}

export async function runOwnerPendingTransfersHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isStockTransfersEnabled(env)) return featureOff('FEATURE_STOCK_TRANSFERS');
  if (!env?.DB) return dbUnavailable();

  const pending = await env.DB.prepare(
    `SELECT id, from_branch_id, to_branch_id, status, shipped_at, created_by_user_id
     FROM stock_transfers
     WHERE tenant_id = ? AND status = 'IN_TRANSIT'
     ORDER BY shipped_at ASC`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      from_branch_id: string;
      to_branch_id: string;
      status: string;
      shipped_at: string | null;
      created_by_user_id: string;
    }>();

  const discrepancies = await env.DB.prepare(
    `SELECT t.id AS transfer_id, l.id AS line_id, l.product_id, l.qty_sent,
            l.qty_received, l.qty_shrink, l.shrink_reason
     FROM stock_transfer_lines l
     JOIN stock_transfers t ON t.id = l.transfer_id AND t.tenant_id = l.tenant_id
     WHERE l.tenant_id = ? AND t.status = 'RECEIVED' AND l.qty_shrink > 0
     ORDER BY t.received_at DESC
     LIMIT 50`,
  )
    .bind(tenantId)
    .all<{
      transfer_id: string;
      line_id: string;
      product_id: string;
      qty_sent: number;
      qty_received: number;
      qty_shrink: number;
      shrink_reason: string | null;
    }>();

  return {
    status: 200,
    body: {
      pending: pending.results ?? [],
      discrepancies: discrepancies.results ?? [],
    },
  };
}
