/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- absent Sprint 45 module is the intentional RED boundary */
import { describe, expect, it } from 'vitest';
import {
  sendFcmHttpV1,
  sendWebPushVapid,
  type PushTransportSecrets,
} from './mobile-push-transport.js';

const secrets: PushTransportSecrets = {
  vapidPrivateKeyRef: 'secret-ref-vapid-v3',
  fcmServiceAccountRef: 'secret-ref-fcm-v2',
};

describe('Sprint 45 isolated push transport Worker contract (RED)', () => {
  it('signs Web Push VAPID inside PUSH_KMS and returns only opaque provider metadata', async () => {
    const result = await sendWebPushVapid({
      secrets,
      encryptedSubscription: 'ciphertext',
      keyVersion: 'push-kms-v3',
      payload: { title: 'Alerta operativa', body: 'Abre KipusPay para ver el detalle' },
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
      payload: { title: 'Alerta operativa', body: 'Abre KipusPay para ver el detalle' },
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
        payload: { title: 'redacted', body: 'redacted' },
        ttlSeconds: 300,
      }),
    ).rejects.toThrow('PUSH_KMS_UNAVAILABLE');
  });
});
