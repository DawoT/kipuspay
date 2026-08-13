import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  acknowledgeDisplayedHttp,
  getPushPrivacyPolicyHttp,
  grantPushConsentHttp,
  listPushDevicesHttp,
  revokePushConsentHttp,
  revokePushDeviceHttp,
  rotatePushDeviceHttp,
  sendTestPushHttp,
  subscribePushDeviceHttp,
  updatePushPrivacyHttp,
  updatePushPrivacyPolicyHttp,
  type PushActor,
} from './mobile-push-routes.js';

const adapters = vi.hoisted(() => ({
  acknowledgePushDeliveryAtomic: vi.fn(),
  appendPushEventAtomic: vi.fn(),
  revokePushConsentAtomic: vi.fn(),
}));
vi.mock('@kipuspay/adapters-d1', () => adapters);

interface RouteDbOptions {
  readonly capability?: number;
  readonly clientCapability?: number;
  readonly terminal?: Record<string, unknown> | null;
  readonly privacy?: Record<string, unknown> | null;
  readonly consent?: Record<string, unknown> | null;
  readonly subscription?: Record<string, unknown> | null;
  readonly ackRow?: Record<string, unknown> | null;
  readonly devices?: readonly Record<string, unknown>[];
  readonly changes?: number;
  readonly rejectCapability?: boolean;
}

interface RecordedQuery {
  readonly sql: string;
  readonly bindings: readonly unknown[];
}

function resolveMockQueryResultA<T>(
  sql: string,
  bindings: readonly unknown[],
  options: RouteDbOptions,
): T | null {
  if (sql.includes('tenant_capabilities')) {
    if (options.rejectCapability) throw new Error('D1 unavailable');
    const bindingVal = bindings[1];
    const requested = typeof bindingVal === 'string' ? bindingVal : '';
    return {
      enabled:
        requested === 'client.mobile_pos'
          ? (options.clientCapability ?? 1)
          : (options.capability ?? 1),
    } as T;
  }
  if (sql.includes('pos_terminal_sessions')) {
    return (
      options.terminal === undefined
        ? { id: 'session-a', terminal_id: 'terminal-a', branch_id: 'branch-a' }
        : options.terminal
    ) as T | null;
  }
  if (sql.includes('push_privacy_settings')) {
    return (
      options.privacy === undefined
        ? { amounts_enabled: 1, policy_version: 's45-v1' }
        : options.privacy
    ) as T | null;
  }
  return null;
}

function resolveMockQueryResult<T>(
  sql: string,
  bindings: readonly unknown[],
  options: RouteDbOptions,
): T | null {
  const resultA = resolveMockQueryResultA<T>(sql, bindings, options);
  if (resultA) return resultA;
  if (sql.includes('FROM push_consents')) {
    return (
      options.consent === undefined
        ? { id: 'consent-a', device_fingerprint: 'device-a' }
        : options.consent
    ) as T | null;
  }
  if (sql.includes('SELECT provider FROM push_subscriptions')) {
    return (
      options.subscription === undefined ? { provider: 'FCM_HTTP_V1' } : options.subscription
    ) as T | null;
  }
  if (sql.includes('FROM push_deliveries d')) {
    return (options.ackRow ?? null) as T | null;
  }
  return null;
}

