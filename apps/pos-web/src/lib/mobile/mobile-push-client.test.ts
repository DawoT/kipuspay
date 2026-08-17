import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureMobilePushApi,
  registerFcmTokenPush,
  type PushPurpose,
} from './mobile-push-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function buildFetch(requests: Array<{ method: string; url: string; body: unknown }>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url: string = typeof input === 'string' ? input : (input as URL).toString();
    const method = init?.method ?? 'GET';
    const rawBody = init?.body;
    const body =
      typeof rawBody === 'string' && rawBody
        ? (JSON.parse(rawBody) as unknown)
        : (undefined as unknown);
    requests.push({ method, url, body });
    if (url.endsWith('/api/push/privacy')) {
      return Promise.resolve(
        jsonResponse({
          amountsEnabled: true,
          policyVersion: 's45-v1',
          vapidPublicKey: '',
        }),
      );
    }
    if (url.endsWith('/api/push/consents')) {
      return Promise.resolve(jsonResponse({ id: 'consent-fcm-1' }, 201));
    }
    if (url.endsWith('/api/push/subscriptions')) {
      return Promise.resolve(jsonResponse({ id: 'subscription-fcm-1' }, 201));
    }
    return Promise.resolve(jsonResponse({ code: 'PUSH_HTTP_404' }, 404));
  });
}

describe('C8: cliente FCM wired — registro FCM_HTTP_V1 con token real del host (RED)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registra una suscripción FCM_HTTP_V1 con el token real del host (jamás WEB_PUSH)', async () => {
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    configureMobilePushApi(buildFetch(requests));
    const purpose: PushPurpose = 'OWNER_ALERTS';

    const result = await registerFcmTokenPush(purpose, 'REDACTED', 'opaque-fcm-host-token');

    expect(result).toEqual({
      consentId: 'consent-fcm-1',
      subscriptionId: 'subscription-fcm-1',
    });
    const subscription = requests.find((request) => request.url.endsWith('/api/push/subscriptions'));
    expect(subscription).toBeDefined();
    expect(subscription?.body).toMatchObject({
      purpose,
      provider: 'FCM_HTTP_V1',
      encryptedRegistration: 'opaque-fcm-host-token',
      consentPolicyVersion: 's45-v1',
    });
    expect(JSON.stringify(requests)).not.toContain('WEB_PUSH');
  });

  it('falla cerrado ante un token FCM vacío o ausente (jamás demo)', async () => {
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    configureMobilePushApi(buildFetch(requests));

    await expect(
      registerFcmTokenPush('OWNER_ALERTS', 'REDACTED', ''),
    ).rejects.toThrow('PUSH_FCM_TOKEN_INVALID');
    await expect(
      registerFcmTokenPush('OWNER_ALERTS', 'REDACTED', '   '),
    ).rejects.toThrow('PUSH_FCM_TOKEN_INVALID');
    expect(requests.some((request) => request.url.endsWith('/api/push/subscriptions'))).toBe(false);
  });

  it('respeta la política: AMOUNTS solo con policy habilitada', async () => {
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
    configureMobilePushApi(buildFetch(requests));

    await registerFcmTokenPush('OWNER_ALERTS', 'AMOUNTS', 'opaque-fcm-host-token');

    const consent = requests.find((request) => request.url.endsWith('/api/push/consents'));
    expect(consent?.body).toMatchObject({
      purpose: 'OWNER_ALERTS',
      privacyMode: 'AMOUNTS',
      ownerAmountsOptIn: true,
      policyVersion: 's45-v1',
    });
  });
});