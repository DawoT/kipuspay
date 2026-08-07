/**
 * Stripe Metered Billing via fetch inyectable — ADR-0005 (cero stripe npm).
 * Solo cron/offline batch; jamás hot path de cobro.
 */

export type FetchLike = typeof fetch;

export interface MeteredOverageReport {
  readonly tenantId: string;
  readonly stripeCustomerId: string;
  readonly periodYm: string;
  readonly units: number;
  readonly idempotencyKey: string;
  readonly meterEventName?: string;
}

export interface MeteredOverageResult {
  readonly ok: boolean;
  readonly status: number;
  readonly idempotentReplay: boolean;
  readonly bodyText: string;
}

export class StripeMeterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeMeterConfigError';
  }
}

/**
 * Reporta unidades de sobregiro a Stripe Billing Meter Events API.
 * Fail-closed sin secret; idempotency via header Stripe-Idempotency-Key.
 */
export async function reportMeteredOverage(
  input: MeteredOverageReport,
  opts: {
    readonly apiKey: string | undefined;
    readonly fetchImpl?: FetchLike;
    readonly apiBase?: string;
  },
): Promise<MeteredOverageResult> {
  if (!opts.apiKey || opts.apiKey.trim() === '') {
    throw new StripeMeterConfigError('STRIPE_SECRET_KEY missing');
  }
  if (input.units <= 0) {
    return { ok: true, status: 200, idempotentReplay: false, bodyText: 'noop' };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.apiBase ?? 'https://api.stripe.com';
  const eventName = input.meterEventName ?? 'kipuspay_doc_overage';
  const body = new URLSearchParams({
    event_name: eventName,
    'payload[stripe_customer_id]': input.stripeCustomerId,
    'payload[value]': String(input.units),
    identifier: input.idempotencyKey,
  });
  const res = await fetchImpl(`${base}/v1/billing/meter_events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: body.toString(),
  });
  const bodyText = await res.text();
  const idempotentReplay = res.status === 200 && bodyText.includes('"object"');
  return {
    ok: res.ok,
    status: res.status,
    idempotentReplay,
    bodyText,
  };
}