function routeEnv(options: RouteDbOptions = {}) {
  const queries: RecordedQuery[] = [];
  const prepare = vi.fn((sql: string) => {
    const bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        bindings.push(...values);
        queries.push({ sql, bindings });
        return statement;
      },
      first<T>() {
        return Promise.resolve(resolveMockQueryResult<T>(sql, bindings, options));
      },
      all<T>() {
        return Promise.resolve({ results: (options.devices ?? []) as T[] });
      },
      run<T>() {
        return Promise.resolve({
          success: true,
          meta: { changes: options.changes ?? 1 },
          results: [],
        } as T);
      },
    };
    return statement;
  });
  const encryptEnvelope = vi.fn(
    ({ purpose }: { purpose: 'ENDPOINT_TOKEN' | 'WEB_PUSH_CREDENTIAL' }) =>
      Promise.resolve({
        ciphertext: `cipher-${purpose}`,
        keyVersion: 'kms-v1',
        fingerprint: `fingerprint-${purpose}`,
      }),
  );
  const verifyAckReceipt = vi.fn();
  const env = {
    FEATURE_MOBILE_PUSH: '1',
    FEATURE_CLIENT_MOBILE_POS: '1',
    PUSH_VAPID_PUBLIC_KEY: 'vapid-public',
    DB: { prepare },
    PUSH_KMS: { encryptEnvelope, verifyAckReceipt },
  } as unknown as WorkerEnv;
  return { env, prepare, queries, encryptEnvelope, verifyAckReceipt };
}

const owner: PushActor = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  branchId: 'branch-a',
  role: 'owner',
  deviceFingerprint: 'device-a',
};

const cashier: PushActor = {
  tenantId: 'tenant-a',
  userId: 'cashier-a',
  branchId: 'branch-a',
  role: 'cashier',
  terminalSessionId: 'session-a',
};

const webRegistration = JSON.stringify({
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/opaque',
  keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
});

