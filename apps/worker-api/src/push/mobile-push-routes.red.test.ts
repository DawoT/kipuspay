/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- absent Sprint 45 module is the intentional RED boundary */
import { describe, expect, it } from 'vitest';
import {
  acknowledgeDisplayedHttp,
  isClientMobilePosEnabled,
  isMobilePushEnabled,
  revokePushDeviceHttp,
  subscribePushDeviceHttp,
} from './mobile-push-routes.js';

describe('Sprint 45 push API, RBAC, and ACK contract (RED)', () => {
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
        encryptedRegistration: 'ciphertext',
        consentPolicyVersion: 's45-v1',
      },
    );
    expect(response.status).toBe(status);
  });

  it('derives tenant/user/branch from auth and rejects forged ownership', async () => {
    const response = await subscribePushDeviceHttp(
      { FEATURE_MOBILE_PUSH: '1' },
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
        encryptedRegistration: 'ciphertext',
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

  it('fails closed for revoked terminal sessions and consumes valid ACK once', async () => {
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
        { tenantId: 'tenant-a', userId: 'owner-a', deviceFingerprint: 'device-a' },
        ack,
      ),
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      acknowledgeDisplayedHttp(
        { FEATURE_MOBILE_PUSH: '1' },
        { tenantId: 'tenant-a', userId: 'owner-a', deviceFingerprint: 'device-a' },
        ack,
      ),
    ).resolves.toMatchObject({ status: 409, body: { code: 'PUSH_ACK_REPLAY' } });
  });
});
