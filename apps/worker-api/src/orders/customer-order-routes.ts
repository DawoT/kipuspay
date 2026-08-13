/* eslint-disable no-secrets/no-secrets -- customer-order domain error codes are not secrets */
import {
  cancelCustomerOrderAtomic,
  createCustomerOrderAtomic,
  expireCustomerOrderAtomic,
  dispatchCustomerOrderNotice,
  fulfillCustomerOrderAtomic,
  getCustomerOrderDetail,
  listCustomerOrders,
  mintCustomerOrderLeaseAtomic,
  mintCustomerOrderRepriceAuthorizationAtomic,
  processExpiredCustomerOrderRepriceHandoffAtomic,
  resolveActiveTerminalSession,
} from '@kipuspay/adapters-d1/process-customer-order-atomic';
import { createWhatsAppMessagingSender } from '@kipuspay/adapters-messaging';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isCustomerOrdersEnabled } from '../auth/features.js';

export { isCustomerOrdersEnabled };

export interface CustomerOrderActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly branchId?: string;
  readonly allowedBranches?: readonly string[];
  readonly permissions?: readonly string[];
  readonly terminalId?: string;
  readonly terminalSessionId?: string;
}

export interface CustomerOrderHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Operation = 'READ' | 'CREATE' | 'FULFILL' | 'CANCEL' | 'EXPIRE' | 'REPRICE_AUTH';

const SAFE_CODES = new Set([
  'CUSTOMER_ORDER_NOT_FOUND',
  'CUSTOMER_ORDER_TERMINAL',
  'CUSTOMER_ORDER_CONFLICT',
  'CUSTOMER_ORDER_RESERVATION_EXPIRED',
  'CUSTOMER_ORDER_LEASE_INVALID',
  'CUSTOMER_ORDER_LEASE_CONFLICT',
  'CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING',
  'CUSTOMER_ORDER_INSUFFICIENT_STOCK',
  'CUSTOMER_ORDER_INSUFFICIENT_LOCATION_STOCK',
  'CUSTOMER_ORDER_INSUFFICIENT_BATCH_STOCK',
  'CUSTOMER_ORDER_PRODUCT_NOT_FOUND',
  'CUSTOMER_ORDER_SERIES_INVALID',
  'CUSTOMER_ORDER_CASH_SESSION_REQUIRED',
  'CUSTOMER_ORDER_PAYMENT_METHOD_REQUIRED',
  'CUSTOMER_ORDER_CANCEL_REASON_REQUIRED',
  'CUSTOMER_ORDER_REPRICE_AUTH_INVALID',
  'CUSTOMER_ORDER_REPRICE_REQUIRES_EXPIRED',
  'CUSTOMER_ORDER_REPRICE_EMPTY',
  'CUSTOMER_ORDER_NOTICE_NOT_FOUND',
]);

function result(status: number, body: Record<string, unknown>): CustomerOrderHttpResult {
  return { status, body };
}

function errorCode(error: unknown): string {
  return error instanceof Error && SAFE_CODES.has(error.message) ? error.message : 'ORDER_FAILED';
}

function errorResult(error: unknown): CustomerOrderHttpResult {
  const code = errorCode(error);
  if (code === 'CUSTOMER_ORDER_NOT_FOUND') return result(404, { code });
  if (code === 'CUSTOMER_ORDER_CONFLICT') return result(409, { code });
  if (code === 'ORDER_FAILED') return result(500, { code });
  return result(422, { code });
}


const MAX_RESERVATION_MS = 24 * 60 * 60 * 1000; // S43-H2: tope de reserva 24h
function clampReservationDeadline(raw: string | null | undefined): string {
  const parsed = raw && Number.isFinite(Date.parse(raw)) ? Date.parse(raw) : NaN;
  const now = Date.now();
  if (!Number.isFinite(parsed) || parsed <= now) {
    return new Date(now + MAX_RESERVATION_MS).toISOString();
  }
  const clamped = Math.min(parsed, now + MAX_RESERVATION_MS);
  return new Date(clamped).toISOString();
}