describe('mobile push route persistence and authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.appendPushEventAtomic.mockResolvedValue({ eventId: 'event-a', created: true });
    adapters.acknowledgePushDeliveryAtomic.mockResolvedValue({ displayed: true, replay: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails closed when capability or terminal-session authorization is unavailable', async () => {
    const capabilityOff = routeEnv({ capability: 0 });
    await expect(listPushDevicesHttp(capabilityOff.env, owner)).resolves.toMatchObject({
      status: 403,
      body: { code: 'PUSH_SCOPE_FORBIDDEN' },
    });

    const noTerminal = routeEnv({ terminal: null });
    await expect(listPushDevicesHttp(noTerminal.env, cashier)).resolves.toMatchObject({
      status: 503,
      body: { code: 'TERMINAL_SESSION_UNAVAILABLE' },
    });

    const d1Failure = routeEnv({ rejectCapability: true });
    await expect(listPushDevicesHttp(d1Failure.env, owner)).resolves.toMatchObject({
      status: 503,
      body: { code: 'REVOCATION_UNAVAILABLE' },
    });
  });

  it('encrypts and persists a browser subscription without trusting body ownership fields', async () => {
    const fixture = routeEnv();
    const response = await subscribePushDeviceHttp(fixture.env, owner, {
      tenantId: 'tenant-attacker',
      userId: 'user-attacker',
      purpose: 'OWNER_ALERTS',
      provider: 'WEB_PUSH',
      encryptedRegistration: webRegistration,
      consentPolicyVersion: 's45-v1',
    });

    expect(response).toMatchObject({
      status: 201,
      body: { tenantId: 'tenant-a', userId: 'owner-a', branchId: 'branch-a' },
    });
    expect(fixture.encryptEnvelope).toHaveBeenCalledTimes(2);
    expect(fixture.encryptEnvelope).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: 'tenant-a', purpose: 'ENDPOINT_TOKEN' }),
    );
    const insert = fixture.queries.find(({ sql }) =>
      sql.includes('INSERT INTO push_subscriptions'),
    );
    expect(insert?.bindings).toEqual(
      expect.arrayContaining(['tenant-a', 'owner-a', 'consent-a', 'WEB_PUSH', 'kms-v1']),
    );
    expect(insert?.bindings).not.toContain('tenant-attacker');
  });

  it('rejects subscription creation without active consent or available envelope encryption', async () => {
    const noConsent = routeEnv({ consent: null });
    await expect(
      subscribePushDeviceHttp(noConsent.env, owner, {
        purpose: 'OWNER_ALERTS',
        provider: 'FCM_HTTP_V1',
        encryptedRegistration: 'opaque-fcm-token',
        consentPolicyVersion: 's45-v1',
      }),
    ).resolves.toMatchObject({ status: 403 });

    const kmsFailure = routeEnv();
    kmsFailure.encryptEnvelope.mockRejectedValueOnce(new Error('KMS unavailable'));
    await expect(
      subscribePushDeviceHttp(kmsFailure.env, owner, {
        purpose: 'OWNER_ALERTS',
        provider: 'FCM_HTTP_V1',
        encryptedRegistration: 'opaque-fcm-token',
        consentPolicyVersion: 's45-v1',
      }),
    ).resolves.toEqual({ status: 503, body: { code: 'PUSH_KMS_UNAVAILABLE' } });
  });

  it('derives operational consent identity from the active terminal session', async () => {
    const fixture = routeEnv();
    const response = await grantPushConsentHttp(fixture.env, cashier, {
      purpose: 'OPERATIONAL_MOBILE',
      policyVersion: 's45-v1',
      privacyMode: 'REDACTED',
    });

    expect(response).toMatchObject({
      status: 201,
      body: { purpose: 'OPERATIONAL_MOBILE', privacyMode: 'REDACTED' },
    });
    const insert = fixture.queries.find(({ sql }) => sql.includes('INSERT INTO push_consents'));
    expect(insert?.bindings).toContain('terminal-session:session-a');
  });

  it('reads and updates owner privacy policy while enforcing bounded policy versions', async () => {
    const fixture = routeEnv({ privacy: { amounts_enabled: 1, policy_version: 's45-v2' } });
    await expect(getPushPrivacyPolicyHttp(fixture.env, owner)).resolves.toEqual({
      status: 200,
      body: {
        amountsEnabled: true,
        policyVersion: 's45-v2',
        vapidPublicKey: 'vapid-public',
      },
    });
    await expect(
      updatePushPrivacyPolicyHttp(fixture.env, owner, {
        amountsEnabled: false,
        policyVersion: 'x'.repeat(65),
      }),
    ).resolves.toEqual({ status: 400, body: { code: 'PUSH_POLICY_INVALID' } });
    await expect(
      updatePushPrivacyPolicyHttp(fixture.env, owner, {
        amountsEnabled: false,
        policyVersion: 's45-v3',
      }),
    ).resolves.toEqual({
      status: 200,
      body: { amountsEnabled: false, policyVersion: 's45-v3' },
    });
    expect(
      fixture.queries.some(({ sql }) => sql.includes('INSERT INTO push_privacy_settings')),
    ).toBe(true);
  });

  it('lists, rotates, revokes, updates privacy, and queues test pushes in verified scope', async () => {
    const fixture = routeEnv({
      devices: [{ id: 'subscription-a', provider: 'FCM_HTTP_V1', status: 'ACTIVE' }],
    });
    await expect(listPushDevicesHttp(fixture.env, owner)).resolves.toMatchObject({
      status: 200,
      body: { devices: [{ id: 'subscription-a', status: 'ACTIVE' }] },
    });
    await expect(
      rotatePushDeviceHttp(fixture.env, cashier, {
        subscriptionId: 'subscription-a',
        encryptedRegistration: 'rotated-fcm-token',
      }),
    ).resolves.toEqual({
      status: 200,
      body: { id: 'subscription-a', rotated: true },
    });
    await expect(
      revokePushDeviceHttp(fixture.env, cashier, { subscriptionId: 'subscription-a' }),
    ).resolves.toEqual({ status: 204, body: {} });
    await expect(
      updatePushPrivacyHttp(fixture.env, owner, {
        consentId: 'consent-a',
        purpose: 'OWNER_ALERTS',
        privacyMode: 'AMOUNTS',
        ownerAmountsOptIn: true,
      }),
    ).resolves.toEqual({ status: 200, body: { privacyMode: 'AMOUNTS' } });
    await expect(
      sendTestPushHttp(fixture.env, cashier, { purpose: 'OPERATIONAL_MOBILE' }),
    ).resolves.toEqual({ status: 202, body: { queued: true } });
    expect(adapters.appendPushEventAtomic).toHaveBeenCalledWith(
      fixture.env.DB,
      expect.objectContaining({
        tenantId: 'tenant-a',
        targetBranchId: 'branch-a',
        eventType: 'INVENTORY_STOCKOUT',
      }),
    );
  });
});

