import type { WorkerEnv } from '../auth/control-plane.js';
import { brandInviteUrl, normalizeReferralCode } from './referral-domain.js';
import {
  captureRef,
  createReferralStore,
  ensureReferralCode,
  onFirstSaleCredit,
  type ReferralStore,
} from './referral-store.js';

/** Soft-launch: store en memoria del isolate. Persistencia D1 = migración 0010. */
const globalStore: ReferralStore = createReferralStore();

export function getReferralStore(): ReferralStore {
  return globalStore;
}

export function runEnsureReferralCodeHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.tenantId !== 'string' || !o.tenantId) {
    return { status: 422, body: { error: 'tenantId requerido', code: 'INVALID' } };
  }
  const marketingOrigin =
    typeof o.marketingOrigin === 'string' && o.marketingOrigin
      ? o.marketingOrigin
      : 'https://kipuspay.pe';
  const rec = ensureReferralCode(globalStore, o.tenantId);
  return {
    status: 200,
    body: {
      code: rec.code,
      inviteUrl: brandInviteUrl(marketingOrigin, rec.code),
    },
  };
}

export function runCaptureReferralHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.referredTenantId !== 'string' || typeof o.ref !== 'string') {
    return { status: 422, body: { error: 'referredTenantId y ref requeridos', code: 'INVALID' } };
  }
  try {
    const attr = captureRef(globalStore, {
      attributionId:
        typeof o.attributionId === 'string' && o.attributionId
          ? o.attributionId
          : `attr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      referredTenantId: o.referredTenantId,
      code: normalizeReferralCode(o.ref),
    });
    return { status: 201, body: { ...attr } };
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'capture failed',
        code: 'REFERRAL_REJECTED',
      },
    };
  }
}

export function runFirstSaleReferralHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.tenantId !== 'string' || !o.tenantId) {
    return { status: 422, body: { error: 'tenantId requerido', code: 'INVALID' } };
  }
  const now = typeof o.nowIso === 'string' ? o.nowIso : new Date().toISOString();
  if (!globalStore.trials.has(o.tenantId)) {
    globalStore.trials.set(o.tenantId, {
      tenantId: o.tenantId,
      trialEndsAt: new Date(Date.parse(now) + 30 * 86_400_000).toISOString(),
    });
  }
  const result = onFirstSaleCredit(globalStore, o.tenantId, now);
  return {
    status: 200,
    body: {
      credited: result.credited,
      trialEndsAt: globalStore.trials.get(o.tenantId)?.trialEndsAt ?? null,
    },
  };
}
