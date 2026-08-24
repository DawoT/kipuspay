import { claimPushDeliveries, type ClaimedPushDelivery } from '@kipuspay/adapters-d1';
import { buildLockscreenPayload, evaluatePushPrivacy } from '@kipuspay/domain-integrations';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isMobilePushEnabled } from './mobile-push-routes.js';

type Provider = 'WEB_PUSH' | 'FCM_HTTP_V1';
type ProviderStatus = 'ACCEPTED' | 'RETRY' | 'FAILED' | 'INVALID';

interface ProviderResult {
  readonly provider: Provider;
  readonly status: ProviderStatus;
  readonly responseCode: string;
  readonly providerMessageIdHash: string;
  readonly retryAfterSeconds: number | null;
  readonly invalidateSubscription: boolean;
}

interface PushTransportBinding {
  sendWebPush(input: Record<string, unknown>): Promise<ProviderResult>;
  sendFcm(input: Record<string, unknown>): Promise<ProviderResult>;
  issueAckReceipt(input: {
    tenantId: string;
    userId: string;
    deliveryId: string;
    subscriptionId: string;
    deviceFingerprint: string;
    issuedAtSeconds: number;
    expiresAtSeconds: number;
  }): Promise<{ token: string; receiptHash: string; keyVersion: string }>;
}

interface DeliveryContext {
  readonly id: string;
  readonly tenant_id: string;
  readonly subscription_id: string;
  readonly user_id: string;
  readonly device_fingerprint: string;
  readonly provider: Provider;
  readonly endpoint_token_ciphertext: string;
  readonly credential_ciphertext: string | null;
  readonly encryption_key_version: string;
  readonly event_type:
    | 'CASH_CLOSE'
    | 'CASH_DISCREPANCY'
    | 'INVENTORY_STOCKOUT'
    | 'INSTALLMENT_OVERDUE'
    | 'ACCOUNTS_RECEIVABLE_OVERDUE'
    | 'CUSTOMER_ORDER_EXPIRY'
    | 'RECURRING_GRACE'
    | 'BILLING_REMINDER';
  readonly amount_cents: number | null;
  readonly deep_link_kind: string;
  readonly deep_link_entity_id: string;
  readonly expires_at: string;
  readonly privacy_mode: 'REDACTED' | 'AMOUNTS';
  readonly tenant_amounts_policy_enabled: number;
  readonly owner_amounts_opt_in: number;
  readonly role: string;
}

const PROVIDERS = new Set(['WEB_PUSH', 'FCM_HTTP_V1']);
const STATUSES = new Set(['ACCEPTED', 'RETRY', 'FAILED', 'INVALID']);
const RESPONSE_CODES = new Set([
  '200',
  '201',
  '202',
  '204',
  '400',
  '401',
  '403',
  '404',
  '408',
  '409',
  '410',
  '429',
  '500',
  '502',
  '503',
  '504',
  'HTTP_200',
  'HTTP_201',
  'HTTP_202',
  'HTTP_204',
  'HTTP_400',
  'HTTP_401',
  'HTTP_403',
  'HTTP_404',
  'HTTP_408',
  'HTTP_409',
  'HTTP_410',
  'HTTP_429',
  'HTTP_500',
  'HTTP_502',
  'HTTP_503',
  'HTTP_504',
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
]);

function randomFraction(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return value / 0xffffffff;
}

export function computePushRetryDelaySeconds(
  attempt: number,
  retryAfterSeconds: number | null,
  remainingTtlSeconds: number,
  jitterFraction = randomFraction(),
): number {
  const remaining = Math.max(0, Math.floor(remainingTtlSeconds));
  if (remaining === 0) return 0;
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    return Math.min(remaining, Math.max(1, Math.ceil(retryAfterSeconds)));
  }
  const base = Math.min(3_600, 2 ** Math.min(12, Math.max(0, attempt)) * 5);
  const jittered = Math.ceil(base * (0.75 + Math.min(1, Math.max(0, jitterFraction)) * 0.5));
  return Math.min(remaining, Math.max(1, jittered));
}

