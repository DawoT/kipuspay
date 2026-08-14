import { describe, expect, it } from 'vitest';
import {
  acknowledgeDisplayedHttp,
  grantPushConsentHttp,
  isClientMobilePosEnabled,
  isMobilePushEnabled,
  isOwnerPushAliasEnabled,
  listPushDevicesHttp,
  resolvePushDeepLink,
  revokePushConsentHttp,
  revokePushDeviceHttp,
  rotatePushDeviceHttp,
  sendTestPushHttp,
  subscribePushDeviceHttp,
  updatePushPrivacyHttp,
} from './mobile-push-routes.js';

describe('Sprint 45 push API, RBAC, and ACK contract (RED)', () => {
  const webRegistration = JSON.stringify({
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/opaque',
    keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
  });
  it('is default-off and treats FEATURE_OWNER_PUSH only as a migration alias', () => {
    expect(isMobilePushEnabled({})).toBe(false);
    expect(isClientMobilePosEnabled({})).toBe(false);
    expect(
      isMobilePushEnabled({
        FEATURE_OWNER_PUSH: '1',
        FEATURE_MOBILE_PUSH: '0',
      }),
    ).toBe(false);
  });

  it.each([
    ['owner', 'OWNER_ALERTS', 201],
    ['admin', 'OWNER_ALERTS', 201],
    ['supervisor', 'OWNER_ALERTS', 403],
    ['cashier', 'OWNER_ALERTS', 403],
    ['supervisor', 'OPERATIONAL_MOBILE', 201],
    ['cashier', 'OPERATIONAL_MOBILE', 201],
  ] as const)('enforces %s RBAC for %s', async (role, purpose, status) => {
    const response = await subscribePushDeviceHttp(
      {
        FEATURE_MOBILE_PUSH: '1',
        FEATURE_CLIENT_MOBILE_POS: '1',
        DB: {
          prepare: (sql: string) => ({
            bind: () => ({
              first: () => {
                if (sql.includes('tenant_capabilities')) {
                  return Promise.resolve({ enabled: 1 });
                }
                if (sql.includes('push_consents')) {
                  return Promise.resolve({ id: 'consent-rbac', device_fingerprint: 'df' });
                }
                if (sql.includes('pos_terminal_sessions')) {
                  return Promise.resolve({
                    id: 'session-a',
                    branch_id: 'branch-a',
                    status: 'ACTIVE',
                  });
                }
                return Promise.resolve(null);
              },
              run: () => Promise.resolve({ success: true }),
            }),
          }),
        } as never,
        PUSH_KMS: {
          encryptEnvelope: () => ({ ciphertext: 'c', keyVersion: 'k', fingerprint: 'f' }) as never,
        } as never,
      },
      {
        tenantId: 'tenant-a',
        userId: 'user-a',
        branchId: 'branch-a',
        role,
        terminalSessionId: 'session-a',
      },
      {
        purpose,
        provider: 'WEB_PUSH',
        encryptedRegistration: webRegistration,
        consentPolicyVersion: 's45-v1',
      },
    );
    expect(response.status).toBe(status);
  });

  it('derives tenant/user/branch from auth and rejects forged ownership', async () => {
    const response = await subscribePushDeviceHttp(
      {
        FEATURE_MOBILE_PUSH: '1',
        FEATURE_CLIENT_MOBILE_POS: '1',
        DB: {
          prepare: (sql: string) => ({
            bind: () => ({
              first: () =>
                Promise.resolve(
                  sql.includes('tenant_capabilities')
                    ? { enabled: 1 }
                    : sql.includes('push_consents')
                      ? { id: 'consent-forged', device_fingerprint: 'df' }
                      : null,
                ),
              run: () => Promise.resolve({ success: true }),
            }),
          }),
        } as never,
        PUSH_KMS: {
          encryptEnvelope: () => ({ ciphertext: 'c', keyVersion: 'k', fingerprint: 'f' }) as never,
        } as never,
      },
      {
        tenantId: 'tenant-a',
        userId: 'owner-a',
        branchId: 'branch-a',
        role: 'owner',
        terminalSessionId: null,
      },
      {
        tenantId: 'tenant-b',
        userId: 'owner-b',
        branchId: 'branch-b',
        purpose: 'OWNER_ALERTS',
        provider: 'FCM_HTTP_V1',
        encryptedRegistration: 'opaque-fcm-registration-token',
        consentPolicyVersion: 's45-v1',
      },
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      branchId: 'branch-a',
    });
  });

  it('fails closed for revoked terminal sessions and missing ACK verifier', async () => {
    await expect(
      revokePushDeviceHttp(
        { FEATURE_MOBILE_PUSH: '1' },
        {
          tenantId: 'tenant-a',
          userId: 'cashier-a',
          branchId: 'branch-a',
          role: 'cashier',
          terminalSessionId: 'revoked-session',
        },
        { subscriptionId: 'subscription-a' },
      ),
    ).resolves.toMatchObject({ status: 503, body: { code: 'REVOCATION_UNAVAILABLE' } });

    const ack = {
      receipt: 'opaque-signed-receipt',
      deliveryId: 'delivery-a',
      displayedAt: '2026-08-08T20:00:01.000Z',
    };
    await expect(
      acknowledgeDisplayedHttp(
        { FEATURE_MOBILE_PUSH: '1' },
        { tenantId: 'tenant-a', userId: 'owner-a' },
        ack,
      ),
    ).resolves.toMatchObject({
      status: 503,
      body: { code: 'PUSH_ACK_VERIFIER_UNAVAILABLE' },
    });
  });

  it('covers consent, rotation, privacy, listing, test-send, and deep-link fail-closed paths', async () => {
    const env = { FEATURE_MOBILE_PUSH: '1', FEATURE_CLIENT_MOBILE_POS: '1' };
    const owner = {
      tenantId: 'tenant-routes',
      userId: 'owner-routes',
      branchId: 'branch-routes',
      role: 'owner',
      deviceFingerprint: 'device-routes',
    };
    const cashier = {
      ...owner,
      role: 'cashier',
      terminalSessionId: 'session-routes',
    };
    expect(isOwnerPushAliasEnabled({ ...env, FEATURE_OWNER_PUSH: '1' })).toBe(true);
    expect(isOwnerPushAliasEnabled(env)).toBe(false);
    await expect(grantPushConsentHttp(env, owner, {})).resolves.toMatchObject({
      status: 400,
      body: { code: 'PUSH_PURPOSE_INVALID' },
    });
    const grant = await grantPushConsentHttp(env, owner, {
      purpose: 'OWNER_ALERTS',
      policyVersion: 's45-v1',
      privacyMode: 'AMOUNTS',
      ownerAmountsOptIn: true,
    });
    expect(grant).toMatchObject({
      status: 503,
      body: { code: 'PUSH_D1_UNAVAILABLE' },
    });
    await expect(
      revokePushConsentHttp(env, owner, { purpose: 'OWNER_ALERTS' }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(
      revokePushConsentHttp(env, owner, {
        purpose: 'OWNER_ALERTS',
        consentId: 'consent-routes',
      }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(rotatePushDeviceHttp(env, cashier, {})).resolves.toMatchObject({ status: 400 });
    await expect(
      rotatePushDeviceHttp(env, cashier, {
        subscriptionId: 'subscription-routes',
        encryptedRegistration: 'cipher-routes',
      }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(listPushDevicesHttp(env, owner)).resolves.toMatchObject({
      status: 503,
      body: { code: 'PUSH_D1_UNAVAILABLE' },
    });
    await expect(updatePushPrivacyHttp(env, owner, {})).resolves.toMatchObject({ status: 400 });
    await expect(
      updatePushPrivacyHttp(env, owner, {
        consentId: 'consent-routes',
        purpose: 'OWNER_ALERTS',
        privacyMode: 'REDACTED',
      }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(sendTestPushHttp(env, owner, { purpose: 'OWNER_ALERTS' })).resolves.toEqual({
      status: 503,
      body: { code: 'PUSH_D1_UNAVAILABLE' },
    });
    await expect(acknowledgeDisplayedHttp(env, owner, {})).resolves.toEqual({
      status: 400,
      body: { code: 'PUSH_ACK_INVALID' },
    });
    expect(resolvePushDeepLink({ kind: 'customer_order', entityId: 'order_2A-9' })).toBe(
      '/orders/customer?alert=order_2A-9',
    );
    expect(resolvePushDeepLink({ kind: 'cash_close', entityId: 'c1' })).toBe('/caja?alert=c1');
    expect(resolvePushDeepLink({ kind: 'cash_discrepancy', entityId: 'c2' })).toBe(
      '/caja?alert=c2',
    );
    expect(resolvePushDeepLink({ kind: 'inventory', entityId: 'inv1' })).toBe(
      '/owner/stock?alert=inv1',
    );
    expect(resolvePushDeepLink({ kind: 'installment', entityId: 'inst1' })).toBe(
      '/caja/cuotas?alert=inst1',
    );
    expect(resolvePushDeepLink({ kind: 'accounts_receivable', entityId: 'ar1' })).toBe(
      '/ledger/receivables?alert=ar1',
    );
    expect(resolvePushDeepLink({ kind: 'recurring_sale', entityId: 'rs1' })).toBe(
      '/admin/membresias?alert=rs1',
    );
    expect(resolvePushDeepLink({ kind: 'billing', entityId: 'b1' })).toBe(
      '/settings/billing?alert=b1',
    );
    expect(resolvePushDeepLink({ kind: 'unknown', entityId: 'opaque' })).toBeNull();
    expect(resolvePushDeepLink({ kind: 'cash_close', entityId: '../escape' })).toBeNull();

    // Additional coverage for grant, update, subscribe, revoke, test-send routes
    await expect(
      grantPushConsentHttp(env, owner, {
        purpose: 'OWNER_ALERTS',
        policyVersion: 's45-v1',
        deviceFingerprint: 'df-1',
      }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(
      updatePushPrivacyHttp(env, owner, {
        consentId: 'c1',
        purpose: 'OWNER_ALERTS',
        privacyMode: 'AMOUNTS',
        ownerAmountsOptIn: true,
      }),
    ).resolves.toMatchObject({ status: 503, body: { code: 'PUSH_D1_UNAVAILABLE' } });
    await expect(
      subscribePushDeviceHttp(env, owner, { purpose: 'INVALID' }),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      subscribePushDeviceHttp(env, owner, {
        purpose: 'OWNER_ALERTS',
        provider: 'INVALID',
        encryptedRegistration: 'reg',
        consentPolicyVersion: 'v1',
      }),
    ).resolves.toMatchObject({ status: 400 });
    await expect(revokePushConsentHttp(env, owner, { purpose: 'INVALID' })).resolves.toMatchObject({
      status: 400,
    });
    await expect(sendTestPushHttp(env, owner, {})).resolves.toMatchObject({ status: 503 });
    await expect(sendTestPushHttp(env, owner, { purpose: 'INVALID' })).resolves.toMatchObject({
      status: 503,
    });
  });
});
