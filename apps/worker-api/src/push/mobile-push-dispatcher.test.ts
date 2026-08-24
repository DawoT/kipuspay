import type { ClaimedPushDelivery } from '@kipuspay/adapters-d1';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
// @ts-expect-error -- Vite raw source import is supported by Vitest.
import dispatcherSource from './mobile-push-dispatcher.ts?raw';
import {
  INLINE_MAX_DELIVERIES,
  computePushRetryDelaySeconds,
  dispatchPushNow,
  isInlinePushDispatchEnabled,
  pushDeliveryObservation,
  runMobilePushDispatcher,
  sanitizeProviderResult,
} from './mobile-push-dispatcher.js';

const adapters = vi.hoisted(() => ({ claimPushDeliveries: vi.fn() }));
vi.mock('@kipuspay/adapters-d1', () => adapters);

interface RecordedStatement {
  readonly sql: string;
  readonly bindings: readonly unknown[];
}

function delivery(
  id: string,
  provider: ClaimedPushDelivery['provider'],
  attemptCount = 0,
): ClaimedPushDelivery {
  return {
    id,
    tenantId: 'tenant-a',
    eventId: `event-${id}`,
    subscriptionId: `subscription-${id}`,
    provider,
    attemptCount,
    ttlSeconds: 120,
    collapseKey: `collapse-${id}`,
  };
}

function dispatcherEnv(contexts: Readonly<Record<string, Record<string, unknown> | null>>) {
  const batches: RecordedStatement[][] = [];
  const prepare = vi.fn((sql: string) => {
    const statement: RecordedStatement & {
      bind(...args: unknown[]): typeof statement;
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
    } = {
      sql,
      bindings: [],
      bind(...args: unknown[]) {
        (statement.bindings as unknown[]).push(...args);
        return statement;
      },
      all<T>() {
        return Promise.resolve({ results: [{ tenant_id: 'tenant-a' } as T] });
      },
      first<T>() {
        const firstArg = statement.bindings[0];
        const id = typeof firstArg === 'string' ? firstArg : '';
        return Promise.resolve((contexts[id] ?? null) as T | null);
      },
    };
    return statement;
  });
  const sendWebPush = vi.fn();
  const sendFcm = vi.fn();
  const issueAckReceipt = vi.fn(({ deliveryId }: { deliveryId: string }) =>
    Promise.resolve({
      token: `receipt-${deliveryId}`,
      receiptHash: `hash-${deliveryId}`,
      keyVersion: 'ack-v1',
    }),
  );
  const env = {
    FEATURE_MOBILE_PUSH: '1',
    DB: {
      prepare,
      batch: vi.fn((statements: RecordedStatement[]) => {
        batches.push(statements);
        return Promise.resolve([]);
      }),
    },
    PUSH_KMS: { sendWebPush, sendFcm, issueAckReceipt },
  } as unknown as WorkerEnv;
  return { env, batches, sendWebPush, sendFcm, issueAckReceipt };
}

function context(id: string, expiresAt = '2026-08-08T20:10:00.000Z') {
  return {
    id,
    tenant_id: 'tenant-a',
    subscription_id: `subscription-${id}`,
    user_id: 'user-a',
    device_fingerprint: 'device-a',
    provider: id.startsWith('fcm') ? 'FCM_HTTP_V1' : 'WEB_PUSH',
    endpoint_token_ciphertext: `cipher-${id}`,
    credential_ciphertext: null,
    encryption_key_version: 'kms-v1',
    event_type: 'CASH_CLOSE',
    amount_cents: 12_500,
    deep_link_kind: 'cash_close',
    deep_link_entity_id: 'close-a',
    expires_at: expiresAt,
    privacy_mode: 'AMOUNTS',
    tenant_amounts_policy_enabled: 1,
    owner_amounts_opt_in: 1,
    role: 'owner',
  };
}

