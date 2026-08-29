import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INLINE_MAX_DELIVERIES,
  dispatchPushNow,
  pushDeliveryObservation,
  runMobilePushDispatcher,
} from './mobile-push-dispatcher.js';
import { acknowledgePushDeliveryAtomic } from '@kipuspay/adapters-d1';

type WorkerEnv = typeof env & {
  FEATURE_MOBILE_PUSH?: string;
  FEATURE_PUSH_INLINE_DISPATCH?: string;
  FEATURE_CLIENT_MOBILE_POS?: string;
  PUSH_KMS?: unknown;
  DB: D1Database;
  TEST_MIGRATIONS?: unknown;
};

function p95Ms(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[idx] ?? null;
}

function mockPushKms() {
  return {
    sendWebPush: vi.fn(async () => ({
      provider: 'WEB_PUSH' as const,
      status: 'ACCEPTED' as const,
      responseCode: '201' as const,
      providerMessageIdHash: 'provider-hash',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    })),
    sendFcm: vi.fn(async () => ({
      provider: 'FCM_HTTP_V1' as const,
      status: 'ACCEPTED' as const,
      responseCode: '201' as const,
      providerMessageIdHash: 'provider-hash-fcm',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    })),
    issueAckReceipt: vi.fn(async (input: { deliveryId: string }) => ({
      token: `receipt-${input.deliveryId}`,
      receiptHash: `hash-${input.deliveryId}`,
      keyVersion: 'ack-v1',
    })),
    verifyAckReceipt: vi.fn(async (input: { token: string }) => ({
      tenantId: 'placeholder',
      userId: 'placeholder',
      deliveryId: input.token.replace('receipt-', ''),
      subscriptionId: 'placeholder',
      deviceFingerprint: 'placeholder',
      issuedAtSeconds: Math.floor(Date.now() / 1000),
      expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
      nonce: 'nonce',
    })),
  };
}

