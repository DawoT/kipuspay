/**
 * Comandas / KDS / split — Sprint 19 (domain + HTTP thin).
 * FEATURE_ORDERS_KDS default off.
 */
import {
  assertItemCancelAuthorized,
  assertOrderItemTransition,
  assertOrderTransition,
  planSplitBill,
  type OrderItemStatus,
  type OrderStatus,
} from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isOrdersKdsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_ORDERS_KDS === '1' || env?.FEATURE_ORDERS_KDS === 'true';
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

export async function runCreateOrderHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    tableLabel?: string | null;
    items?: readonly {
      productId?: string;
      productName?: string;
      quantity?: number;
      unitPriceCents?: number;
    }[];
  },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const branchId = body.branchId?.trim() ?? '';
  if (!branchId) return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  const items = body.items ?? [];
  if (items.length === 0) {
    return { status: 422, body: { error: 'ORDER_REQUIRES_ITEMS', code: 'ORDER_REQUIRES_ITEMS' } };
  }

  const orderId = crypto.randomUUID();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO orders (
           id, tenant_id, branch_id, table_label, status, opened_by_user_id
         ) VALUES (?, ?, ?, ?, 'OPEN', ?)`,
    ).bind(orderId, tenantId, branchId, body.tableLabel ?? null, userId),
    ...items.map((it) =>
      env
        .DB!.prepare(
          `INSERT INTO order_items (
             id, tenant_id, order_id, product_id, product_name, quantity, unit_price_cents, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          orderId,
          it.productId ?? '',
          it.productName ?? '',
          it.quantity ?? 0,
          it.unitPriceCents ?? 0,
        ),
    ),
  ];
  await env.DB.batch(stmts);
  return { status: 200, body: { id: orderId, status: 'OPEN', itemCount: items.length } };
}

export async function runFireOrderHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { orderId?: string },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const orderId = body.orderId?.trim() ?? '';
  if (!orderId) return { status: 400, body: { error: 'orderId required', code: 'BAD_REQUEST' } };

  const order = await env.DB.prepare(
    `SELECT status FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(orderId, tenantId)
    .first<{ status: OrderStatus }>();
  if (!order) return { status: 404, body: { error: 'Order not found', code: 'NOT_FOUND' } };
  try {
    assertOrderTransition(order.status, 'FIRED');
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'ORDER_INVALID' },
    };
  }

  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = 'FIRED' WHERE id = ? AND tenant_id = ?`).bind(
      orderId,
      tenantId,
    ),
    env.DB.prepare(
      `UPDATE order_items SET status = 'FIRED'
       WHERE order_id = ? AND tenant_id = ? AND status = 'PENDING'`,
    ).bind(orderId, tenantId),
  ]);

  const firedAt = Date.now();
  return {
    status: 200,
    body: { id: orderId, status: 'FIRED', firedAtMs: firedAt, kdsVisible: true },
  };
}

export async function runCancelOrderItemHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    orderItemId?: string;
    authorizedCancelBy?: string | null;
  },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const itemId = body.orderItemId?.trim() ?? '';
  if (!itemId) return { status: 400, body: { error: 'orderItemId required', code: 'BAD_REQUEST' } };

  const item = await env.DB.prepare(
    `SELECT status FROM order_items WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(itemId, tenantId)
    .first<{ status: OrderItemStatus }>();
  if (!item) return { status: 404, body: { error: 'Item not found', code: 'NOT_FOUND' } };

  try {
    assertItemCancelAuthorized(item.status, body.authorizedCancelBy ?? null);
    assertOrderItemTransition(item.status, 'CANCELLED');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'AUTH_TOKEN_REQUIRED' ? 403 : 422;
    return { status, body: { error: msg, code: msg } };
  }

  await env.DB.prepare(
    `UPDATE order_items SET status = 'CANCELLED', authorized_by_user_id = ?
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(body.authorizedCancelBy ?? null, itemId, tenantId)
    .run();

  return { status: 200, body: { id: itemId, status: 'CANCELLED' } };
}

export async function runSplitBillHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    orderId?: string;
    portions?: readonly { saleId?: string; itemIds?: readonly string[] }[];
  },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const orderId = body.orderId?.trim() ?? '';
  if (!orderId) return { status: 400, body: { error: 'orderId required', code: 'BAD_REQUEST' } };

  const order = await env.DB.prepare(
    `SELECT status FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(orderId, tenantId)
    .first<{ status: OrderStatus }>();
  if (!order) return { status: 404, body: { error: 'Order not found', code: 'NOT_FOUND' } };

  const items = await env.DB.prepare(
    `SELECT id, unit_price_cents, quantity, status
     FROM order_items WHERE order_id = ? AND tenant_id = ? AND status != 'CANCELLED'`,
  )
    .bind(orderId, tenantId)
    .all<{ id: string; unit_price_cents: number; quantity: number; status: string }>();

  const rows = items.results ?? [];
  const amountCentsByItem = new Map(
    rows.map((r) => [r.id, Math.round(r.unit_price_cents * r.quantity)]),
  );

  try {
    const portions = planSplitBill({
      orderId,
      orderStatus: order.status,
      itemIds: rows.map((r) => r.id),
      portions: (body.portions ?? []).map((p) => ({
        saleId: p.saleId ?? '',
        itemIds: p.itemIds ?? [],
      })),
      amountCentsByItem,
    });
    return {
      status: 200,
      body: {
        orderId,
        portions: portions.map((p) => ({
          saleId: p.saleId,
          itemIds: [...p.itemIds],
          amountCents: p.amountCents,
        })),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { error: msg, code: msg } };
  }
}