describe('Sprint 45 push dispatcher policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('discovers tenants from actionable deliveries, not only live events (drill D1-i)', () => {
    const discovery = dispatcherSource.slice(
      dispatcherSource.indexOf('SELECT DISTINCT tenant_id FROM ('),
      dispatcherSource.indexOf('ORDER BY tenant_id LIMIT'),
    );
    expect(discovery).toContain('FROM push_deliveries');
    expect(discovery).toContain("d.status = 'LEASED' AND d.lease_expires_at <= ?");
    expect(dispatcherSource).toContain('push_ack_receipt_failed');
  });

  it('survives an ack-receipt RPC failure and marks the delivery RETRY with failure_reason', async () => {
    const receiptFailed = delivery('web-ack-fail', 'WEB_PUSH');
    const next = delivery('web-after-fail', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [receiptFailed, next],
      hasMore: false,
    });
    const fixture = dispatcherEnv({
      [receiptFailed.id]: context(receiptFailed.id),
      [next.id]: context(next.id),
    });
    fixture.issueAckReceipt.mockRejectedValueOnce(new Error('RPC disconnected'));
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'ACCEPTED',
      responseCode: '201',
      providerMessageIdHash: 'provider-web-2',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        runMobilePushDispatcher(fixture.env, {
          scheduledTime: Date.parse('2026-08-08T20:00:00.000Z'),
        }),
      ).resolves.toMatchObject({ claimed: 2, retry: 1, accepted: 1 });
      expect(fixture.issueAckReceipt).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"push_ack_receipt_failed"'),
      );
      expect(warnSpy.mock.calls[0]?.[0]).toContain('ACK_RECEIPT_ERROR:RPC disconnected');
      const completion = fixture.batches.find((batch) =>
        batch.some(
          ({ sql }) =>
            sql.includes('UPDATE push_deliveries') && !sql.includes('push_subscriptions'),
        ),
      );
      expect(completion?.[0]?.bindings[0]).toBe('RETRY');
      expect(completion?.[0]?.bindings).toContain('ACK_RECEIPT_ERROR:RPC disconnected');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('persists the send failure reason and warns structurally instead of swallowing it', async () => {
    const failing = delivery('web-send-boom', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [failing],
      hasMore: false,
    });
    const fixture = dispatcherEnv({ [failing.id]: context(failing.id) });
    fixture.sendWebPush.mockRejectedValue(new Error('PUSH_SECRET_REFERENCE_INVALID'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        runMobilePushDispatcher(fixture.env, {
          scheduledTime: Date.parse('2026-08-08T20:00:00.000Z'),
        }),
      ).resolves.toMatchObject({ claimed: 1, retry: 1 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"push_send_failed"'));
      const logged = JSON.parse(String(warnSpy.mock.calls[0]?.[0])) as {
        tenantId: string;
        deliveryId: string;
        reason: string;
      };
      expect(logged).toMatchObject({
        tenantId: 'tenant-a',
        deliveryId: failing.id,
        reason: 'SEND_ERROR:PUSH_SECRET_REFERENCE_INVALID',
      });
      const completion = fixture.batches.find((batch) =>
        batch.some(({ sql }) => sql.includes('UPDATE push_deliveries')),
      );
      expect(completion?.[0]?.bindings).toContain('SEND_ERROR:PUSH_SECRET_REFERENCE_INVALID');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('materializes, claims, and completes accepted Web Push and retried FCM deliveries', async () => {
    const accepted = delivery('web-accepted', 'WEB_PUSH');
    const retried = delivery('fcm-retry', 'FCM_HTTP_V1', 2);
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [accepted, retried],
      hasMore: false,
    });
    const fixture = dispatcherEnv({
      [accepted.id]: context(accepted.id),
      [retried.id]: context(retried.id),
    });
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'ACCEPTED',
      responseCode: '201',
      providerMessageIdHash: 'provider-web-1',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    });
    fixture.sendFcm.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      runMobilePushDispatcher(fixture.env, {
        scheduledTime: Date.parse('2026-08-08T20:00:00.000Z'),
        pageSize: 500,
      }),
    ).resolves.toEqual({ tenants: 1, claimed: 2, accepted: 1, retry: 1, failed: 0 });

    expect(adapters.claimPushDeliveries).toHaveBeenCalledWith(
      fixture.env.DB,
      expect.objectContaining({ tenantId: 'tenant-a', limit: 100 }),
    );
    expect(fixture.sendWebPush).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedSubscription: 'cipher-web-accepted',
        payload: expect.objectContaining({
          deliveryId: 'web-accepted',
          receipt: 'receipt-web-accepted',
        }) as unknown,
      }),
    );
    // El wire payload debe ajustarse al allowlist estricto del transporte
    // (validatePayload en worker-kms): eventType jamás viaja (PUSH_PAYLOAD_NOT_ALLOWED).
    const wirePayload = (
      fixture.sendWebPush.mock.calls[0]?.[0] as {
        payload: Record<string, unknown>;
      }
    ).payload;
    expect(Object.keys(wirePayload).sort()).toEqual([
      'amount_cents',
      'body',
      'deepLink',
      'deliveryId',
      'receipt',
      'title',
    ]);
    expect(fixture.sendFcm).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedToken: 'cipher-fcm-retry' }),
    );
    const completions = fixture.batches.filter((batch) =>
      batch.some(({ sql }) => sql.includes('UPDATE push_deliveries')),
    );
    expect(completions.map((batch) => batch[0]?.bindings[0])).toEqual(['ACCEPTED', 'RETRY']);
    expect(completions[0]?.[0]?.bindings).toContain('hash-web-accepted');
    expect(completions[1]?.[0]?.bindings).toContain('NETWORK_ERROR');
  });

  it.each([
    ['404', 'FAILED'],
    ['410', 'FAILED'],
  ] as const)('invalidates a subscription after provider HTTP %s', async (responseCode, status) => {
    const claimed = delivery(`web-${responseCode}`, 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [claimed],
      hasMore: false,
    });
    const fixture = dispatcherEnv({ [claimed.id]: context(claimed.id) });
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'INVALID',
      responseCode,
      providerMessageIdHash: '',
      retryAfterSeconds: null,
      invalidateSubscription: true,
    });

    await expect(
      runMobilePushDispatcher(fixture.env, {
        scheduledTime: Date.parse('2026-08-08T20:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ claimed: 1, failed: 1 });

    const completion = fixture.batches.find((batch) =>
      batch.some(({ sql }) => sql.includes('UPDATE push_deliveries')),
    );
    expect(completion).toHaveLength(2);
    expect(completion?.[0]?.bindings[0]).toBe(status);
    expect(completion?.[1]?.sql).toContain("SET status = 'INVALID'");
  });

  it('expires an elapsed lease result and skips a lease whose context is no longer active', async () => {
    const expired = delivery('web-expired', 'WEB_PUSH');
    const staleLease = delivery('web-stale-lease', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [expired, staleLease],
      hasMore: true,
    });
    adapters.claimPushDeliveries.mockResolvedValueOnce({ deliveries: [], hasMore: false });
    const fixture = dispatcherEnv({
      [expired.id]: context(expired.id, '2026-08-08T19:59:59.000Z'),
      [staleLease.id]: null,
    });
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'FAILED',
      responseCode: '503',
      providerMessageIdHash: '',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    });

    await expect(
      runMobilePushDispatcher(fixture.env, {
        scheduledTime: Date.parse('2026-08-08T20:00:00.000Z'),
      }),
    ).resolves.toEqual({ tenants: 1, claimed: 2, accepted: 0, retry: 0, failed: 1 });

    expect(adapters.claimPushDeliveries).toHaveBeenCalledTimes(2);
    expect(fixture.issueAckReceipt).toHaveBeenCalledTimes(1);
    const completion = fixture.batches.find((batch) =>
      batch.some(({ sql }) => sql.includes('UPDATE push_deliveries')),
    );
    expect(completion?.[0]?.bindings[0]).toBe('EXPIRED');
    expect(completion?.[0]?.bindings).toContain('TTL_EXPIRED');
  });
});

