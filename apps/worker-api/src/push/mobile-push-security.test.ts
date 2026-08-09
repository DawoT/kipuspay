import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  acknowledgeDisplayedHttp,
  grantPushConsentHttp,
  resolvePushDeepLink,
  validatePushRegistration,
} from './mobile-push-routes.js';

describe('Sprint 45 push API security boundary', () => {
  it('rejects Web Push host suffix tricks and oversized registrations', () => {
    expect(() =>
      validatePushRegistration(
        'WEB_PUSH',
        JSON.stringify({
          endpoint: 'https://updates.push.services.mozilla.com.attacker.example/wpush',
          keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
        }),
      ),
    ).toThrow('PUSH_ENDPOINT_NOT_ALLOWED');
    expect(() => validatePushRegistration('FCM_HTTP_V1', 'x'.repeat(4097))).toThrow(
      'PUSH_REGISTRATION_TOO_LARGE',
    );
    expect(() =>
      validatePushRegistration(
        'WEB_PUSH',
        JSON.stringify({
          endpoint: 'https://attacker.wns-eu.wnspush.windows.com/opaque',
          keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
        }),
      ),
    ).toThrow('PUSH_ENDPOINT_NOT_ALLOWED');
  });

  it('uses one closed deep-link enum and fails unknown kinds closed', () => {
    const kinds = [
      'cash_close',
      'cash_discrepancy',
      'inventory',
      'installment',
      'accounts_receivable',
      'customer_order',
      'recurring_sale',
      'billing',
    ];
    for (const kind of kinds)
      expect(resolvePushDeepLink({ kind, entityId: 'opaque-1' })).toContain('opaque-1');
    expect(
      resolvePushDeepLink({ kind: 'https://attacker.example', entityId: 'opaque-1' }),
    ).toBeNull();
  });

  it('ignores client policy assertions and rejects AMOUNTS when tenant policy is off', async () => {
    const prepare = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(() =>
          Promise.resolve(
            sql.includes('tenant_capabilities')
              ? { enabled: 1 }
              : sql.includes('push_privacy_settings')
                ? { amounts_enabled: 0, policy_version: 's45-v1' }
                : null,
          ),
        ),
        run: vi.fn(() => Promise.resolve({ meta: { changes: 1 } })),
      })),
    }));
    const result = await grantPushConsentHttp(
      {
        FEATURE_MOBILE_PUSH: '1',
        DB: { prepare },
      } as unknown as WorkerEnv,
      { tenantId: 'tenant-a', userId: 'owner-a', role: 'owner', deviceFingerprint: 'device-a' },
      {
        purpose: 'OWNER_ALERTS',
        policyVersion: 's45-v1',
        privacyMode: 'AMOUNTS',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: true,
      },
    );
    expect(result).toEqual({ status: 403, body: { code: 'PUSH_AMOUNTS_' + 'POLICY_FORBIDDEN' } });
  });

  it('accepts bounded canonical browser registrations', () => {
    const registration = JSON.stringify({
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/opaque',
      keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
    });
    expect(validatePushRegistration('WEB_PUSH', registration)).toBe(registration);
    expect(validatePushRegistration('FCM_HTTP_V1', 'opaque-fcm-registration-token')).toBe(
      'opaque-fcm-registration-token',
    );
  });

  it('rejects a cryptographically valid receipt issued for another user before D1 lookup', async () => {
    const prepare = vi.fn();
    const env = {
      FEATURE_MOBILE_PUSH: '1',
      DB: { prepare },
      PUSH_KMS: {
        verifyAckReceipt: vi.fn(() =>
          Promise.resolve({
            tenantId: 'tenant-a',
            userId: 'user-a',
            deliveryId: 'delivery-a',
            subscriptionId: 'subscription-a',
            deviceFingerprint: 'device-a',
            issuedAtSeconds: Math.floor(Date.now() / 1000),
            expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
            nonce: 'nonce-a',
          }),
        ),
      },
    } as unknown as WorkerEnv;
    await expect(
      acknowledgeDisplayedHttp(
        env,
        { tenantId: 'tenant-a', userId: 'user-b', role: 'owner' },
        {
          receipt: `${'a'.repeat(24)}.${'b'.repeat(43)}`,
          deliveryId: 'delivery-a',
          displayedAt: new Date().toISOString(),
        },
      ),
    ).resolves.toMatchObject({ status: 403, body: { code: 'PUSH_ACK_SCOPE_MISMATCH' } });
    expect(prepare).not.toHaveBeenCalled();
  });
});
