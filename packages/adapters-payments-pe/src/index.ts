/**
 * Sprint 22 — PaymentAcquirer adapters PE (sandbox + HMAC webhook).
 * Secrets solo server-side; tests usan sandbox determinista.
 */
import {
  assertWebhookFreshness,
  type PaymentAcquirerCode,
  type PaymentAcquirerPort,
  type PaymentChargeRequest,
  type PaymentChargeResult,
  type PaymentStatusRequest,
  type PaymentWebhookVerifyInput,
  type PaymentWebhookVerifyResult,
} from '@kipuspay/domain-integrations';

export type PaymentKind = 'card' | 'cash' | 'wallet';

export interface PaymentResult {
  readonly amountCents: number;
  readonly approved: boolean;
  readonly externalReference: string | null;
}

export function isPaymentApproved(result: PaymentResult): boolean {
  return result.approved;
}

export function externalToken(result: PaymentResult): string {
  return result.externalReference ?? '';
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesEqualConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const sandboxStore = new Map<string, PaymentChargeResult>();

/**
 * Sandbox determinista: aprueba si amountCents > 0 y chargeId no termina en `-fail`.
 * Idempotency: misma key reutiliza resultado.
 */
export class SandboxPaymentAcquirer implements PaymentAcquirerPort {
  private readonly acquirer: PaymentAcquirerCode;

  constructor(acquirer: PaymentAcquirerCode) {
    this.acquirer = acquirer;
  }

  charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const key = `${this.acquirer}:${request.idempotencyKey}`;
    const existing = sandboxStore.get(key);
    if (existing) return Promise.resolve(existing);

    const fail = request.chargeId.endsWith('-fail') || request.amountCents <= 0;
    const result: PaymentChargeResult = {
      chargeId: request.chargeId,
      approved: !fail,
      reference: fail ? null : `sbx-${this.acquirer}-${request.chargeId}`,
      status: fail ? 'FAILED' : request.chargeId.includes('pending') ? 'PENDING' : 'CAPTURED',
    };
    sandboxStore.set(key, result);
    return Promise.resolve(result);
  }

  getStatus(request: PaymentStatusRequest): Promise<PaymentChargeResult> {
    for (const [k, v] of sandboxStore) {
      if (k.startsWith(`${this.acquirer}:`) && v.chargeId === request.chargeId) {
        return Promise.resolve(v);
      }
    }
    return Promise.resolve({
      chargeId: request.chargeId,
      approved: false,
      reference: null,
      status: 'FAILED',
    });
  }

  async verifyWebhook(input: PaymentWebhookVerifyInput): Promise<PaymentWebhookVerifyResult> {
    const denied: PaymentWebhookVerifyResult = {
      ok: false,
      chargeId: null,
      status: null,
      reference: null,
    };
    try {
      assertWebhookFreshness(input.timestampSec, input.nowSec);
    } catch {
      return denied; // replay o ts inválido → fail-closed
    }
    if (!input.secret) {
      return denied;
    }
    const expected = await hmacSha256Hex(input.secret, `${input.timestampSec}.${input.rawBody}`);
    if (!bytesEqualConstantTime(expected, input.signatureHeader)) {
      return { ok: false, chargeId: null, status: null, reference: null };
    }
    let body: { chargeId?: string; status?: unknown; reference?: string };
    try {
      body = JSON.parse(input.rawBody) as typeof body;
    } catch {
      return denied;
    }
    const status = body.status;
    if (!body.chargeId || !body.status) {
      return denied; // webhook firmado pero incompleto → nunca captura con null
    }
    if (
      status !== 'CAPTURED' &&
      status !== 'FAILED' &&
      status !== 'PENDING' &&
      status !== 'REFUNDED' &&
      status !== 'MANUAL_ELECTRONIC_CAPTURE'
    ) {
      return denied; // status desconocido → fail-closed
    }
    return {
      ok: true,
      chargeId: body.chargeId,
      status,
      reference: body.reference ?? null,
    };
  }
}

export function createPaymentAcquirer(
  acquirer: PaymentAcquirerCode,
  secrets?: Readonly<Record<string, string | undefined>>,
): PaymentAcquirerPort {
  void secrets;
  // Live HTTP wiring is residual (ops QG); chaos/tests use sandbox.
  return new SandboxPaymentAcquirer(acquirer);
}

/** Test helper: clear sandbox between cases. */
export function resetSandboxStore(): void {
  sandboxStore.clear();
}
