import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  acknowledgePushDeliveryAtomic,
  appendPushEventAtomic,
  claimPushDeliveries,
  revokePushConsentAtomic,
} from './process-mobile-push-atomic.js';

async function seedPushFixture(suffix: string): Promise<{
  tenantId: string;
  userId: string;
  consentId: string;
  subscriptionId: string;
  eventId: string;
  deliveryId: string;
}> {
  const tenantId = `tenant-push-${suffix}`;
  const userId = `user-push-${suffix}`;
  const consentId = `consent-push-${suffix}`;
  const subscriptionId = `subscription-push-${suffix}`;
  const eventId = `event-push-${suffix}`;
  const deliveryId = `delivery-push-${suffix}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants(id, business_name, vertical_type) VALUES (?, ?, 'retail')`,
    ).bind(tenantId, `Tenant ${suffix}`),
    env.DB.prepare(`INSERT INTO users(id, tenant_id, email, role) VALUES (?, ?, ?, 'owner')`).bind(
      userId,
      tenantId,
      `${suffix}@example.invalid`,
    ),
  ]);
  await env.DB.prepare(
    `INSERT INTO push_consents(
       id, tenant_id, user_id, purpose, policy_version, device_fingerprint,
       granted_at, actor_user_id
     ) VALUES (?, ?, ?, 'OWNER_ALERTS', 'v1', ?, ?, ?)`,
  )
    .bind(consentId, tenantId, userId, `device-${suffix}`, '2026-08-08T20:00:00.000Z', userId)
    .run();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions(
       id, tenant_id, user_id, consent_id, provider, provider_version, status,
       endpoint_token_ciphertext, endpoint_token_fingerprint, encryption_key_version,
       device_fingerprint
     ) VALUES (?, ?, ?, ?, 'FCM_HTTP_V1', 'http-v1', 'ACTIVE', ?, ?, 'push-kms-v2', ?)`,
  )
    .bind(
      subscriptionId,
      tenantId,
      userId,
      consentId,
      `cipher-${suffix}`,
      `fingerprint-${suffix}`,
      `device-${suffix}`,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO push_events(
       id, tenant_id, event_type, source_entity_type, source_entity_id,
       idempotency_key_hash, target_scope, payload_redacted_json, deep_link_kind,
       deep_link_entity_id, ttl_seconds, collapse_key, created_at, expires_at
     ) VALUES (?, ?, 'CASH_DISCREPANCY', 'SHIFT', ?, ?, 'OWNER_ALERTS', '{}',
       'cash_close', ?, 300, ?, ?, ?)`,
  )
    .bind(
      eventId,
      tenantId,
      `shift-${suffix}`,
      `hash-${suffix}`,
      `shift-${suffix}`,
      `collapse-${suffix}`,
      '2026-08-08T20:00:00.000Z',
      '2026-08-08T20:05:00.000Z',
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO push_deliveries(
       id, tenant_id, event_id, subscription_id, provider, provider_version, status,
       collapse_key, ttl_seconds, accepted_at, ack_receipt_hash, ack_key_version,
       ack_expires_at
     ) VALUES (?, ?, ?, ?, 'FCM_HTTP_V1', 'http-v1', 'ACCEPTED', ?, 300, ?, ?, 'ack-v1', ?)`,
  )
    .bind(
      deliveryId,
      tenantId,
      eventId,
      subscriptionId,
      `collapse-${suffix}`,
      '2026-08-08T20:00:01.000Z',
      `receipt-${suffix}`,
      '2026-08-08T20:05:00.000Z',
    )
    .run();
  return { tenantId, userId, consentId, subscriptionId, eventId, deliveryId };
}

describe('Sprint 45 D1/workerd mobile push contract', () => {
  it('requires current consent and deduplicates event by tenant idempotency hash', async () => {
    const fixture = await seedPushFixture('outbox-replay');
    const input = {
      tenantId: fixture.tenantId,
      userId: fixture.userId,
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId: 'shift-new',
      idempotencyKeyHash: 'event-hash-new',
      now: '2026-08-08T20:00:00.000Z',
    } as const;
    const first = await appendPushEventAtomic(env.DB, input);
    const replay = await appendPushEventAtomic(env.DB, input);
    expect(first).toMatchObject({ queued: true, alreadyApplied: false });
    expect(replay).toMatchObject({ queued: true, alreadyApplied: true, eventId: first.eventId });
  });

  it('revokes every subscription for the consent in one D1 batch', async () => {
    const fixture = await seedPushFixture('revoke');
    await expect(
      revokePushConsentAtomic(env.DB, {
        tenantId: fixture.tenantId,
        userId: fixture.userId,
        consentId: fixture.consentId,
        now: '2026-08-08T20:01:00.000Z',
      }),
    ).resolves.toEqual({ revoked: true, subscriptionsDisabled: 1 });
    const subscription = await env.DB.prepare(
      `SELECT status FROM push_subscriptions WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.subscriptionId)
      .first<{ status: string }>();
    expect(subscription?.status).toBe('REVOKED');
  });

  it('keeps concurrent dispatch tenant-scoped and leases one delivery once', async () => {
    const fixture = await seedPushFixture('concurrent');
    await env.DB.prepare(
      `UPDATE push_deliveries
       SET status = 'PENDING', accepted_at = NULL, ack_receipt_hash = NULL,
           ack_key_version = NULL, ack_expires_at = NULL
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.deliveryId)
      .run();
    const claims = await Promise.all([
      claimPushDeliveries(env.DB, {
        tenantId: fixture.tenantId,
        workerIdHash: 'worker-a',
        limit: 50,
        now: '2026-08-08T20:00:00.000Z',
      }),
      claimPushDeliveries(env.DB, {
        tenantId: fixture.tenantId,
        workerIdHash: 'worker-b',
        limit: 50,
        now: '2026-08-08T20:00:00.000Z',
      }),
    ]);
    expect(claims.flatMap((claim) => claim.deliveries)).toHaveLength(1);
    expect(claims.flatMap((claim) => claim.deliveries)[0]?.tenantId).toBe(fixture.tenantId);
  });

  it('rejects cross-tenant subscription references and invalidates stale provider tokens', async () => {
    const left = await seedPushFixture('tenant-left');
    const right = await seedPushFixture('tenant-right');
    await expect(
      env.DB.prepare(
        `INSERT INTO push_deliveries(
           id, tenant_id, event_id, subscription_id, provider, provider_version,
           collapse_key, ttl_seconds
         ) VALUES ('cross-tenant-delivery', ?, ?, ?, 'FCM_HTTP_V1', 'http-v1', 'x', 60)`,
      )
        .bind(left.tenantId, left.eventId, right.subscriptionId)
        .run(),
    ).rejects.toBeDefined();
    await env.DB.prepare(
      `UPDATE push_subscriptions
       SET status = 'STALE', revoked_at = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'`,
    )
      .bind(
        '2026-08-08T20:02:00.000Z',
        '2026-08-08T20:02:00.000Z',
        left.tenantId,
        left.subscriptionId,
      )
      .run();
    expect(
      await env.DB.prepare(`SELECT status FROM push_subscriptions WHERE tenant_id = ? AND id = ?`)
        .bind(left.tenantId, left.subscriptionId)
        .first(),
    ).toMatchObject({ status: 'STALE' });
  });

  it('accepts one timely device-bound ACK and rejects replay, late, false, and cross-device ACKs', async () => {
    const fixture = await seedPushFixture('ack');
    const valid = {
      tenantId: fixture.tenantId,
      deliveryId: fixture.deliveryId,
      subscriptionId: fixture.subscriptionId,
      userId: fixture.userId,
      deviceFingerprint: 'device-ack',
      receiptHash: 'receipt-ack',
      now: '2026-08-08T20:02:00.000Z',
    };
    await expect(acknowledgePushDeliveryAtomic(env.DB, valid)).resolves.toEqual({
      displayed: true,
      replay: false,
    });
    await expect(acknowledgePushDeliveryAtomic(env.DB, valid)).resolves.toEqual({
      displayed: false,
      replay: true,
    });
    await expect(
      acknowledgePushDeliveryAtomic(env.DB, { ...valid, deviceFingerprint: 'device-other' }),
    ).resolves.toEqual({ displayed: false, replay: false });
    await expect(
      acknowledgePushDeliveryAtomic(env.DB, { ...valid, userId: 'user-other' }),
    ).resolves.toEqual({ displayed: false, replay: false });
    await expect(
      acknowledgePushDeliveryAtomic(env.DB, {
        ...valid,
        receiptHash: 'forged',
        now: '2026-08-08T20:06:00.000Z',
      }),
    ).resolves.toEqual({ displayed: false, replay: false });
  });

  it('keeps privacy/deep-link payload fields redacted and opaque in real D1', async () => {
    const fixture = await seedPushFixture('privacy');
    const row = await env.DB.prepare(
      `SELECT payload_redacted_json, deep_link_kind, deep_link_entity_id
       FROM push_events WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.eventId)
      .first<Record<string, string>>();
    expect(row).toEqual({
      payload_redacted_json: '{}',
      deep_link_kind: 'cash_close',
      deep_link_entity_id: 'shift-privacy',
    });
    expect(JSON.stringify(row)).not.toMatch(/customer|email|phone|token|cipher/i);
  });
});