describe('mobile push displayed acknowledgement', () => {
  const nowMs = Date.parse('2026-08-08T20:00:00.000Z');
  const receipt = 'header.signature';
  const deliveryId = 'delivery-a';
  const claims = {
    tenantId: 'tenant-a',
    userId: 'cashier-a',
    deliveryId,
    subscriptionId: 'subscription-a',
    deviceFingerprint: 'device-a',
    issuedAtSeconds: nowMs / 1000,
    expiresAtSeconds: nowMs / 1000 + 300,
    nonce: 'nonce-a',
  };
  const ackRow = {
    id: deliveryId,
    ack_receipt_hash: 'stored-hash',
    ack_expires_at: new Date(nowMs + 300_000).toISOString(),
    ack_consumed_at: null,
    subscription_id: 'subscription-a',
    user_id: 'cashier-a',
    device_fingerprint: 'device-a',
    branch_id: 'branch-a',
    terminal_id: 'terminal-a',
    purpose: 'OPERATIONAL_MOBILE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    adapters.acknowledgePushDeliveryAtomic.mockResolvedValue({ displayed: true, replay: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function ackBody(displayedAt = new Date(nowMs).toISOString()) {
    return { receipt, deliveryId, displayedAt };
  }

  it('maps verifier expiry and unknown verifier errors without querying delivery state', async () => {
    const expired = routeEnv();
    expired.verifyAckReceipt.mockRejectedValueOnce(new Error('PUSH_ACK_EXPIRED'));
    await expect(acknowledgeDisplayedHttp(expired.env, cashier, ackBody())).resolves.toEqual({
      status: 410,
      body: { code: 'PUSH_ACK_EXPIRED' },
    });
    expect(expired.prepare).not.toHaveBeenCalled();

    const malformed = routeEnv();
    malformed.verifyAckReceipt.mockRejectedValueOnce(new Error('provider internals'));
    await expect(acknowledgeDisplayedHttp(malformed.env, cashier, ackBody())).resolves.toEqual({
      status: 403,
      body: { code: 'PUSH_ACK_INVALID' },
    });
  });

  it('rejects receipt scope mismatches and replayed receipts before the atomic ACK', async () => {
    const scopeMismatch = routeEnv({ ackRow: { ...ackRow, subscription_id: 'other-device' } });
    scopeMismatch.verifyAckReceipt.mockResolvedValue(claims);
    await expect(acknowledgeDisplayedHttp(scopeMismatch.env, cashier, ackBody())).resolves.toEqual({
      status: 403,
      body: { code: 'PUSH_ACK_SCOPE_MISMATCH' },
    });

    const replay = routeEnv({
      ackRow: { ...ackRow, ack_consumed_at: new Date(nowMs).toISOString() },
    });
    replay.verifyAckReceipt.mockResolvedValue(claims);
    await expect(acknowledgeDisplayedHttp(replay.env, cashier, ackBody())).resolves.toEqual({
      status: 409,
      body: { code: 'PUSH_ACK_REPLAY' },
    });
    expect(adapters.acknowledgePushDeliveryAtomic).not.toHaveBeenCalled();
  });

  it('rejects stale display timestamps and terminal-session drift', async () => {
    const stale = routeEnv({ ackRow });
    stale.verifyAckReceipt.mockResolvedValue(claims);
    await expect(
      acknowledgeDisplayedHttp(
        stale.env,
        cashier,
        ackBody(new Date(nowMs - 300_001).toISOString()),
      ),
    ).resolves.toEqual({ status: 410, body: { code: 'PUSH_ACK_EXPIRED' } });

    const movedTerminal = routeEnv({
      ackRow,
      terminal: { id: 'session-b', terminal_id: 'terminal-b', branch_id: 'branch-a' },
    });
    movedTerminal.verifyAckReceipt.mockResolvedValue(claims);
    await expect(acknowledgeDisplayedHttp(movedTerminal.env, cashier, ackBody())).resolves.toEqual({
      status: 503,
      body: { code: 'TERMINAL_SESSION_UNAVAILABLE' },
    });
  });

  it('atomically records a valid display ACK and maps a concurrent replay', async () => {
    const fixture = routeEnv({ ackRow });
    fixture.verifyAckReceipt.mockResolvedValue(claims);
    await expect(acknowledgeDisplayedHttp(fixture.env, cashier, ackBody())).resolves.toEqual({
      status: 204,
      body: {},
    });
    expect(adapters.acknowledgePushDeliveryAtomic).toHaveBeenCalledWith(
      fixture.env.DB,
      expect.objectContaining({
        tenantId: 'tenant-a',
        deliveryId,
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        displayContext: 'NORMAL',
      }),
    );

    adapters.acknowledgePushDeliveryAtomic.mockResolvedValueOnce({
      displayed: false,
      replay: true,
    });
    await expect(acknowledgeDisplayedHttp(fixture.env, cashier, ackBody())).resolves.toEqual({
      status: 409,
      body: { code: 'PUSH_ACK_REPLAY' },
    });
  });
});

