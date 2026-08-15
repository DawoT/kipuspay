/**
 * Stripe Billing (cancel + Customer Portal) vía fetch — ADR-0005 (cero SDK).
 * Fuera del hot path de cobro/emisión.
 */
export type FetchLike = typeof fetch;

export interface StripeSubscriptionList {
  readonly data?: ReadonlyArray<{ readonly id?: string; readonly status?: string }>;
}

export async function listStripeSubscriptions(
  customerId: string,
  opts: { readonly apiKey: string; readonly fetchImpl?: FetchLike; readonly apiBase?: string },
): Promise<StripeSubscriptionList> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const res = await fetchImpl(
    `${base}/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
    { headers: { Authorization: `Bearer ${opts.apiKey}` } },
  );
  if (!res.ok) return { data: [] };
  return await res.json();
}

export async function cancelStripeSubscription(
  subscriptionId: string,
  opts: { readonly apiKey: string; readonly fetchImpl?: FetchLike; readonly apiBase?: string },
): Promise<{ ok: boolean; status: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const res = await fetchImpl(`${base}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'prorate=true',
  });
  return { ok: res.ok, status: res.status };
}

export async function createStripeBillingPortalSession(
  customerId: string,
  returnUrl: string,
  opts: { readonly apiKey: string; readonly fetchImpl?: FetchLike; readonly apiBase?: string },
): Promise<{ url?: string; status: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const body = new URLSearchParams({ customer: customerId, return_url: returnUrl });
  const res = await fetchImpl(`${base}/v1/billing_portal/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string };
  return { status: res.status, ...(typeof json.url === 'string' ? { url: json.url } : {}) };
}

export async function createStripeCustomer(
  params: { readonly name: string; readonly tenantId: string },
  opts: { readonly apiKey: string; readonly fetchImpl?: FetchLike; readonly apiBase?: string },
): Promise<{ id?: string; status: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const body = new URLSearchParams({
    name: params.name,
    'metadata[tenant_id]': params.tenantId,
  });
  const res = await fetchImpl(`${base}/v1/customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { status: res.status, ...(typeof json.id === 'string' ? { id: json.id } : {}) };
}

export async function createStripeCheckoutSession(
  params: {
    readonly customerId: string;
    readonly priceId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly tenantId: string;
  },
  opts: { readonly apiKey: string; readonly fetchImpl?: FetchLike; readonly apiBase?: string },
): Promise<{ url?: string; status: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const body = new URLSearchParams({
    mode: 'subscription',
    customer: params.customerId,
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    'metadata[tenant_id]': params.tenantId,
    client_reference_id: params.tenantId,
  });
  const res = await fetchImpl(`${base}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string };
  return { status: res.status, ...(typeof json.url === 'string' ? { url: json.url } : {}) };
}

/** V-03: return URLs de Checkout solo https. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function persistStripeCustomerBestEffort(
  env: { readonly DB?: D1Database; readonly STRIPE_SECRET_KEY?: string },
  tenantId: string,
  tradeName: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const apiKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!apiKey || !env.DB || !tenantId) return;
  try {
    const existing = await env.DB.prepare(
      'SELECT stripe_customer_id FROM tenants WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(tenantId)
      .first<{ stripe_customer_id?: string | null }>();
    if (existing?.stripe_customer_id?.trim()) return;
    const created = await createStripeCustomer(
      { name: tradeName, tenantId },
      { apiKey, fetchImpl },
    );
    if (!created.id) return;
    await env.DB.prepare('UPDATE tenants SET stripe_customer_id = ? WHERE id = ?')
      .bind(created.id, tenantId)
      .run();
  } catch {
    // Best-effort: el trial no debe fallar si Stripe no responde.
  }
}