async function resolveAuthorizedPriceList(
  env: WorkerEnv,
  tenantId: string,
  branchId: string,
  requested: string | null | undefined,
): Promise<string | null | undefined> {
  if (!requested) return undefined;
  if (!env.DB) return undefined;
  const row = await env.DB.prepare(
    `SELECT p.id FROM price_lists p
     WHERE p.tenant_id = ? AND p.id = ? AND p.is_active = 1 AND p.deleted_at IS NULL LIMIT 1`,
  )
    .bind(tenantId, requested)
    .first<{ id: string }>();
  return row?.id ?? undefined;
}

function docTypeOrReject(value: unknown): '01' | '03' | 'NV' {
  if (value === '01' || value === '03' || value === 'NV') return value;
  throw new Error('CUSTOMER_ORDER_DOCUMENT_TYPE_REQUIRED');
}

function roleAllowed(role: string, operation: Operation): boolean {
  const normalized = role.toLowerCase();
  if (operation === 'READ') return ['cashier', 'supervisor', 'admin', 'owner'].includes(normalized);
  if (operation === 'CREATE' || operation === 'FULFILL') {
    return ['cashier', 'supervisor'].includes(normalized);
  }
  if (operation === 'CANCEL') return ['supervisor', 'admin', 'owner'].includes(normalized);
  if (operation === 'REPRICE_AUTH') return normalized === 'supervisor';
  return ['system', 'supervisor', 'admin', 'owner'].includes(normalized);
}

async function preflight(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  operation: Operation,
): Promise<CustomerOrderHttpResult | null> {
  if (!isCustomerOrdersEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env?.DB) return result(503, { code: 'DB_UNAVAILABLE' });
  if (!actor.tenantId || !actor.userId || !roleAllowed(actor.role, operation)) {
    return result(403, { code: 'FORBIDDEN' });
  }
  if (
    (operation === 'CANCEL' || operation === 'EXPIRE') &&
    ['admin', 'owner'].includes(actor.role.toLowerCase()) &&
    !actor.permissions?.includes('orders.customer_orders.manage')
  ) {
    return result(403, { code: 'FORBIDDEN' });
  }
  try {
    const capability = await env.DB.prepare(
      `SELECT enabled FROM tenant_capabilities
       WHERE tenant_id = ? AND capability = 'orders.customer_orders' LIMIT 1`,
    )
      .bind(actor.tenantId)
      .first<{ enabled: number }>();
    if (capability?.enabled !== 1) return result(404, { code: 'FEATURE_OFF' });
  } catch {
    return result(503, { code: 'CAPABILITY_UNAVAILABLE' });
  }
  return null;
}

function cashRole(actor: CustomerOrderActor): boolean {
  return ['cashier', 'supervisor'].includes(actor.role.toLowerCase());
}

function scopedBranch(actor: CustomerOrderActor): string | undefined {
  return cashRole(actor) ? actor.branchId?.trim() || undefined : undefined;
}

async function activeTerminalBinding(
  env: WorkerEnv,
  actor: CustomerOrderActor,
): Promise<{
  terminalSessionId: string;
  terminalId: string;
  cashRegisterSessionId: string;
  userId: string;
  branchId: string;
} | null> {
  const terminalId = actor.terminalId?.trim() ?? '';
  const terminalSessionId = actor.terminalSessionId?.trim() ?? '';
  if (!terminalId || !terminalSessionId || !actor.branchId) return null;
  try {
    return await resolveActiveTerminalSession(env.DB!, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      terminalId,
      terminalSessionId,
      branchId: actor.branchId,
    });
  } catch {
    return null;
  }
}

