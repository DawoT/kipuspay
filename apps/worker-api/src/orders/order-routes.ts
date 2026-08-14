/**
 * Comandas / KDS / split — Sprint 19.
 * FEATURE_ORDERS_KDS default off. Precio servidor (regla 1). Split → sales ACID.
 */
import {
  assertOrderTransition,
  planMarkItemsReady,
  planOrderReadyAggregation,
  type OrderItemStatus,
  type OrderStatus,
} from '@kipuspay/domain-sales';
import {
  cancelOrderItemAtomic,
  processOrderBillingAtomic,
} from '@kipuspay/adapters-d1/process-order-billing-atomic';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  branchKdsHubName,
  KDS_WS_TICKET_TTL_SECONDS,
  kdsWsTicketKvKey,
  parseKdsWsTicketPayload,
  type KdsBroadcastEvent,
  type KdsEventType,
} from './kds-hub-helpers.js';

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

/**
 * S19-H1: notifica al KDS y devuelve el resultado real del broadcast
 * (listeners y entregas). El caller refleja `kdsVisible` con datos, no un
 * hardcode.
 */
async function notifyKds(
  env: WorkerEnv,
  tenantId: string,
  branchId: string,
  event: Omit<KdsBroadcastEvent, 'tenantId' | 'branchId' | 'serverNowMs'>,
): Promise<{ listeners: number; delivered: number }> {
  const hub = env.BRANCH_KDS_HUB_DO;
  if (!hub) return { listeners: 0, delivered: 0 };
  const id = hub.idFromName(branchKdsHubName(tenantId, branchId));
  const stub = hub.get(id);
  const body: KdsBroadcastEvent = {
    ...event,
    tenantId,
    branchId,
    serverNowMs: Date.now(),
  };
  const res = await stub.fetch('https://kds.internal/broadcast', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // S1: canal interno worker→DO con token compartido (fail-closed en el DO).
      ...(env.KDS_BROADCAST_TOKEN ? { 'x-kds-token': env.KDS_BROADCAST_TOKEN } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = (await res.json().catch(() => null)) as {
    listeners?: number;
    delivered?: number;
  } | null;
  return { listeners: result?.listeners ?? 0, delivered: result?.delivered ?? 0 };
}

async function resolveProductPriceCents(
  env: WorkerEnv,
  tenantId: string,
  productId: string,
): Promise<{ name: string; priceCents: number } | null> {
  const row = await env
    .DB!.prepare(
      `SELECT name, price_cents FROM products
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(productId, tenantId)
    .first<{ name: string; price_cents: number }>();
  if (!row) return null;
  return { name: row.name, priceCents: row.price_cents };
}

/* eslint-disable complexity -- HTTP create: feature/DB/items/catalog loop */
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

  const resolved: { productId: string; name: string; qty: number; priceCents: number }[] = [];
  for (const it of items) {
    const productId = it.productId?.trim() ?? '';
    if (!productId) {
      return { status: 422, body: { error: 'PRODUCT_REQUIRED', code: 'PRODUCT_REQUIRED' } };
    }
    const catalog = await resolveProductPriceCents(env, tenantId, productId);
    if (!catalog) {
      return { status: 422, body: { error: 'PRODUCT_NOT_FOUND', code: 'PRODUCT_NOT_FOUND' } };
    }
    // Ignora unitPriceCents del cliente (regla 1 Zero-Trust).
    resolved.push({
      productId,
      name: catalog.name,
      qty: it.quantity ?? 0,
      priceCents: catalog.priceCents,
    });
  }

  const orderId = crypto.randomUUID();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO orders (
           id, tenant_id, branch_id, table_label, status, opened_by_user_id
         ) VALUES (?, ?, ?, ?, 'OPEN', ?)`,
    ).bind(orderId, tenantId, branchId, body.tableLabel ?? null, userId),
    ...resolved.map((it) =>
      env
        .DB!.prepare(
          `INSERT INTO order_items (
             id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          orderId,
          it.productId,
          it.name,
          it.qty,
          Math.round(it.qty * 1000000),
          it.priceCents,
        ),
    ),
  ];
  await env.DB.batch(stmts);
  return { status: 200, body: { id: orderId, status: 'OPEN', itemCount: resolved.length } };
}
/* eslint-enable complexity */

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
    `SELECT status, branch_id FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(orderId, tenantId)
    .first<{ status: OrderStatus; branch_id: string }>();
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

  const firedAtMs = Date.now();
  const kds = await notifyKds(env, tenantId, order.branch_id, {
    type: 'ITEM_FIRED' satisfies KdsEventType,
    orderId,
    firedAtMs,
  });

  return {
    status: 200,
    body: { id: orderId, status: 'FIRED', firedAtMs, kdsVisible: kds.listeners > 0 },
  };
}

/* eslint-disable complexity -- HTTP ready: load items + aggregate order */
export async function runMarkItemsReadyHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { orderId?: string; orderItemIds?: readonly string[] },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const orderId = body.orderId?.trim() ?? '';
  if (!orderId) return { status: 400, body: { error: 'orderId required', code: 'BAD_REQUEST' } };

  const order = await env.DB.prepare(
    `SELECT status, branch_id FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1`,
  )
    .bind(orderId, tenantId)
    .first<{ status: OrderStatus; branch_id: string }>();
  if (!order) return { status: 404, body: { error: 'Order not found', code: 'NOT_FOUND' } };

  const itemsRes = await env.DB.prepare(
    `SELECT id, status FROM order_items WHERE order_id = ? AND tenant_id = ?`,
  )
    .bind(orderId, tenantId)
    .all<{ id: string; status: OrderItemStatus }>();
  const items = itemsRes.results ?? [];
  const targetIds = new Set(
    body.orderItemIds ?? items.filter((i) => i.status === 'FIRED').map((i) => i.id),
  );
  const toReady = items.filter((i) => targetIds.has(i.id));

  try {
    planMarkItemsReady(toReady);
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'ORDER_ITEM_INVALID' },
    };
  }

  const stmts = toReady.map((i) =>
    env
      .DB!.prepare(
        `UPDATE order_items SET status = 'READY' WHERE id = ? AND tenant_id = ? AND status = 'FIRED'`,
      )
      .bind(i.id, tenantId),
  );

  const nextStatuses = items.map((i) => (targetIds.has(i.id) ? ('READY' as const) : i.status));
  const orderNext = planOrderReadyAggregation({
    orderStatus: order.status,
    itemStatuses: nextStatuses,
  });
  if (orderNext === 'READY') {
    stmts.push(
      env.DB.prepare(`UPDATE orders SET status = 'READY' WHERE id = ? AND tenant_id = ?`).bind(
        orderId,
        tenantId,
      ),
    );
  }

  await env.DB.batch(stmts);
  const firedAtMs = Date.now();
  for (const i of toReady) {
    await notifyKds(env, tenantId, order.branch_id, {
      type: 'ITEM_READY',
      orderId,
      orderItemId: i.id,
      firedAtMs,
    });
  }
  if (orderNext === 'READY') {
    await notifyKds(env, tenantId, order.branch_id, {
      type: 'ORDER_READY',
      orderId,
      firedAtMs,
    });
  }

  return {
    status: 200,
    body: {
      id: orderId,
      itemReadyCount: toReady.length,
      orderStatus: orderNext ?? order.status,
    },
  };
}
/* eslint-enable complexity */

export async function runCancelOrderItemHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    orderItemId?: string;
    authorizedCancelBy?: string | null;
    authTokenHash?: string | null;
  },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const itemId = body.orderItemId?.trim() ?? '';
  if (!itemId) return { status: 400, body: { error: 'orderItemId required', code: 'BAD_REQUEST' } };

  try {
    const res = await cancelOrderItemAtomic(env.DB, tenantId, userId, {
      orderItemId: itemId,
      authTokenHash: body.authTokenHash ?? null,
      authorizedByUserId: body.authorizedCancelBy ?? null,
    });

    const meta = await env.DB.prepare(
      `SELECT oi.order_id, o.branch_id FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
       WHERE oi.id = ? AND oi.tenant_id = ? LIMIT 1`,
    )
      .bind(itemId, tenantId)
      .first<{ order_id: string; branch_id: string }>();
    if (meta) {
      await notifyKds(env, tenantId, meta.branch_id, {
        type: 'ITEM_CANCELLED',
        orderId: meta.order_id,
        orderItemId: itemId,
        firedAtMs: Date.now(),
      });
    }

    return { status: 200, body: { id: res.id, status: res.status } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      msg === 'AUTH_TOKEN_REQUIRED' || msg === 'AUTH_TOKEN_INVALID'
        ? 403
        : msg === 'ORDER_ITEM_NOT_FOUND'
          ? 404
          : 422;
    return { status, body: { error: msg, code: msg } };
  }
}

