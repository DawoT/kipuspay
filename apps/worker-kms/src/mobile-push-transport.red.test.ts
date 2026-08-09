/* eslint-disable @typescript-eslint/no-unsafe-assignment, no-secrets/no-secrets -- RED contract uses provider metadata and synthetic leak markers */
import { describe, expect, it, vi } from 'vitest';
import {
  assertAllowedWebPushEndpoint,
  classifyPushProviderFixture,
  sendFcmHttpV1,
  sendWebPushVapid,
  type PushTransportSecrets,
} from './mobile-push-transport.js';

const secrets: PushTransportSecrets = {
  vapidPrivateKeyRef: 'secret-ref-vapid-v3',
  fcmServiceAccountRef: 'secret-ref-fcm-v2',
};
const ackPayload = {
  deliveryId: 'delivery-a',
  receipt: `${'a'.repeat(24)}.${'b'.repeat(43)}`,
} as const;

describe('Sprint 45 isolated push transport Worker contract (RED)', () => {
  it.each([
    'https://evil.example/fcm/send/token',
    'https://fcm.googleapis.com.evil.example/fcm/send/token',
    'https://user:pass@fcm.googleapis.com/fcm/send/token',
    'https://fcm.googleapis.com:444/fcm/send/token',
    'https://127.0.0.1/fcm/send/token',
    'https://169.254.169.254/fcm/send/token',
    'https://[::1]/fcm/send/token',
    'https://attacker.wns2-am3p.wnspush.windows.com/w/token',
  ])('rejects SSRF endpoint %s at the transport boundary', (endpoint) => {
    expect(() => assertAllowedWebPushEndpoint(endpoint)).toThrow('PUSH_ENDPOINT_NOT_ALLOWED');
  });

  it.each([
    'https://fcm.googleapis.com/fcm/send/opaque',
    'https://updates.push.services.mozilla.com/wpush/v2/opaque',
    'https://web.push.apple.com/QHopaque',
    'https://wns2-am3p.notify.windows.com/w/?token=opaque',
  ])('allows the exact browser push service %s', (endpoint) => {
    expect(assertAllowedWebPushEndpoint(endpoint)).toBe(endpoint);
  });

  it('revalidates the decrypted endpoint immediately before provider fetch', async () => {
    const providerFetch = vi.fn();
    await expect(
      sendWebPushVapid({
        secrets,
        encryptedSubscription: 'ciphertext',
        keyVersion: 'push-kms-v3',
        payload: { title: 'redacted', body: 'redacted', ...ackPayload },
        ttlSeconds: 300,
        dependencies: {
          kms: {
            verifyKeyVersion: vi.fn(),
            decrypt: vi.fn(() =>
              Promise.resolve(
                JSON.stringify({
                  endpoint: 'https://fcm.googleapis.com.attacker.example/fcm/send/token',
                  keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
                }),
              ),
            ),
          },
          secret: vi.fn(() => Promise.reject(new Error('must not load secrets'))),
          fetch: providerFetch,
          now: () => 1_786_224_000_000,
        },
      }),
    ).rejects.toThrow('PUSH_SUBSCRIPTION_INVALID');
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('signs Web Push VAPID inside PUSH_KMS and returns only opaque provider metadata', async () => {
    const result = await sendWebPushVapid({
      secrets,
      encryptedSubscription: 'ciphertext',
      keyVersion: 'push-kms-v3',
      payload: {
        title: 'Alerta operativa',
        body: 'Abre KipusPay para ver el detalle',
        ...ackPayload,
      },
      ttlSeconds: 300,
    });
    expect(result).toMatchObject({
      provider: 'WEB_PUSH',
      providerVersion: expect.any(String),
      status: 'ACCEPTED',
      providerMessageIdHash: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('ciphertext');
  });

  it('uses OAuth2 and the FCM HTTP v1 project endpoint, never a legacy server key', async () => {
    const result = await sendFcmHttpV1({
      secrets,
      encryptedToken: 'ciphertext',
      keyVersion: 'push-kms-v2',
      payload: {
        title: 'Alerta operativa',
        body: 'Abre KipusPay para ver el detalle',
        ...ackPayload,
      },
      ttlSeconds: 300,
    });
    expect(result.request).toMatchObject({
      authScheme: 'Bearer',
      url: expect.stringMatching(/\/v1\/projects\/[^/]+\/messages:send$/),
    });
    expect(result.request.headers).not.toHaveProperty('AuthorizationKey');
    expect(JSON.stringify(result)).not.toContain('service_account');
  });

  it('fails closed when PUSH_KMS or revocation verification is unavailable', async () => {
    await expect(
      sendWebPushVapid({
        secrets: null,
        encryptedSubscription: 'ciphertext',
        keyVersion: 'revoked',
        payload: { title: 'redacted', body: 'redacted', ...ackPayload },
        ttlSeconds: 300,
      }),
    ).rejects.toThrow('PUSH_KMS_UNAVAILABLE');
  });

  it.each([
    ['WEB_PUSH', 201, {}, 'ACCEPTED', false, null],
    ['WEB_PUSH', 410, {}, 'INVALID', true, null],
    ['WEB_PUSH', 429, { 'Retry-After': '37' }, 'RETRY', false, 37],
    ['FCM_HTTP_V1', 200, {}, 'ACCEPTED', false, null],
    ['FCM_HTTP_V1', 404, {}, 'INVALID', true, null],
    ['FCM_HTTP_V1', 503, { 'Retry-After': '60' }, 'RETRY', false, 60],
  ] as const)(
    'classifies the %s provider fixture status %i without exposing its response body',
    async (provider, status, headers, expectedStatus, invalidated, retryAfterSeconds) => {
      const result = await classifyPushProviderFixture({
        provider,
        status,
        headers,
        responseBody: 'token=secret customer=DNI-12345678',
        nowMs: 1_786_224_000_000,
      });
      expect(result).toMatchObject({
        provider,
        status: expectedStatus,
        invalidateSubscription: invalidated,
        retryAfterSeconds,
      });
      expect(JSON.stringify(result)).not.toContain('DNI-12345678');
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
});