describe('push SLO volume n≥20 (diseño E1, baseline M1-M5 + guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('M3/M4 guard n≥20: n=1 no debe alertar aunque p95≥10s o rate<99%', () => {
    // Este es el RED canónico: sin guard, p95 12s con n=1 dispararía P95_AT_OR_ABOVE_10S.
    // Con guard n≥20 la alerta queda suprimida (no ruido con muestras insuficientes).
    const smallFailingRate = pushDeliveryObservation({
      normalSamples: 1,
      displayed: 0,
      p50Ms: null,
      p95Ms: 12_000,
      offline: 0,
      doze: 0,
    });
    expect(smallFailingRate.alert).toBe(false);
    expect(smallFailingRate.reasons).toEqual([]);

    const smallFailingP95 = pushDeliveryObservation({
      normalSamples: 1,
      displayed: 1,
      p50Ms: 500,
      p95Ms: 10_000,
      offline: 0,
      doze: 0,
    });
    expect(smallFailingP95.alert).toBe(false);
    expect(smallFailingP95.reasons).toEqual([]);

    // Con n=20 el mismo p95 sí debe alertar (M4 p95≥10s)
    const guardedFailing = pushDeliveryObservation({
      normalSamples: 20,
      displayed: 20,
      p50Ms: 500,
      p95Ms: 10_000,
      offline: 0,
      doze: 0,
    });
    expect(guardedFailing.alert).toBe(true);
    expect(guardedFailing.reasons).toContain('P95_AT_OR_ABOVE_10S');

    // Con n=20 y rate <99% debe alertar DISPLAYED_BELOW_99 (M3)
    const rateFailing = pushDeliveryObservation({
      normalSamples: 20,
      displayed: 19,
      p50Ms: 500,
      p95Ms: 5_000,
      offline: 0,
      doze: 0,
    });
    expect(rateFailing.alert).toBe(true);
    expect(rateFailing.reasons).toContain('DISPLAYED_BELOW_99');

    // Con n=20 y todo OK no alerta (M3 100% y M4 <10s)
    const healthy = pushDeliveryObservation({
      normalSamples: 20,
      displayed: 20,
      p50Ms: 800,
      p95Ms: 4_500,
      offline: 2,
      doze: 1,
    });
    expect(healthy.alert).toBe(false);
    expect(healthy.reasons).toEqual([]);
    expect(healthy.displayedRate).toBe(1);
  });

  it('INLINE_MAX 16: segunda tanda 4 tomada por backstop cron, M3 20/20, M5 p95 E2E<10s con inline', async () => {
    expect(INLINE_MAX_DELIVERIES).toBe(16);

    const tenantId = `tenant_push_volume_${crypto.randomUUID()}`;
    const userId = `user_volume_${crypto.randomUUID().slice(0, 8)}`;
    const consentId = `consent_volume_${crypto.randomUUID()}`;
    const eventId = `event_volume_${crypto.randomUUID()}`;
    const nowIso = '2026-08-24T14:50:00.000Z';
    const nowMs = Date.parse(nowIso);
    const ttlSeconds = 600;
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const deviceBase = `device_volume_${crypto.randomUUID().slice(0, 6)}`;

    // Seed mínimo multitenant: tenant + user + capabilities + privacy + consent + 20 subscriptions + 1 event
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tenants(id, business_name, vertical_type) VALUES (?, ?, 'retail')`).bind(
        tenantId,
        `Tenant volume ${tenantId.slice(0, 8)}`,
      ),
      env.DB.prepare(`INSERT INTO users(id, tenant_id, email, role) VALUES (?, ?, ?, 'owner')`).bind(
        userId,
        tenantId,
        `${userId}@example.invalid`,
      ),
    ]);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenant_capabilities(tenant_id, capability, enabled) VALUES (?, 'mobile.push', 1)`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT INTO push_privacy_settings(id, tenant_id, amounts_enabled, policy_version, updated_by_user_id) VALUES (?, ?, 0, 's45-v1', ?)`,
      ).bind(`privacy_${tenantId}`, tenantId, userId),
    ]);

    await env.DB.prepare(
      `INSERT INTO push_consents(id, tenant_id, user_id, purpose, policy_version, privacy_mode, tenant_amounts_policy_enabled, owner_amounts_opt_in, device_fingerprint, granted_at, actor_user_id) VALUES (?, ?, ?, 'OWNER_ALERTS', 's45-v1', 'REDACTED', 0, 0, ?, ?, ?)`,
    )
      .bind(consentId, tenantId, userId, deviceBase, nowIso, userId)
      .run();

    // 20 suscripciones WEB_PUSH (REQUIERE credential_ciphertext para WEB_PUSH según CHECK)
    const subIds: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const subId = `sub_vol_${i}_${crypto.randomUUID().slice(0, 8)}`;
      subIds.push(subId);
      const fingerprint = `fp_vol_${tenantId.slice(0, 4)}_${i}_${crypto.randomUUID().slice(0, 6)}`;
      await env.DB.prepare(
        `INSERT INTO push_subscriptions(id, tenant_id, user_id, consent_id, provider, provider_version, status, endpoint_token_ciphertext, endpoint_token_fingerprint, credential_ciphertext, credential_fingerprint, encryption_key_version, device_fingerprint) VALUES (?, ?, ?, ?, 'WEB_PUSH', 'RFC8291', 'ACTIVE', ?, ?, ?, ?, 'kms-v1', ?)`,
      )
        .bind(
          subId,
          tenantId,
          userId,
          consentId,
          `cipher-${subId}`,
          fingerprint,
          `cred-cipher-${subId}`,
          `cred-fp-${subId}`,
          `${deviceBase}-${i}`,
        )
        .run();
    }

    // Un evento OWNER_ALERTS con ttl 600s que faneea a las 20 suscripciones
    const idempotency = `volhash_${tenantId}_${eventId}`;
    await env.DB.prepare(
      `INSERT INTO push_events(id, tenant_id, event_type, source_entity_type, source_entity_id, idempotency_key_hash, target_scope, payload_redacted_json, amount_cents, deep_link_kind, deep_link_entity_id, ttl_seconds, collapse_key, status, created_at, expires_at) VALUES (?, ?, 'CASH_CLOSE', 'PUSH_TEST', ?, ?, 'OWNER_ALERTS', '{}', ?, 'cash_close', ?, ?, ?, 'PENDING', ?, ?)`,
    )
      .bind(
        eventId,
        tenantId,
        `src_${eventId}`,
        idempotency,
        12_500,
        `src_${eventId}`,
        ttlSeconds,
        `collapse_vol_${eventId}`,
        nowIso,
        expiresAt,
      )
      .run();

    const pushKms = mockPushKms();
    const workerEnv = {
      ...env,
      FEATURE_MOBILE_PUSH: '1',
      FEATURE_PUSH_INLINE_DISPATCH: '1',
      DB: env.DB,
      PUSH_KMS: pushKms,
    } as unknown as WorkerEnv;

    // 1) Inline post-enqueue: debe tomar exactamente INLINE_MAX (16) dejando 4 PENDING
    const inline = await dispatchPushNow(workerEnv, { tenantId, eventId }, { nowMs });
    expect(inline.claimed).toBe(16);
    expect(inline.accepted).toBe(16);
    expect(inline.retry).toBe(0);
    expect(inline.failed).toBe(0);
    expect(pushKms.sendWebPush).toHaveBeenCalledTimes(16);
    expect(pushKms.issueAckReceipt).toHaveBeenCalledTimes(16);

    const afterInline = await env.DB.prepare(
      `SELECT status, COUNT(*) as n FROM push_deliveries WHERE tenant_id = ? GROUP BY status`,
    )
      .bind(tenantId)
      .all<{ status: string; n: number }>();
    const countsInline = Object.fromEntries(
      (afterInline.results ?? []).map((r) => [r.status, r.n]),
    ) as Record<string, number>;
    expect(countsInline['ACCEPTED']).toBe(16);
    // 4 deben quedar PENDING para el cron
    expect(countsInline['PENDING']).toBe(4);

    // 2) Cron backstop (5 min) toma el resto 4 si solo inline 16
    const cron = await runMobilePushDispatcher(workerEnv, { scheduledTime: nowMs + 2_000 });
    expect(cron.claimed).toBe(4);
    expect(cron.accepted).toBe(4);
    // Total inline+backstop = 20
    expect(inline.claimed + cron.claimed).toBe(20);

    const afterCron = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM push_deliveries WHERE tenant_id = ? AND status = 'ACCEPTED'`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(afterCron?.n).toBe(20);

    // 3) Simular ACKs del Service Worker dentro de <10s (display_context NORMAL, TTL 600s)
    const deliveries = await env.DB.prepare(
      `SELECT id, subscription_id, ack_receipt_hash FROM push_deliveries WHERE tenant_id = ? ORDER BY created_at, id`,
    )
      .bind(tenantId)
      .all<{ id: string; subscription_id: string; ack_receipt_hash: string }>();
    expect(deliveries.results?.length).toBe(20);

    // Necesitamos device_fingerprint por subscription para el ACK atómico
    for (const row of deliveries.results ?? []) {
      const sub = await env.DB.prepare(
        `SELECT device_fingerprint, user_id FROM push_subscriptions WHERE tenant_id = ? AND id = ?`,
      )
        .bind(tenantId, row.subscription_id)
        .first<{ device_fingerprint: string; user_id: string }>();
      // Latencias escalonadas pero todas <10s para garantizar p95 <10s (M4 y M5)
      // Ack 2s después de created (E2E ~2s)
      const displayedAt = new Date(nowMs + 2_000 + (Math.random() * 100 | 0)).toISOString();
      const ackDelay = 50 + (parseInt(row.id.slice(-2), 16) % 200); // determinista <300ms jitter
      const ackAt = new Date(Date.parse(displayedAt) + ackDelay).toISOString();
      // Usamos acknowledgePushDeliveryAtomic directamente (misma atomicidad que el ACK real)
      await acknowledgePushDeliveryAtomic(env.DB, {
        tenantId,
        deliveryId: row.id,
        subscriptionId: row.subscription_id,
        userId: sub!.user_id,
        deviceFingerprint: sub!.device_fingerprint,
        receiptHash: row.ack_receipt_hash!,
        now: ackAt,
        displayContext: 'NORMAL',
      });
    }

    // 4) Medir SLO real desde D1: M3 tasa DISPLAYED/ACCEPTED (NORMAL), M4 ack_delta, M5 E2E
    const sloRows = await env.DB.prepare(
      `SELECT d.displayed_at as displayed_at, d.accepted_at as accepted_at, e.created_at as event_created_at, d.display_context as ctx
       FROM push_deliveries d JOIN push_events e ON e.tenant_id = d.tenant_id AND e.id = d.event_id
       WHERE d.tenant_id = ? AND d.display_context = 'NORMAL'`,
    )
      .bind(tenantId)
      .all<{ displayed_at: string; accepted_at: string; event_created_at: string; ctx: string }>();

    const normalRows = sloRows.results ?? [];
    expect(normalRows.length).toBe(20);
    expect(normalRows.every((r) => r.ctx === 'NORMAL')).toBe(true);

    // M3: 20/20 DISPLAYED
    const displayedCount = normalRows.filter((r) => r.displayed_at !== null).length;
    expect(displayedCount).toBe(20);

    // M4: p95 accepted→displayed <10s
    const ackDeltas = normalRows
      .map((r) => Date.parse(r.displayed_at!) - Date.parse(r.accepted_at!))
      .filter((v) => Number.isFinite(v));
    const p95Ack = p95Ms(ackDeltas);
    expect(p95Ack).not.toBeNull();
    expect(p95Ack!).toBeLessThan(10_000);

    // M5: p95 E2E created→displayed <10s con inline (sin inline sería ~300s por cron */5)
    const e2eDeltas = normalRows.map((r) => Date.parse(r.displayed_at!) - Date.parse(r.event_created_at!));
    const p95E2e = p95Ms(e2eDeltas);
    expect(p95E2e).not.toBeNull();
    expect(p95E2e!).toBeLessThan(10_000);

    // Observación final con guard n≥20: M3 20/20 (≥99%) y M4/M5 <10s => no alerta
    const finalObs = pushDeliveryObservation({
      normalSamples: 20,
      displayed: 20,
      p50Ms: p95Ms(e2eDeltas.slice().sort((a, b) => a - b).slice(0, 10)) ?? 1_000,
      p95Ms: p95E2e,
      offline: 0,
      doze: 0,
    });
    expect(finalObs.displayedRate).toBe(1);
    expect(finalObs.alert).toBe(false);
    expect(finalObs.reasons).toEqual([]);

    // Con n=1 el mismo p95 no debe alertar por guard (ya probado arriba) — doble check con datos reales
    const singleObs = pushDeliveryObservation({
      normalSamples: 1,
      displayed: 1,
      p50Ms: 1_000,
      p95Ms: p95E2e,
      offline: 0,
      doze: 0,
    });
    expect(singleObs.alert).toBe(false);
  });
});