/* eslint-disable complexity -- HTTP split: session/series + billing adapter errors */
export async function runSplitBillHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    orderId?: string;
    cashRegisterSessionId?: string;
    series?: string;
    paymentMethodId?: string;
    portions?: readonly { saleId?: string; itemIds?: readonly string[] }[];
    clientName?: string;
    /** S19-H2: 'NV' (control interno) | '03' (boleta). Default NV. */
    documentType?: 'NV' | '03';
  },
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!env?.DB) return dbUnavailable();
  const orderId = body.orderId?.trim() ?? '';
  if (!orderId) return { status: 400, body: { error: 'orderId required', code: 'BAD_REQUEST' } };
  if (
    !body.cashRegisterSessionId?.trim() ||
    !body.series?.trim() ||
    !body.paymentMethodId?.trim()
  ) {
    return {
      status: 400,
      body: {
        error: 'cashRegisterSessionId, series, paymentMethodId required',
        code: 'BAD_REQUEST',
      },
    };
  }

  try {
    const result = await processOrderBillingAtomic(env.DB, tenantId, userId, {
      orderId,
      cashRegisterSessionId: body.cashRegisterSessionId,
      series: body.series,
      paymentMethodId: body.paymentMethodId,
      ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
      // S19-H2: documento según modo — '03' boleta / 'NV' control interno.
      ...(body.documentType === '03' || body.documentType === 'NV'
        ? { documentType: body.documentType }
        : {}),
      portions: (body.portions ?? []).map((p) => ({
        saleId: p.saleId ?? crypto.randomUUID(),
        itemIds: p.itemIds ?? [],
      })),
    });
    return {
      status: 200,
      body: {
        orderId: result.orderId,
        orderStatus: result.orderStatus,
        portions: result.sales.map((s) => ({
          saleId: s.saleId,
          itemIds: [...s.itemIds],
          amountCents: s.amountCents,
        })),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'ORDER_NOT_FOUND' ? 404 : 422;
    return { status, body: { error: msg, code: msg } };
  }
}
/* eslint-enable complexity */

/** WebSocket upgrade → BranchKdsHub (ADR-0013). Auth por ticket one-shot (el browser no setea Bearer en WS). */
export async function runKdsWebSocketHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
  request: Request,
): Promise<Response> {
  if (!isOrdersKdsEnabled(env)) {
    return Response.json({ error: 'FEATURE_ORDERS_KDS off', code: 'FEATURE_OFF' }, { status: 404 });
  }
  if (!branchId.trim()) {
    return Response.json({ error: 'branchId required', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const hub = env?.BRANCH_KDS_HUB_DO;
  if (!hub) {
    return Response.json(
      { error: 'KDS hub unavailable', code: 'KDS_UNAVAILABLE' },
      { status: 503 },
    );
  }
  const id = hub.idFromName(branchKdsHubName(tenantId, branchId));
  return hub.get(id).fetch(request);
}

export interface KdsTicketKv {
  get(key: string): Promise<string | null>;
  put?(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export async function runMintKdsWsTicketHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
): Promise<HttpResult> {
  if (!isOrdersKdsEnabled(env)) return featureOff('FEATURE_ORDERS_KDS');
  if (!tenantId.trim() || !branchId.trim()) {
    return { status: 400, body: { error: 'branchId required', code: 'BAD_REQUEST' } };
  }
  const kv = env?.TENANT_KV as KdsTicketKv | undefined;
  if (!kv?.put) {
    return { status: 503, body: { error: 'Ticket store unavailable', code: 'KDS_TICKET_UNAVAILABLE' } };
  }
  const ticket = crypto.randomUUID();
  const exp = Date.now() + KDS_WS_TICKET_TTL_SECONDS * 1000;
  await kv.put(
    kdsWsTicketKvKey(ticket),
    JSON.stringify({ tenantId, branchId, exp }),
    { expirationTtl: KDS_WS_TICKET_TTL_SECONDS },
  );
  return { status: 200, body: { ticket, expiresInSeconds: KDS_WS_TICKET_TTL_SECONDS } };
}

export async function consumeKdsWsTicket(
  kv: KdsTicketKv | undefined,
  ticket: string,
  nowMs: number,
): Promise<{ tenantId: string; branchId: string } | null> {
  if (!ticket.trim() || !kv?.get) return null;
  const key = kdsWsTicketKvKey(ticket);
  const raw = await kv.get(key);
  const payload = parseKdsWsTicketPayload(raw, nowMs);
  if (!payload) return null;
  await kv.delete?.(key);
  return { tenantId: payload.tenantId, branchId: payload.branchId };
}
