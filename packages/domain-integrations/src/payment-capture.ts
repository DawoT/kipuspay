/**
 * Sprint 22 — captura de pagos en caja (§5.4 regla 2, edge 2B).
 * Puro: sin D1 / HTTP.
 */

export type PaymentMethodCode =
  | 'yape'
  | 'plin'
  | 'mercadopago_qr'
  | 'culqi'
  | 'niubiz'
  | 'cash'
  | 'card_manual'
  | 'credit'
  | 'store_credit';

/** Catálogo CHECK payment_captures.acquirer (§5.4). */
export type PaymentAcquirerCode = 'yape' | 'plin' | 'mercadopago' | 'culqi' | 'niubiz';

export type CaptureStatus =
  'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'MANUAL_ELECTRONIC_CAPTURE';

export type OfflineCaptureStatus = 'API' | 'MANUAL';

const METHOD_CODES: ReadonlySet<string> = new Set([
  'yape',
  'plin',
  'mercadopago_qr',
  'culqi',
  'niubiz',
  'cash',
  'card_manual',
  'credit',
  'store_credit',
]);

const WALLET_CODES: ReadonlySet<PaymentMethodCode> = new Set(['yape', 'plin', 'mercadopago_qr']);

const CARD_CODES: ReadonlySet<PaymentMethodCode> = new Set(['culqi', 'niubiz']);

const ELECTRONIC_CODES: ReadonlySet<PaymentMethodCode> = new Set([
  'yape',
  'plin',
  'mercadopago_qr',
  'culqi',
  'niubiz',
]);

const CAPTURE_TRANSITIONS: Readonly<Record<CaptureStatus, readonly CaptureStatus[]>> = {
  PENDING: ['CAPTURED', 'FAILED'],
  CAPTURED: ['REFUNDED'],
  FAILED: [],
  REFUNDED: [],
  MANUAL_ELECTRONIC_CAPTURE: [],
};

export function isPaymentMethodCode(code: string): code is PaymentMethodCode {
  return METHOD_CODES.has(code);
}

export function isWalletMethod(code: PaymentMethodCode): boolean {
  return WALLET_CODES.has(code);
}

export function isCardMethod(code: PaymentMethodCode): boolean {
  return CARD_CODES.has(code);
}

export function isElectronicMethod(code: PaymentMethodCode): boolean {
  return ELECTRONIC_CODES.has(code);
}

export function isCashMethod(code: PaymentMethodCode): boolean {
  return code === 'cash';
}

/** payment_methods.code → payment_captures.acquirer */
export function methodCodeToAcquirer(code: PaymentMethodCode): PaymentAcquirerCode | null {
  if (code === 'yape') return 'yape';
  if (code === 'plin') return 'plin';
  if (code === 'mercadopago_qr') return 'mercadopago';
  if (code === 'culqi') return 'culqi';
  if (code === 'niubiz') return 'niubiz';
  return null;
}

export function assertCaptureTransition(from: CaptureStatus, to: CaptureStatus): void {
  if (!CAPTURE_TRANSITIONS[from].includes(to)) {
    throw new Error(`CAPTURE_INVALID:${from}->${to}`);
  }
}

/**
 * Offline Zero-Trust (§5.4 edge 2B):
 * - cash/credit/card_manual: sin captura electrónica
 * - wallet/card online: captureStatus API (o omitido)
 * - wallet/card offline: solo MANUAL; nunca inventar CAPTURED/API
 */
export function assertOfflineCapturePolicy(input: {
  readonly methodCode: PaymentMethodCode;
  readonly captureStatus: OfflineCaptureStatus | null | undefined;
  readonly online: boolean;
}): void {
  const status = input.captureStatus ?? null;
  const electronic = isElectronicMethod(input.methodCode);

  if (!input.online && electronic) {
    if (status === 'API') throw new Error('OFFLINE_CANNOT_CLAIM_API_CAPTURE');
    if (status !== 'MANUAL') throw new Error('OFFLINE_ELECTRONIC_REQUIRES_MANUAL');
    return;
  }

  if (status === 'MANUAL') {
    if (!electronic) throw new Error('MANUAL_CAPTURE_REQUIRES_ELECTRONIC');
    if (input.online) throw new Error('MANUAL_CAPTURE_FORBIDDEN_ONLINE');
    return;
  }

  if (status !== null && status !== undefined && status !== 'API') {
    throw new Error('INVALID_CAPTURE_STATUS');
  }
}

/** Idempotency: tenant-scoped UNIQUE key for payment_captures. */
export function buildCaptureIdempotencyKey(
  offlineSaleId: string,
  paymentIndex: number,
  methodCode: string,
): string {
  if (!offlineSaleId.trim()) throw new Error('MISSING_OFFLINE_SALE_ID');
  if (!Number.isInteger(paymentIndex) || paymentIndex < 0) {
    throw new Error('INVALID_PAYMENT_INDEX');
  }
  if (!methodCode.trim()) throw new Error('MISSING_METHOD_CODE');
  return `${offlineSaleId}:${paymentIndex}:${methodCode}`;
}

export const WEBHOOK_REPLAY_WINDOW_SEC = 300;

export function assertWebhookFreshness(eventTsSec: number, nowSec: number): void {
  if (!Number.isFinite(eventTsSec) || !Number.isFinite(nowSec)) {
    throw new Error('INVALID_WEBHOOK_TS');
  }
  if (Math.abs(nowSec - eventTsSec) > WEBHOOK_REPLAY_WINDOW_SEC) {
    throw new Error('WEBHOOK_REPLAY_WINDOW');
  }
}

export type Cents = number;

export interface PaymentChargeRequest {
  readonly chargeId: string;
  readonly amountCents: Cents;
  readonly currency: 'PEN';
  readonly acquirer: PaymentAcquirerCode;
  readonly idempotencyKey: string;
}

export interface PaymentChargeResult {
  readonly chargeId: string;
  readonly approved: boolean;
  readonly reference: string | null;
  readonly status: 'PENDING' | 'CAPTURED' | 'FAILED';
}

export interface PaymentStatusRequest {
  readonly chargeId: string;
  readonly acquirer: PaymentAcquirerCode;
}

export interface PaymentWebhookVerifyInput {
  readonly acquirer: PaymentAcquirerCode;
  readonly rawBody: string;
  readonly signatureHeader: string;
  readonly timestampSec: number;
  readonly nowSec: number;
  readonly secret: string;
}

export interface PaymentWebhookVerifyResult {
  readonly ok: boolean;
  readonly chargeId: string | null;
  readonly status: CaptureStatus | null;
  readonly reference: string | null;
}

/**
 * Puerto PaymentAcquirer (§5.4) — charge / poll / webhook HMAC.
 * Implementación en adapters-payments-pe; dominio solo tipa el contrato.
 */
export interface PaymentAcquirerPort {
  charge(request: PaymentChargeRequest): Promise<PaymentChargeResult>;
  getStatus(request: PaymentStatusRequest): Promise<PaymentChargeResult>;
  verifyWebhook(input: PaymentWebhookVerifyInput): Promise<PaymentWebhookVerifyResult>;
}

/** Copy normativa exacta edge 2B (caja). */
export const MANUAL_CAPTURE_AMBER_COPY =
  'Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto';