export function sanitizeProviderResult<T extends ProviderResult>(input: T): ProviderResult {
  return {
    provider: PROVIDERS.has(input.provider) ? input.provider : 'WEB_PUSH',
    status: STATUSES.has(input.status) ? input.status : 'FAILED',
    responseCode: RESPONSE_CODES.has(input.responseCode) ? input.responseCode : 'PROVIDER_ERROR',
    providerMessageIdHash: /^[A-Za-z0-9_-]{0,128}$/.test(input.providerMessageIdHash)
      ? input.providerMessageIdHash
      : '',
    retryAfterSeconds:
      input.retryAfterSeconds === null
        ? null
        : Math.min(86_400, Math.max(0, Math.ceil(input.retryAfterSeconds))),
    invalidateSubscription: input.invalidateSubscription === true,
  };
}

export function pushDeliveryObservation(input: {
  readonly normalSamples: number;
  readonly displayed: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly offline: number;
  readonly doze: number;
}): {
  readonly alert: boolean;
  readonly reasons: readonly string[];
  readonly displayedRate: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly excluded: { readonly OFFLINE: number; readonly DOZE: number };
} {
  const displayedRate = input.normalSamples === 0 ? 0 : input.displayed / input.normalSamples;
  const reasons: string[] = [];
  if (input.normalSamples > 0 && displayedRate < 0.99) reasons.push('DISPLAYED_BELOW_99');
  if (input.normalSamples > 0 && input.p95Ms !== null && input.p95Ms >= 10_000) {
    reasons.push('P95_AT_OR_ABOVE_10S');
  }
  return {
    alert: reasons.length > 0,
    reasons,
    displayedRate,
    p50Ms: input.p50Ms,
    p95Ms: input.p95Ms,
    excluded: { OFFLINE: input.offline, DOZE: input.doze },
  };
}

async function materializeDeliveries(env: WorkerEnv, tenantId: string, now: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO push_deliveries (
         id, tenant_id, event_id, subscription_id, provider, provider_version,
         collapse_key, ttl_seconds, created_at, updated_at
       )
       SELECT lower(hex(randomblob(16))), e.tenant_id, e.id, s.id, s.provider,
              s.provider_version, e.collapse_key, e.ttl_seconds, ?, ?
       FROM push_events e
       JOIN push_subscriptions s ON s.tenant_id = e.tenant_id
       JOIN push_consents c
         ON c.tenant_id = s.tenant_id AND c.id = s.consent_id
       JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
       WHERE e.tenant_id = ? AND e.status IN ('PENDING','DISPATCHING')
         AND e.expires_at > ? AND s.status = 'ACTIVE'
         AND c.revoked_at IS NULL AND c.purpose = e.target_scope
         AND e.created_at >= c.granted_at
         AND (
           (e.target_scope = 'OWNER_ALERTS' AND u.role IN ('owner','admin')) OR
           (s.user_id = e.target_user_id AND s.branch_id = e.target_branch_id)
         )
         AND s.id = (
           SELECT MIN(s2.id) FROM push_subscriptions s2
           WHERE s2.tenant_id = s.tenant_id AND s2.user_id = s.user_id
             AND s2.device_fingerprint = s.device_fingerprint
             AND s2.status = 'ACTIVE'
         )
       LIMIT 100`,
    ).bind(now, now, tenantId, now),
    env.DB.prepare(
      `UPDATE push_events SET status = 'DISPATCHING'
       WHERE tenant_id = ? AND status = 'PENDING' AND expires_at > ?`,
    ).bind(tenantId, now),
    env.DB.prepare(
      `UPDATE push_events SET status = 'EXPIRED'
       WHERE tenant_id = ? AND status IN ('PENDING','DISPATCHING') AND expires_at <= ?`,
    ).bind(tenantId, now),
  ]);
}

async function deliveryContext(
  env: WorkerEnv,
  deliveryId: string,
): Promise<DeliveryContext | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT d.id, d.tenant_id, d.subscription_id, d.provider,
            s.user_id, s.device_fingerprint,
            s.endpoint_token_ciphertext, s.credential_ciphertext, s.encryption_key_version,
            e.event_type, e.amount_cents, e.deep_link_kind, e.deep_link_entity_id, e.expires_at,
            c.privacy_mode, COALESCE(ps.amounts_enabled, 0) AS tenant_amounts_policy_enabled,
            c.owner_amounts_opt_in,
            u.role
     FROM push_deliveries d
     JOIN push_subscriptions s
       ON s.tenant_id = d.tenant_id AND s.id = d.subscription_id
     JOIN push_events e ON e.tenant_id = d.tenant_id AND e.id = d.event_id
     JOIN push_consents c ON c.tenant_id = s.tenant_id AND c.id = s.consent_id
     LEFT JOIN push_privacy_settings ps ON ps.tenant_id = s.tenant_id
     JOIN users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
     WHERE d.id = ? AND d.status = 'LEASED' AND s.status = 'ACTIVE'
       AND c.revoked_at IS NULL LIMIT 1`,
  )
    .bind(deliveryId)
    .first<DeliveryContext>();
}

