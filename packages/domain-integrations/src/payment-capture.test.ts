import { describe, expect, it } from 'vitest';
import {
  assertCaptureTransition,
  assertOfflineCapturePolicy,
  assertWebhookFreshness,
  buildCaptureIdempotencyKey,
  isCardMethod,
  isCashMethod,
  isElectronicMethod,
  isPaymentMethodCode,
  isWalletMethod,
  MANUAL_CAPTURE_AMBER_COPY,
  methodCodeToAcquirer,
  WEBHOOK_REPLAY_WINDOW_SEC,
} from './payment-capture.js';

describe('assertCaptureTransition', () => {
  it('PENDING → CAPTURED|FAILED', () => {
    expect(() => assertCaptureTransition('PENDING', 'CAPTURED')).not.toThrow();
    expect(() => assertCaptureTransition('PENDING', 'FAILED')).not.toThrow();
  });

  it('CAPTURED → REFUNDED; MANUAL terminal', () => {
    expect(() => assertCaptureTransition('CAPTURED', 'REFUNDED')).not.toThrow();
    expect(() => assertCaptureTransition('MANUAL_ELECTRONIC_CAPTURE', 'CAPTURED')).toThrow(
      /CAPTURE_INVALID/,
    );
  });

  it('rechaza PENDING → MANUAL', () => {
    expect(() => assertCaptureTransition('PENDING', 'MANUAL_ELECTRONIC_CAPTURE')).toThrow(
      /CAPTURE_INVALID/,
    );
  });
});

describe('offline capture policy', () => {
  it('wallet offline MANUAL ok', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'yape',
        captureStatus: 'MANUAL',
        online: false,
      }),
    ).not.toThrow();
  });

  it('wallet offline no puede claim API', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'yape',
        captureStatus: 'API',
        online: false,
      }),
    ).toThrow('OFFLINE_CANNOT_CLAIM_API_CAPTURE');
  });

  it('MANUAL online forbidden', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'plin',
        captureStatus: 'MANUAL',
        online: true,
      }),
    ).toThrow('MANUAL_CAPTURE_FORBIDDEN_ONLINE');
  });

  it('cash no acepta MANUAL', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'cash',
        captureStatus: 'MANUAL',
        online: false,
      }),
    ).toThrow('MANUAL_CAPTURE_REQUIRES_ELECTRONIC');
  });

  it('rechaza status desconocido', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'yape',
        captureStatus: 'BOGUS' as 'MANUAL',
        online: false,
      }),
    ).toThrow('OFFLINE_ELECTRONIC_REQUIRES_MANUAL');
  });

  it('rechaza status desconocido online', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'cash',
        captureStatus: 'BOGUS' as 'API',
        online: true,
      }),
    ).toThrow('INVALID_CAPTURE_STATUS');
  });

  it('online wallet omit status ok', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'culqi',
        captureStatus: null,
        online: true,
      }),
    ).not.toThrow();
  });

  it('offline electronic sin MANUAL rechaza', () => {
    expect(() =>
      assertOfflineCapturePolicy({
        methodCode: 'yape',
        captureStatus: null,
        online: false,
      }),
    ).toThrow('OFFLINE_ELECTRONIC_REQUIRES_MANUAL');
  });
});

describe('idempotency key builder', () => {
  it('estable', () => {
    expect(buildCaptureIdempotencyKey('off-1', 0, 'yape')).toBe('off-1:0:yape');
  });

  it('rechaza índice inválido', () => {
    expect(() => buildCaptureIdempotencyKey('off-1', -1, 'yape')).toThrow('INVALID_PAYMENT_INDEX');
  });
});

describe('methodCodeToAcquirer / electronic', () => {
  it('mercadopago_qr → mercadopago', () => {
    expect(methodCodeToAcquirer('mercadopago_qr')).toBe('mercadopago');
    expect(methodCodeToAcquirer('cash')).toBeNull();
    expect(methodCodeToAcquirer('card_manual')).toBeNull();
    expect(methodCodeToAcquirer('credit')).toBeNull();
  });

  it('cash vs electronic vs wallet vs card', () => {
    expect(isCashMethod('cash')).toBe(true);
    expect(isCashMethod('yape')).toBe(false);
    expect(isElectronicMethod('niubiz')).toBe(true);
    expect(isElectronicMethod('credit')).toBe(false);
    expect(isWalletMethod('plin')).toBe(true);
    expect(isWalletMethod('culqi')).toBe(false);
    expect(isCardMethod('culqi')).toBe(true);
    expect(isCardMethod('yape')).toBe(false);
  });

  it('isPaymentMethodCode', () => {
    expect(isPaymentMethodCode('yape')).toBe(true);
    expect(isPaymentMethodCode('bitcoin')).toBe(false);
  });

  it('mapea todos los adquirentes', () => {
    expect(methodCodeToAcquirer('yape')).toBe('yape');
    expect(methodCodeToAcquirer('plin')).toBe('plin');
    expect(methodCodeToAcquirer('culqi')).toBe('culqi');
    expect(methodCodeToAcquirer('niubiz')).toBe('niubiz');
  });
});

describe('webhook freshness', () => {
  it('ventana 300s', () => {
    const now = 1_000_000;
    expect(() => assertWebhookFreshness(now, now)).not.toThrow();
    expect(() => assertWebhookFreshness(now - WEBHOOK_REPLAY_WINDOW_SEC - 1, now)).toThrow(
      'WEBHOOK_REPLAY_WINDOW',
    );
  });

  it('rechaza ts no finito', () => {
    expect(() => assertWebhookFreshness(Number.NaN, 1)).toThrow('INVALID_WEBHOOK_TS');
  });
});

describe('idempotency key edge', () => {
  it('requiere offlineSaleId y method', () => {
    expect(() => buildCaptureIdempotencyKey('', 0, 'yape')).toThrow('MISSING_OFFLINE_SALE_ID');
    expect(() => buildCaptureIdempotencyKey('x', 0, '')).toThrow('MISSING_METHOD_CODE');
  });
});

describe('amber copy', () => {
  it('copy normativa exacta', () => {
    expect(MANUAL_CAPTURE_AMBER_COPY).toBe(
      'Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto',
    );
  });
});
