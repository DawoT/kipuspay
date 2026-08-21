/**
 * Checkout Session self-serve (Arranque/Crece/Cadena). Enterprise no es self-serve.
 * Return URLs solo https (V-03).
 */
import type { WorkerEnv } from '../auth/control-plane.js';
import { configuracionUrl, httpsReturnOrEmpty } from './app-origin.js';
import {
  createStripeCheckoutSession,
  isHttpsUrl,
  persistStripeCustomerBestEffort,
} from './stripe-billing.js';

const ALLOWED_PLANS = new Set(['arranque', 'crece', 'cadena']);

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function priceIdForPlan(env: WorkerEnv, planId: string): string {
  if (planId === 'arranque') return env.STRIPE_PRICE_ARRANQUE?.trim() ?? '';
  if (planId === 'crece') return env.STRIPE_PRICE_CRECE?.trim() ?? '';
  if (planId === 'cadena') return env.STRIPE_PRICE_CADENA?.trim() ?? '';
  return '';
}

function checkoutOwnerAdminGate(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
): HttpResult | null {
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

function parseCheckoutBody(
  body: unknown,
  env: WorkerEnv | undefined,
): { planId: string; successUrl: string; cancelUrl: string } | HttpResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = body as Record<string, unknown>;
  const planId = typeof o.planId === 'string' ? o.planId.trim() : '';
  if (planId === 'enterprise') {
    return {
      status: 422,
      body: {
        error: 'Enterprise se contrata con el equipo comercial',
        code: 'ENTERPRISE_SALES_ASSISTED',
      },
    };
  }
  if (!ALLOWED_PLANS.has(planId)) {
    return { status: 422, body: { error: 'Invalid planId', code: 'INVALID_PLAN' } };
  }
  const successUrl = httpsReturnOrEmpty(
    typeof o.successUrl === 'string' ? o.successUrl : undefined,
    configuracionUrl(env, '?checkout=success'),
  );
  const cancelUrl = httpsReturnOrEmpty(
    typeof o.cancelUrl === 'string' ? o.cancelUrl : undefined,
    configuracionUrl(env, '?checkout=cancel'),
  );
  if (!isHttpsUrl(successUrl) || !isHttpsUrl(cancelUrl)) {
    return {
      status: 422,
      body: { error: 'Return URLs must be https', code: 'INVALID_RETURN_URL' },
    };
  }
  return { planId, successUrl, cancelUrl };
}

async function createCheckoutForTenant(
  env: WorkerEnv,
  tenantId: string,
  parsed: { planId: string; successUrl: string; cancelUrl: string },
  fetchImpl: typeof fetch,
): Promise<HttpResult> {
  const stripeKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const priceId = priceIdForPlan(env, parsed.planId);
  if (!stripeKey || !priceId) {
    return {
      status: 503,
      body: { error: 'Billing unavailable', code: 'STRIPE_PRICE_UNAVAILABLE' },
    };
  }
  const row = await env
    .DB!.prepare(
      'SELECT id, trade_name, stripe_customer_id FROM tenants WHERE id = ? AND deleted_at IS NULL',
    )
    .bind(tenantId)
    .first<{ id: string; trade_name?: string | null; stripe_customer_id?: string | null }>();
  if (!row) return { status: 404, body: { error: 'Not found', code: 'TENANT_NOT_FOUND' } };
  await persistStripeCustomerBestEffort(env, tenantId, row.trade_name ?? tenantId, fetchImpl);
  const refreshed = await env
    .DB!.prepare('SELECT stripe_customer_id FROM tenants WHERE id = ? AND deleted_at IS NULL')
    .bind(tenantId)
    .first<{ stripe_customer_id?: string | null }>();
  const customerId = refreshed?.stripe_customer_id?.trim() ?? '';
  if (!customerId) {
    return {
      status: 503,
      body: { error: 'Billing unavailable', code: 'STRIPE_CUSTOMER_UNAVAILABLE' },
    };
  }
  const session = await createStripeCheckoutSession(
    {
      customerId,
      priceId,
      successUrl: parsed.successUrl,
      cancelUrl: parsed.cancelUrl,
      tenantId,
    },
    { apiKey: stripeKey, fetchImpl },
  );
  if (!session.url) {
    return { status: 502, body: { error: 'Checkout unavailable', code: 'STRIPE_CHECKOUT_FAILED' } };
  }
  return { status: 200, body: { url: session.url } };
}

export async function runCheckoutSessionHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpResult> {
  const denied = checkoutOwnerAdminGate(env, tenantId, role);
  if (denied) return denied;
  const parsed = parseCheckoutBody(body, env);
  if ('status' in parsed) return parsed;
  try {
    return await createCheckoutForTenant(env!, tenantId, parsed, fetchImpl);
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}