describe('ADR-0036 inline dispatch (dispatchPushNow)', () => {
  const NOW = Date.parse('2026-08-08T20:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T-flag: gates inline dispatch behind FEATURE_PUSH_INLINE_DISPATCH strictly "1"', () => {
    expect(isInlinePushDispatchEnabled(undefined)).toBe(false);
    expect(isInlinePushDispatchEnabled({})).toBe(false);
    expect(isInlinePushDispatchEnabled({ FEATURE_PUSH_INLINE_DISPATCH: 'true' })).toBe(false);
    expect(isInlinePushDispatchEnabled({ FEATURE_PUSH_INLINE_DISPATCH: '1' } as WorkerEnv)).toBe(
      true,
    );
  });

  it('T2-contract: dispatches inline scoped to {tenantId, eventId} reusing the single pipeline', async () => {
    const inline = delivery('web-inline-a', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [inline],
      hasMore: false,
    });
    const fixture = dispatcherEnv({ [inline.id]: context(inline.id) });
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'ACCEPTED',
      responseCode: '201',
      providerMessageIdHash: 'provider-inline-1',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    });

    await expect(
      dispatchPushNow(
        fixture.env,
        { tenantId: 'tenant-a', eventId: inline.eventId },
        { nowMs: NOW },
      ),
    ).resolves.toEqual({ claimed: 1, accepted: 1, retry: 0, failed: 0 });

    // T6 DRY: el inline ejercita las funciones exportadas existentes —
    // materializeDeliveries (batch) + claim + dispatchOne; cero SQL duplicado.
    expect(fixture.batches.length).toBeGreaterThan(0);
    expect(adapters.claimPushDeliveries).toHaveBeenCalledWith(
      fixture.env.DB,
      expect.objectContaining({ tenantId: 'tenant-a', eventId: inline.eventId }),
    );
    expect(fixture.sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('T3-cap: caps the inline fan-out at 16 deliveries per invocation', () => {
    expect(INLINE_MAX_DELIVERIES).toBe(16);
  });

  it('T3-cap: requests exactly the fan-out cap from the claim (excedente queda para el cron)', async () => {
    adapters.claimPushDeliveries.mockResolvedValueOnce({ deliveries: [], hasMore: false });
    const fixture = dispatcherEnv({});
    await dispatchPushNow(
      fixture.env,
      { tenantId: 'tenant-a', eventId: 'event-x' },
      { nowMs: NOW },
    );
    expect(adapters.claimPushDeliveries).toHaveBeenCalledWith(
      fixture.env.DB,
      expect.objectContaining({ tenantId: 'tenant-a', eventId: 'event-x', limit: 16 }),
    );
  });

  it('T4-surfaced: persists failure_reason and warns structurally when an inline send fails', async () => {
    const failing = delivery('web-inline-boom', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({
      deliveries: [failing],
      hasMore: false,
    });
    const fixture = dispatcherEnv({ [failing.id]: context(failing.id) });
    fixture.sendWebPush.mockRejectedValue(new Error('KMS_DOWN'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        dispatchPushNow(
          fixture.env,
          { tenantId: 'tenant-a', eventId: failing.eventId },
          { nowMs: NOW },
        ),
      ).resolves.toMatchObject({ claimed: 1, retry: 1 });

      // Drill 2026-08-23: jamás LEASED attempt_count=0 sin razón — la fila
      // completa con failure_reason persistida vía completeDelivery.
      const completion = fixture.batches.find((batch) =>
        batch.some(({ sql }) => sql.includes('UPDATE push_deliveries')),
      );
      expect(completion?.[0]?.bindings[0]).toBe('RETRY');
      expect(completion?.[0]?.bindings).toContain('SEND_ERROR:KMS_DOWN');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"push_send_failed"'));
      expect(warnSpy.mock.calls[0]?.[0]).toContain('SEND_ERROR:KMS_DOWN');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('T4-contained: an inline crash never rejects the waitUntil task and logs push_inline_dispatch_failed', async () => {
    adapters.claimPushDeliveries.mockRejectedValueOnce(new Error('D1_TIMEOUT'));
    const fixture = dispatcherEnv({});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        dispatchPushNow(
          fixture.env,
          { tenantId: 'tenant-a', eventId: 'event-crash' },
          { nowMs: NOW },
        ),
      ).resolves.toEqual({ claimed: 0, accepted: 0, retry: 0, failed: 0 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"push_inline_dispatch_failed"'),
      );
      expect(warnSpy.mock.calls[0]?.[0]).toContain('INLINE_DISPATCH_ERROR:D1_TIMEOUT');
      expect(warnSpy.mock.calls[0]?.[0]).toContain('"eventId":"event-crash"');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('T5-backstop: the cron path stays tenant-wide and ignores the inline flag entirely', async () => {
    const cron = delivery('web-cron-backstop', 'WEB_PUSH');
    adapters.claimPushDeliveries.mockResolvedValueOnce({ deliveries: [cron], hasMore: false });
    const fixture = dispatcherEnv({ [cron.id]: context(cron.id) });
    fixture.env.FEATURE_PUSH_INLINE_DISPATCH = '1';
    fixture.sendWebPush.mockResolvedValue({
      provider: 'WEB_PUSH',
      status: 'ACCEPTED',
      responseCode: '201',
      providerMessageIdHash: 'provider-cron-1',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    });

    await expect(
      runMobilePushDispatcher(fixture.env, { scheduledTime: NOW }),
    ).resolves.toMatchObject({ tenants: 1, claimed: 1, accepted: 1 });

    // El cron NO se acota por evento: discovery dual intacto como red de reintento.
    const claimInput = adapters.claimPushDeliveries.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(claimInput).not.toHaveProperty('eventId');
  });
});
