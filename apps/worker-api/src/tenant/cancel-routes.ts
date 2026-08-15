/**
 * S11-E11 — cancelación self-serve (Guía Legal Parte V §2 / GTM §5.10
 * "Cancela cuando quieras"): solo owner/admin; persiste 'canceled' en D1 y en
 * el snapshot de auth (KV tenant:{id}). Si hay Stripe customer, cancela las
 * suscripciones con prorrateo. La caja nunca se apaga por cancelar.
 */
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  cancelStripeSubscription,
  createStripeBillingPortalSession,
  listStripeSubscriptions,
} from './stripe-billing.js';

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function ownerAdminGate(env: WorkerEnv | undefined, tenantId: string, role: string): HttpResult | null {
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const normalizedRole = role.toLowerCase();
  if (normalizedRole !== 'owner' && normalizedRole !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  return null;
}

async function cancelStripeSubsForCustomer(
  customerId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<number> {
  let stripeCanceled = 0;
  const list = await listStripeSubscriptions(customerId, { apiKey, fetchImpl });
  for (const sub of list.data ?? []) {
    if (!sub.id || sub.status === 'canceled') continue;
    const result = await cancelStripeSubscription(sub.id, { apiKey, fetchImpl });
    if (result.ok) stripeCanceled += 1;
  }
  return stripeCanceled;
}

async function markTenantCanceledInKv(
  kv: NonNullable<WorkerEnv['TENANT_KV']>,
  tenantId: string,
): Promise<void> {
  if (!kv.get || !kv.put) return;
  try {
    const raw = await kv.get(`tenant:${tenantId}`);
    if (!raw) return;
    const tenant = JSON.parse(raw) as Record<string, unknown>;
    tenant.subscriptionStatus = 'canceled';
    await kv.put(`tenant:${tenantId}`, JSON.stringify(tenant));
  } catch {
    // Best-effort: el D1 ya quedó cancelado; el snapshot se re-lee al próximo auth.
  }
}

export async function runCancelTenantHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpResult> {
  const denied = ownerAdminGate(env, tenantId, role);
  if (denied) return denied;
  try {
    const row = await env!.DB!.prepare(
      'SELECT id, stripe_customer_id FROM tenants WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(tenantId)
      .first<{ id: string; stripe_customer_id?: string | null }>();
    if (!row) return { status: 404, body: { error: 'Not found', code: 'TENANT_NOT_FOUND' } };

    const stripeKey = env!.STRIPE_SECRET_KEY?.trim() ?? '';
    const customerId = row.stripe_customer_id?.trim() ?? '';
    const stripeCanceled =
      stripeKey && customerId
        ? await cancelStripeSubsForCustomer(customerId, stripeKey, fetchImpl)
        : 0;

    await env!.DB!.prepare("UPDATE tenants SET subscription_status = 'canceled' WHERE id = ?")
      .bind(tenantId)
      .run();

    if (env!.TENANT_KV) {
      await markTenantCanceledInKv(env!.TENANT_KV, tenantId);
    }
    return {
      status: 200,
      body: {
        canceled: true,
        stripeCanceled,
        message:
          'Cuenta cancelada. La caja sigue operando; exporta tu catálogo y ventas en CSV antes de retirarte.',
      },
    };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}

export async function runBillingPortalHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
  returnUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpResult> {
  const denied = ownerAdminGate(env, tenantId, role);
  if (denied) return denied;
  const stripeKey = env!.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!stripeKey) {
    return { status: 503, body: { error: 'Billing portal unavailable', code: 'STRIPE_UNAVAILABLE' } };
  }
  const row = await env!.DB!.prepare(
    'SELECT stripe_customer_id FROM tenants WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(tenantId)
    .first<{ stripe_customer_id?: string | null }>();
  const customerId = row?.stripe_customer_id?.trim() ?? '';
  if (!customerId) {
    return { status: 422, body: { error: 'Sin cliente de facturación', code: 'NO_STRIPE_CUSTOMER' } };
  }
  const safeReturn = returnUrl.startsWith('https://')
    ? returnUrl
    : 'https://app.kipuspay.com/admin/configuracion';
  const portal = await createStripeBillingPortalSession(customerId, safeReturn, {
    apiKey: stripeKey,
    fetchImpl,
  });
  if (!portal.url) {
    return { status: 502, body: { error: 'Portal no disponible', code: 'STRIPE_PORTAL_FAILED' } };
  }
  return { status: 200, body: { url: portal.url } };
}