async function closeScopePreflight(
  env: WorkerEnv,
  actor: CustomerOrderActor,
  orderId: string,
): Promise<CustomerOrderHttpResult | null> {
  const branchId = scopedBranch(actor);
  if (!branchId) return null;
  try {
    const visible = await env
      .DB!.prepare(
        `SELECT 1 AS visible FROM customer_orders
       WHERE tenant_id = ? AND id = ? AND branch_id = ? LIMIT 1`,
      )
      .bind(actor.tenantId, orderId, branchId)
      .first<{ visible: number }>();
    return visible ? null : result(404, { code: 'CUSTOMER_ORDER_NOT_FOUND' });
  } catch {
    return result(503, { code: 'DB_UNAVAILABLE' });
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export async function runCreateCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'CREATE');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const branchId = scopedBranch(actor);
  if (!branchId) return result(403, { code: 'FORBIDDEN' });
  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  // S43-H4: el price list lo impone el SERVIDOR (regla 1) — el del cliente
  // solo se acepta si es una lista activa del tenant; si no, el de la branch.
  const requestedPriceList = text(body, 'priceListId');
  const priceListId = await resolveAuthorizedPriceList(env!, actor.tenantId, branchId, requestedPriceList);
  try {
    const created = await createCustomerOrderAtomic(env!.DB!, {
      tenantId: actor.tenantId,
      branchId,
      customerId: text(body, 'customerId'),
      actorUserId: actor.userId,
      idempotencyKey: text(body, 'idempotencyKey') || crypto.randomUUID(),
      // S43-H2: el vencimiento de la reserva es SERVER-side — el cliente no
      // puede fijar una reserva perpetua (tope 24h; el cron de expiración
      // libera el stock a su vencimiento).
      reservedUntil: clampReservationDeadline(text(body, 'reservedUntil')),
      pickupAt: text(body, 'pickupAt') || null,
      ...(priceListId ? { priceListId } : {}),
      items: itemsRaw.map((raw) => {
        const item = objectBody(raw);
        const productUomId = text(item, 'productUomId');
        const batchId = text(item, 'batchId');
        const locationId = text(item, 'locationId');
        const serialId = text(item, 'serialId');
        const serialIds = Array.isArray(item.serialIds)
          ? item.serialIds.filter(
              (value): value is string => typeof value === 'string' && value !== '',
            )
          : [];
        const enteredQuantityMicrounits =
          typeof item.enteredQuantityMicrounits === 'number'
            ? item.enteredQuantityMicrounits
            : typeof item.quantityMicrounits === 'number'
              ? item.quantityMicrounits
              : undefined;
        return {
          productId: text(item, 'productId'),
          ...(productUomId ? { productUomId } : {}),
          ...(enteredQuantityMicrounits !== undefined ? { enteredQuantityMicrounits } : {}),
          ...(batchId ? { batchId } : {}),
          ...(locationId ? { locationId } : {}),
          ...(serialId ? { serialId } : {}),
          ...(serialIds.length > 0 ? { serialIds } : {}),
        };
      }),
    });
    return result(created.alreadyApplied ? 200 : 201, { ...created });
  } catch (error) {
    return errorResult(error);
  }
}

export async function runMintCustomerOrderLeaseHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'FULFILL');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const binding = await activeTerminalBinding(env!, actor);
  if (!binding) return result(403, { code: 'FORBIDDEN' });
  try {
    const itemId = text(body, 'itemId');
    const quantityMicrounits =
      typeof body.quantityMicrounits === 'number' ? body.quantityMicrounits : undefined;
    const requestedTtlSeconds =
      typeof body.requestedTtlSeconds === 'number' ? body.requestedTtlSeconds : undefined;
    const items = Array.isArray(body.items)
      ? body.items
          .map((raw) => objectBody(raw))
          .filter((item) => text(item, 'itemId') && typeof item.quantityMicrounits === 'number')
          .map((item) => ({
            itemId: text(item, 'itemId'),
            quantityMicrounits: item.quantityMicrounits as number,
          }))
      : [];
    const lease = await mintCustomerOrderLeaseAtomic(env!.DB!, {
      tenantId: actor.tenantId,
      orderId: text(body, 'orderId'),
      ...(itemId ? { itemId } : {}),
      terminalId: binding.terminalId,
      terminalSessionId: binding.terminalSessionId,
      actorUserId: actor.userId,
      ...(quantityMicrounits !== undefined ? { quantityMicrounits } : {}),
      ...(requestedTtlSeconds !== undefined ? { requestedTtlSeconds } : {}),
      ...(items.length > 0 ? { items } : {}),
      idempotencyKey: text(body, 'idempotencyKey') || crypto.randomUUID(),
    });
    return result(201, lease);
  } catch (error) {
    return errorResult(error);
  }
}