describe('S45-H1: push fail-closed sin DB', () => {
  it('grant/subscribe/revoke/list/privacy sin DB → 503 (invariante 5)', async () => {
    const noDb = {
      FEATURE_MOBILE_PUSH: '1',
      FEATURE_CLIENT_MOBILE_POS: '1',
    } as unknown as WorkerEnv;
    const grant = await grantPushConsentHttp(noDb, owner, {
      purpose: 'OWNER_ALERTS',
      policyVersion: 'v1',
      privacyMode: 'REDACTED',
    });
    expect(grant.status).toBe(503);
    const subscribe = await subscribePushDeviceHttp(noDb, owner, {
      purpose: 'OWNER_ALERTS',
      provider: 'WEB_PUSH',
      encryptedRegistration: JSON.stringify({
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/opaque',
        keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
      }),
      consentPolicyVersion: 'v1',
    });
    expect(subscribe.status).toBe(503);
    const revoke = await revokePushConsentHttp(noDb, owner, {
      purpose: 'OWNER_ALERTS',
      consentId: 'consent-a',
    });
    expect(revoke.status).toBe(503);
    const revokeDevice = await revokePushDeviceHttp(noDb, owner, {
      subscriptionId: 'subscription-a',
    });
    expect(revokeDevice.status).toBe(503);
    const list = await listPushDevicesHttp(noDb, owner);
    expect(list.status).toBe(503);
    const privacy = await updatePushPrivacyHttp(noDb, owner, {
      purpose: 'OWNER_ALERTS',
      consentId: 'consent-a',
      privacyMode: 'REDACTED',
    });
    expect(privacy.status).toBe(503);
  });
});

describe('S45-H3: re-grant de consentimiento idempotente', () => {
  it('UNIQUE violado en el 2º grant → 200 (jamás 500)', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed: push_consents'));
    const env2 = {
      FEATURE_MOBILE_PUSH: '1',
      FEATURE_CLIENT_MOBILE_POS: '1',
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            run,
            first: () =>
              Promise.resolve(
                sql.includes('tenant_capabilities') ? { enabled: 1 } : null,
              ),
          }),
        }),
      },
    } as unknown as WorkerEnv;
    const first = await grantPushConsentHttp(env2, owner, {
      purpose: 'OWNER_ALERTS',
      policyVersion: 'v1',
      privacyMode: 'REDACTED',
    });
    expect(first.status).toBe(201);
    const regrant = await grantPushConsentHttp(env2, owner, {
      purpose: 'OWNER_ALERTS',
      policyVersion: 'v1',
      privacyMode: 'REDACTED',
    });
    expect(regrant.status).toBe(200);
  });
});