function failureReason(cause: unknown, prefix: string): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `${prefix}:${detail}`.slice(0, 200);
}

function warnPushFailure(input: {
  readonly event: 'push_send_failed' | 'push_ack_receipt_failed';
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly subscriptionId: string;
  readonly provider: Provider;
  readonly attempt: number;
  readonly reason: string;
}): void {
  console.warn(JSON.stringify({ ...input }));
}

/** Desenlace terminal de una delivery, derivado puro (sin I/O). */
interface DeliveryOutcome {
  readonly terminalStatus: 'ACCEPTED' | 'RETRY' | 'FAILED' | 'EXPIRED';
  readonly nextRetryAt: string | null;
  readonly ackReceiptHash: string | null;
  readonly ackExpiresAt: string | null;
  readonly persistedFailure: string | null;
}

function computeDeliveryOutcome(
  result: ProviderResult,
  context: DeliveryContext,
  receipt: { readonly receiptHash: string },
  attemptCount: number,
  nowMs: number,
  exceptionReason: string | null,
): DeliveryOutcome {
  const remainingTtl = Math.max(0, Math.floor((Date.parse(context.expires_at) - nowMs) / 1000));
  const retrySeconds = computePushRetryDelaySeconds(
    attemptCount + 1,
    result.retryAfterSeconds,
    remainingTtl,
  );
  const terminalStatus =
    remainingTtl <= 0 ? 'EXPIRED' : result.status === 'INVALID' ? 'FAILED' : result.status;
  const nextRetryAt =
    terminalStatus === 'RETRY' && retrySeconds > 0
      ? new Date(nowMs + retrySeconds * 1000).toISOString()
      : null;
  const ackReceiptHash = terminalStatus === 'ACCEPTED' ? receipt.receiptHash : null;
  const ackExpiresAt =
    terminalStatus === 'ACCEPTED'
      ? new Date(nowMs + Math.min(300, remainingTtl) * 1000).toISOString()
      : null;
  const persistedFailure =
    terminalStatus === 'EXPIRED'
      ? (exceptionReason ?? 'TTL_EXPIRED')
      : terminalStatus === 'FAILED'
        ? (exceptionReason ?? result.responseCode)
        : terminalStatus === 'RETRY' && exceptionReason
          ? exceptionReason
          : null;
  return { terminalStatus, nextRetryAt, ackReceiptHash, ackExpiresAt, persistedFailure };
}

