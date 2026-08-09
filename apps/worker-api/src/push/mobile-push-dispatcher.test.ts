import { describe, expect, it } from 'vitest';
// @ts-expect-error -- Vite raw source import is supported by Vitest.
import dispatcherSource from './mobile-push-dispatcher.ts?raw';
import {
  computePushRetryDelaySeconds,
  pushDeliveryObservation,
  sanitizeProviderResult,
} from './mobile-push-dispatcher.js';

describe('Sprint 45 push dispatcher policy', () => {
  it('honors Retry-After and bounds exponential jitter below the TTL', () => {
    expect(computePushRetryDelaySeconds(2, 90, 300, 0)).toBe(90);
    expect(computePushRetryDelaySeconds(20, null, 120, 1)).toBeLessThanOrEqual(120);
  });

  it('stores only allowlisted provider observations', () => {
    expect(
      sanitizeProviderResult({
        provider: 'WEB_PUSH',
        status: 'RETRY',
        responseCode: '429',
        providerMessageIdHash: 'opaque-hash',
        retryAfterSeconds: 30,
        invalidateSubscription: false,
        secret: 'must-not-leak',
      }),
    ).toEqual({
      provider: 'WEB_PUSH',
      status: 'RETRY',
      responseCode: '429',
      providerMessageIdHash: 'opaque-hash',
      retryAfterSeconds: 30,
      invalidateSubscription: false,
    });
  });

  it('flags only eligible normal-network SLO failures', () => {
    expect(
      pushDeliveryObservation({
        normalSamples: 100,
        displayed: 98,
        p50Ms: 1_000,
        p95Ms: 9_000,
        offline: 8,
        doze: 4,
      }),
    ).toMatchObject({
      alert: true,
      reasons: ['DISPLAYED_BELOW_99'],
      excluded: { OFFLINE: 8, DOZE: 4 },
    });
  });

  it('covers TTL exhaustion, jitter bounds, provider sanitization, and healthy SLO', () => {
    expect(computePushRetryDelaySeconds(1, null, 0, 0.5)).toBe(0);
    expect(computePushRetryDelaySeconds(-3, null, 30, -1)).toBeGreaterThanOrEqual(1);
    expect(
      sanitizeProviderResult({
        provider: 'FCM_HTTP_V1',
        status: 'ACCEPTED',
        responseCode: '200',
        providerMessageIdHash: '../not-opaque',
        retryAfterSeconds: -10,
        invalidateSubscription: true,
      }),
    ).toMatchObject({
      provider: 'FCM_HTTP_V1',
      status: 'ACCEPTED',
      responseCode: '200',
      providerMessageIdHash: '',
      retryAfterSeconds: 0,
      invalidateSubscription: true,
    });
    expect(
      pushDeliveryObservation({
        normalSamples: 100,
        displayed: 100,
        p50Ms: 500,
        p95Ms: 1_500,
        offline: 2,
        doze: 1,
      }),
    ).toMatchObject({ alert: false, reasons: [], displayedRate: 1 });
    expect(
      pushDeliveryObservation({
        normalSamples: 1,
        displayed: 1,
        p50Ms: 500,
        p95Ms: 10_000,
        offline: 0,
        doze: 0,
      }),
    ).toMatchObject({ alert: true, reasons: ['P95_AT_OR_ABOVE_10S'] });
  });

  it('fans operational events only to the exact target user and branch', () => {
    expect(dispatcherSource).toContain('s.user_id = e.target_user_id');
    expect(dispatcherSource).toContain('s.branch_id = e.target_branch_id');
    expect(dispatcherSource).toContain(
      "e.target_scope = 'OWNER_ALERTS' AND u.role IN ('owner','admin')",
    );
  });
});
