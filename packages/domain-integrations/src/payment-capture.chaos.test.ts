import { describe, expect, it } from 'vitest';
import {
  assertCaptureTransition,
  assertOfflineCapturePolicy,
  buildCaptureIdempotencyKey,
} from './payment-capture.js';

describe('chaos payment capture', () => {
  it('misma idempotency key es estable bajo reintento', () => {
    const a = buildCaptureIdempotencyKey('sale-x', 1, 'yape');
    const b = buildCaptureIdempotencyKey('sale-x', 1, 'yape');
    expect(a).toBe(b);
    expect(a).not.toBe(buildCaptureIdempotencyKey('sale-x', 2, 'yape'));
  });

  it('MANUAL y API conflict en offline wallet', () => {
    expect(() =>
      assertOfflineCapturePolicy({ methodCode: 'yape', captureStatus: 'API', online: false }),
    ).toThrow();
    expect(() =>
      assertOfflineCapturePolicy({ methodCode: 'yape', captureStatus: 'MANUAL', online: false }),
    ).not.toThrow();
  });

  it('CAPTURED no re-captura; solo refund', () => {
    expect(() => assertCaptureTransition('CAPTURED', 'CAPTURED')).toThrow();
    expect(() => assertCaptureTransition('FAILED', 'CAPTURED')).toThrow();
    expect(() => assertCaptureTransition('CAPTURED', 'REFUNDED')).not.toThrow();
  });
});