async function completeDelivery(
  env: WorkerEnv,
  delivery: ClaimedPushDelivery,
  context: DeliveryContext,
  rawResult: ProviderResult,
  receipt: { readonly receiptHash: string; readonly keyVersion: string },
  nowMs: number,
  exceptionReason: string | null = null,
): Promise<void> {
  if (!env.DB) return;
  const result = sanitizeProviderResult(rawResult);
  const now = new Date(nowMs).toISOString();
  const { terminalStatus, nextRetryAt, ackReceiptHash, ackExpiresAt, persistedFailure } =
    computeDeliveryOutcome(result, context, receipt, delivery.attemptCount, nowMs, exceptionReason);
  const statements = [
    env.DB.prepare(
      `UPDATE push_deliveries
       SET status = ?, attempt_count = attempt_count + 1, next_retry_at = ?,
           lease_owner_hash = NULL, lease_expires_at = NULL,
           provider_message_id_hash = ?, provider_response_code = ?,
           accepted_at = CASE WHEN ? = 'ACCEPTED' THEN ? ELSE accepted_at END,
           ack_receipt_hash = COALESCE(?, ack_receipt_hash),
           ack_key_version = CASE WHEN ? IS NULL THEN ack_key_version ELSE ? END,
           ack_expires_at = COALESCE(?, ack_expires_at),
           failure_reason = CASE WHEN ? = 'ACCEPTED' THEN NULL ELSE ? END,
           updated_at = ?
       WHERE tenant_id = ? AND id = ? AND status = 'LEASED'`,
    ).bind(
      terminalStatus,
      nextRetryAt,
      result.providerMessageIdHash || null,
      result.responseCode,
      terminalStatus,
      now,
      ackReceiptHash,
      ackReceiptHash,
      receipt.keyVersion,
      ackExpiresAt,
      terminalStatus,
      persistedFailure,
      now,
      context.tenant_id,
      delivery.id,
    ),
  ];
  if (result.invalidateSubscription) {
    statements.push(
      env.DB.prepare(
        `UPDATE push_subscriptions
         SET status = 'INVALID', revoked_at = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'`,
      ).bind(now, now, context.tenant_id, context.subscription_id),
    );
  }
  await env.DB.batch(statements);
}

async function dispatchOne(
  env: WorkerEnv,
  delivery: ClaimedPushDelivery,
  nowMs: number,
): Promise<'accepted' | 'retry' | 'failed' | 'skipped'> {
  const context = await deliveryContext(env, delivery.id);
  if (!context || !env.PUSH_KMS) return 'skipped';
  const privacyMode = evaluatePushPrivacy({
    requestedMode: context.privacy_mode,
    tenantAmountsPolicyEnabled: context.tenant_amounts_policy_enabled === 1,
    ownerAmountsOptIn: context.owner_amounts_opt_in === 1,
    role: context.role,
  });
  const binding = env.PUSH_KMS as PushTransportBinding;
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresAtSeconds = Math.min(
    issuedAtSeconds + 300,
    Math.floor(Date.parse(context.expires_at) / 1000),
  );
  let receipt: Awaited<ReturnType<PushTransportBinding['issueAckReceipt']>>;
  try {
    receipt = await binding.issueAckReceipt({
      tenantId: context.tenant_id,
      userId: context.user_id,
      deliveryId: delivery.id,
      subscriptionId: context.subscription_id,
      deviceFingerprint: context.device_fingerprint,
      issuedAtSeconds,
      expiresAtSeconds,
    });
  } catch (cause) {
    // El receipt es RPC previo al send: un fallo aquí jamás debe abortar el
    // loop del dispatcher (dejaría el resto de leases pegados sin intento).
    const reason = failureReason(cause, 'ACK_RECEIPT_ERROR');
    warnPushFailure({
      event: 'push_ack_receipt_failed',
      tenantId: context.tenant_id,
      deliveryId: delivery.id,
      subscriptionId: context.subscription_id,
      provider: delivery.provider,
      attempt: delivery.attemptCount,
      reason,
    });
    await completeDelivery(
      env,
      delivery,
      context,
      {
        provider: delivery.provider,
        status: 'RETRY',
        responseCode: 'NETWORK_ERROR',
        providerMessageIdHash: '',
        retryAfterSeconds: null,
        invalidateSubscription: false,
      },
      { receiptHash: '', keyVersion: '' },
      nowMs,
      reason,
    );
    return 'retry';
  }
  // eventType es metadata de copy server-side: el allowlist del transporte
  // (validatePayload en worker-kms) no lo admite y su presencia provocaba
  // PUSH_PAYLOAD_NOT_ALLOWED en TODOS los sends (drill fcm-vapid-real).
  const built = buildLockscreenPayload({
    eventType: context.event_type,
    privacyMode,
    ...(context.amount_cents === null ? {} : { amount_cents: context.amount_cents }),
    deepLinkKind: context.deep_link_kind,
    deepLinkEntityId: context.deep_link_entity_id,
  });
  const lockscreenWire = { ...built };
  delete (lockscreenWire as { eventType?: unknown }).eventType;
  const payload = { ...lockscreenWire, deliveryId: delivery.id, receipt: receipt.token };
  let raw: ProviderResult;
  let sendFailureReason: string | null = null;
  try {
    const common = {
      tenantId: context.tenant_id,
      subscriptionId: context.subscription_id,
      keyVersion: context.encryption_key_version,
      ttlSeconds: delivery.ttlSeconds,
      payload,
      secrets: {
        vapidPrivateKeyRef: 'secret-ref-vapid-v3',
        fcmServiceAccountRef: 'secret-ref-fcm-v2',
        vapidPublicKeyRef: 'secret-ref-vapid-public-v3',
        vapidSubjectRef: 'secret-ref-vapid-subject',
      },
    };
    raw =
      delivery.provider === 'WEB_PUSH'
        ? await binding.sendWebPush({
            ...common,
            encryptedSubscription: context.endpoint_token_ciphertext,
          })
        : await binding.sendFcm({
            ...common,
            encryptedToken: context.endpoint_token_ciphertext,
          });
  } catch (cause) {
    // Jamás silencio: el motivo exacto queda en el log estructurado y en la fila.
    sendFailureReason = failureReason(cause, 'SEND_ERROR');
    warnPushFailure({
      event: 'push_send_failed',
      tenantId: context.tenant_id,
      deliveryId: delivery.id,
      subscriptionId: context.subscription_id,
      provider: delivery.provider,
      attempt: delivery.attemptCount,
      reason: sendFailureReason,
    });
    raw = {
      provider: delivery.provider,
      status: 'RETRY',
      responseCode: 'NETWORK_ERROR',
      providerMessageIdHash: '',
      retryAfterSeconds: null,
      invalidateSubscription: false,
    };
  }
  await completeDelivery(env, delivery, context, raw, receipt, nowMs, sendFailureReason);
  return raw.status === 'ACCEPTED' ? 'accepted' : raw.status === 'RETRY' ? 'retry' : 'failed';
}