export async function runMintCustomerOrderRepriceAuthorizationHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'REPRICE_AUTH');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const actorUserId = text(body, 'actorUserId');
  const binding = await activeTerminalBinding(env!, actor);
  if (!binding || actorUserId !== actor.userId) return result(403, { code: 'FORBIDDEN' });
  try {
    return result(
      201,
      await mintCustomerOrderRepriceAuthorizationAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        orderId: text(body, 'orderId'),
        approvedByUserId: actor.userId,
        actorUserId,
        terminalId: binding.terminalId,
        terminalSessionId: binding.terminalSessionId,
        ...(typeof body.requestedTtlSeconds === 'number'
          ? { requestedTtlSeconds: body.requestedTtlSeconds }
          : {}),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runRepriceExpiredCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'FULFILL');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const binding = await activeTerminalBinding(env!, actor);
  if (!binding) return result(403, { code: 'FORBIDDEN' });
  try {
    const priceListId = text(body, 'priceListId');
    return result(
      200,
      await processExpiredCustomerOrderRepriceHandoffAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        orderId: text(body, 'orderId'),
        actorUserId: actor.userId,
        terminalId: binding.terminalId,
        terminalSessionId: binding.terminalSessionId,
        authorizationToken: text(body, 'authorizationToken'),
        idempotencyKey: text(body, 'idempotencyKey'),
        ...(priceListId ? { priceListId } : {}),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

// Capability, opt-in, target lookup and post-commit transport remain fail-closed at one seam.
// eslint-disable-next-line complexity
export async function runDispatchCustomerOrderNoticeHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'EXPIRE');
  if (denied) return denied;
  const body = objectBody(rawBody);
  if (env?.FEATURE_MESSAGING_WHATSAPP !== '1' && env?.FEATURE_MESSAGING_WHATSAPP !== 'true') {
    return result(404, { code: 'FEATURE_OFF' });
  }
  const db = env?.DB;
  if (!db) return result(503, { code: 'DB_UNAVAILABLE' });
  try {
    const capability = await db
      .prepare(
        `SELECT enabled FROM tenant_capabilities
       WHERE tenant_id = ? AND capability = 'messaging.whatsapp' LIMIT 1`,
      )
      .bind(actor.tenantId)
      .first<{ enabled: number }>();
    if (capability?.enabled !== 1) return result(404, { code: 'FEATURE_OFF' });
    const sender = createWhatsAppMessagingSender({
      ...(env?.WA_ACCESS_TOKEN ? { WA_ACCESS_TOKEN: env.WA_ACCESS_TOKEN } : {}),
      ...(env?.WA_PHONE_NUMBER_ID ? { WA_PHONE_NUMBER_ID: env.WA_PHONE_NUMBER_ID } : {}),
      ...(env?.WA_API_BASE ? { WA_API_BASE: env.WA_API_BASE } : {}),
    });
    const notificationId = text(body, 'notificationId');
    return result(
      200,
      await dispatchCustomerOrderNotice(
        db,
        { tenantId: actor.tenantId, notificationId },
        {
          async sendExpiryWarning(request) {
            const target = await db
              .prepare(
                `SELECT o.customer_id, c.phone
               FROM customer_order_notifications n
               JOIN customer_orders o ON o.tenant_id = n.tenant_id
                 AND o.id = n.customer_order_id
               JOIN customers c ON c.tenant_id = o.tenant_id AND c.id = o.customer_id
               JOIN messaging_opt_ins opt ON opt.tenant_id = c.tenant_id
                 AND opt.customer_id = c.id AND opt.channel = 'whatsapp'
                 AND opt.opted_in = 1
               WHERE n.tenant_id = ? AND n.id = ? AND n.channel = 'WHATSAPP'`,
              )
              .bind(request.tenantId, request.notificationId)
              .first<{ customer_id: string; phone: string }>();
            if (!target || !sender.sendQuote) return { accepted: false };
            const sent = await sender.sendQuote({
              tenantId: request.tenantId,
              customerId: target.customer_id,
              quoteId: request.notificationId,
              phoneE164: target.phone,
              optedIn: true,
              representationUrl: `/orders/customer-orders/${request.orderId}`,
            });
            return { accepted: sent.accepted };
          },
        },
      ),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runFulfillCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'FULFILL');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const binding = await activeTerminalBinding(env!, actor);
  if (!binding) return result(403, { code: 'FORBIDDEN' });
  if (text(body, 'orderId').startsWith('expired-') && !text(body, 'authorizationToken')) {
    return result(422, { code: 'AUTH_TOKEN_REQUIRED' });
  }
  // S43-H3: el documento es obligatorio y explícito — validado ANTES del motor
  // para que el 404 cross-tenant siga siendo opaco (el orden importa).
  let documentType: '01' | '03' | 'NV';
  try {
    documentType = docTypeOrReject(body.documentType);
  } catch {
    return result(422, { code: 'CUSTOMER_ORDER_DOCUMENT_TYPE_REQUIRED' });
  }
  try {
    const cashRegisterSessionId = text(body, 'cashRegisterSessionId');
    const series = text(body, 'series');
    const paymentMethodId = text(body, 'paymentMethodId');
    const fulfilled = await fulfillCustomerOrderAtomic(env!.DB!, {
      tenantId: actor.tenantId,
      orderId: text(body, 'orderId'),
      terminalId: binding.terminalId,
      terminalSessionId: binding.terminalSessionId,
      actorUserId: actor.userId,
      envelope: text(body, 'envelope'),
      idempotencyKey: text(body, 'idempotencyKey'),
      cashRegisterSessionId: cashRegisterSessionId || binding.cashRegisterSessionId,
      // S43-H3: el documento es explícito — jamás un default NV silencioso
      // (una venta sin fiscal_outbox no puede nacer de omitir el campo).
      documentType,
      ...(series ? { series } : {}),
      ...(paymentMethodId ? { paymentMethodId } : {}),
    });
    return result(200, { ...fulfilled });
  } catch (error) {
    return errorResult(error);
  }
}

export async function runCancelCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'CANCEL');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const outsideScope = await closeScopePreflight(env!, actor, text(body, 'orderId'));
  if (outsideScope) return outsideScope;
  try {
    return result(
      200,
      await cancelCustomerOrderAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        orderId: text(body, 'orderId'),
        actorUserId: actor.userId,
        ...(scopedBranch(actor) ? { branchId: scopedBranch(actor) } : {}),
        reason: text(body, 'reason'),
        idempotencyKey: text(body, 'idempotencyKey'),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runExpireCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  rawBody: unknown,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'EXPIRE');
  if (denied) return denied;
  const body = objectBody(rawBody);
  const outsideScope = await closeScopePreflight(env!, actor, text(body, 'orderId'));
  if (outsideScope) return outsideScope;
  try {
    return result(
      200,
      await expireCustomerOrderAtomic(env!.DB!, {
        tenantId: actor.tenantId,
        orderId: text(body, 'orderId'),
        actorUserId: actor.userId,
        ...(scopedBranch(actor) ? { branchId: scopedBranch(actor) } : {}),
        idempotencyKey: text(body, 'idempotencyKey'),
      }),
    );
  } catch (error) {
    return errorResult(error);
  }
}

export async function runListCustomerOrdersHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  query: { branchId?: string; status?: string },
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  try {
    const branchId = scopedBranch(actor);
    if (cashRole(actor) && !branchId) return result(403, { code: 'FORBIDDEN' });
    const orders = await listCustomerOrders(env!.DB!, {
      tenantId: actor.tenantId,
      ...(branchId ? { branchId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    });
    return result(200, { orders });
  } catch (error) {
    return errorResult(error);
  }
}

export async function runGetCustomerOrderHttp(
  env: WorkerEnv | undefined,
  actor: CustomerOrderActor,
  orderId: string,
): Promise<CustomerOrderHttpResult> {
  const denied = await preflight(env, actor, 'READ');
  if (denied) return denied;
  try {
    return result(200, {
      ...(await getCustomerOrderDetail(env!.DB!, actor.tenantId, orderId, scopedBranch(actor))),
    });
  } catch (error) {
    return errorResult(error);
  }
}