export async function runMobilePushDispatcher(
  env: WorkerEnv,
  options: { readonly scheduledTime?: number; readonly pageSize?: number } = {},
): Promise<{
  readonly tenants: number;
  readonly claimed: number;
  readonly accepted: number;
  readonly retry: number;
  readonly failed: number;
}> {
  if (!isMobilePushEnabled(env) || !env.DB || !env.PUSH_KMS) {
    return { tenants: 0, claimed: 0, accepted: 0, retry: 0, failed: 0 };
  }
  const nowMs = options.scheduledTime ?? Date.now();
  const now = new Date(nowMs).toISOString();
  // Discovery dual: eventos vivos Y deliveries accionables (huérfanos de un
  // evento expirado o leases estancados) — drill fcm-vapid-real (2026-08-23).
  const tenantRows = await env.DB.prepare(
    `SELECT DISTINCT tenant_id FROM (
       SELECT e.tenant_id
       FROM push_events e
       JOIN tenant_capabilities tc ON tc.tenant_id = e.tenant_id
       WHERE e.status IN ('PENDING','DISPATCHING') AND e.expires_at > ?
         AND tc.capability IN ('mobile.push','owner.push_alerts') AND tc.enabled = 1
       UNION
       SELECT d.tenant_id
       FROM push_deliveries d
       JOIN tenant_capabilities tc ON tc.tenant_id = d.tenant_id
       WHERE (
              (d.status IN ('PENDING','RETRY')
                AND (d.next_retry_at IS NULL OR d.next_retry_at <= ?))
              OR (d.status = 'LEASED' AND d.lease_expires_at <= ?)
             )
         AND tc.capability IN ('mobile.push','owner.push_alerts') AND tc.enabled = 1
     ) ORDER BY tenant_id LIMIT 100`,
  )
    .bind(now, now, now)
    .all<{ tenant_id: string }>();
  const summary = { tenants: 0, claimed: 0, accepted: 0, retry: 0, failed: 0 };
  for (const { tenant_id: tenantId } of tenantRows.results ?? []) {
    summary.tenants += 1;
    await materializeDeliveries(env, tenantId, now);
    const workerIdHash = crypto.randomUUID();
    let pages = 0;
    let hasMore = true;
    while (hasMore && pages < 10) {
      const page = await claimPushDeliveries(env.DB, {
        tenantId,
        workerIdHash,
        limit: Math.min(100, Math.max(1, options.pageSize ?? 50)),
        now,
      });
      summary.claimed += page.deliveries.length;
      for (const delivery of page.deliveries) {
        const outcome = await dispatchOne(env, delivery, nowMs);
        if (outcome === 'accepted') summary.accepted += 1;
        else if (outcome === 'retry') summary.retry += 1;
        else if (outcome === 'failed') summary.failed += 1;
      }
      hasMore = page.hasMore;
      pages += 1;
    }
  }
  console.log(JSON.stringify({ event: 'mobile_push_dispatch', ...summary }));
  return summary;
}

/** ADR-0036: techo de fan-out inline por request (2 RPC KMS por delivery ⇒ ≤32 invocaciones de service binding). */
export const INLINE_MAX_DELIVERIES = 16;

/** ADR-0036: feature flag estricto '1' — default off; es además la palanca de rollback. */
export function isInlinePushDispatchEnabled(env: Partial<WorkerEnv> | undefined): boolean {
  return env?.FEATURE_PUSH_INLINE_DISPATCH === '1';
}

export interface InlineDispatchScope {
  readonly tenantId: string;
  readonly eventId: string;
}

/**
 * ADR-0036 — despacho inline post-enqueue: reutiliza el pipeline ÚNICO del
 * dispatcher (materializeDeliveries → claimPushDeliveries → dispatchOne),
 * acotado al evento productor y al tope de fan-out INLINE_MAX_DELIVERIES.
 * El excedente queda PENDING/RETRY y el discovery dual del cron cada 5 min lo
 * toma como backstop/retry. Errores jamás silenciosos (drill 2026-08-23):
 * toda excepción se registra estructurada y las filas quedan accionables para
 * el cron (lease vence a los 60 s o permanecen PENDING); la promesa jamás
 * rechaza — corre bajo ctx.waitUntil y un rejection sería ruido en Workers Logs.
 */
export async function dispatchPushNow(
  env: WorkerEnv,
  scope: InlineDispatchScope,
  options: { readonly nowMs?: number } = {},
): Promise<{
  readonly claimed: number;
  readonly accepted: number;
  readonly retry: number;
  readonly failed: number;
}> {
  const summary = { claimed: 0, accepted: 0, retry: 0, failed: 0 };
  if (!isMobilePushEnabled(env) || !env.DB || !env.PUSH_KMS) return summary;
  const nowMs = options.nowMs ?? Date.now();
  try {
    const now = new Date(nowMs).toISOString();
    await materializeDeliveries(env, scope.tenantId, now);
    const page = await claimPushDeliveries(env.DB, {
      tenantId: scope.tenantId,
      workerIdHash: crypto.randomUUID(),
      limit: INLINE_MAX_DELIVERIES,
      now,
      eventId: scope.eventId,
    });
    for (const delivery of page.deliveries) {
      summary.claimed += 1;
      const outcome = await dispatchOne(env, delivery, nowMs);
      if (outcome === 'accepted') summary.accepted += 1;
      else if (outcome === 'retry') summary.retry += 1;
      else if (outcome === 'failed') summary.failed += 1;
    }
  } catch (cause) {
    console.warn(
      JSON.stringify({
        event: 'push_inline_dispatch_failed',
        tenantId: scope.tenantId,
        eventId: scope.eventId,
        reason: failureReason(cause, 'INLINE_DISPATCH_ERROR'),
      }),
    );
  }
  console.log(JSON.stringify({ event: 'mobile_push_dispatch_inline', ...summary }));
  return summary;
}
