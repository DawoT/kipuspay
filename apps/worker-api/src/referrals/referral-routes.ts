import type { WorkerEnv } from '../auth/control-plane.js';
import { brandInviteUrl, mintReferralCode, normalizeReferralCode } from './referral-domain.js';
import {
  captureRef,
  createReferralStore,
  ensureReferralCode,
  onFirstSaleCredit,
  type ReferralStore,
} from './referral-store.js';

/** Soft-launch: store en memoria del isolate. Persistencia D1 = migración 0010. */
const globalStore: ReferralStore = createReferralStore();

/**
 * S11-B4 — mes gratis de referidos (GTM §7.1): al acreditar la primera venta
 * del referido, el trial del referidor y del referido se extiende +30 días
 * (sobre el trialEndsAt vigente, o desde hoy si ya venció). Best-effort: sin
 * KV o sin snapshot, se omite sin romper el flujo.
 */
async function extendTrialByMonth(
  kv: { get(key: string): Promise<string | null>; put?(key: string, value: string): Promise<void> } | undefined,
  tenantId: string,
  nowMs: number,
): Promise<string | null> {
  if (!kv?.get || !kv.put || !tenantId) return null;
  try {
    const raw = await kv.get(`tenant:${tenantId}`);
    if (!raw) return null;
    const tenant = JSON.parse(raw) as Record<string, unknown>;
    const current = typeof tenant.trialEndsAt === 'string' ? Date.parse(tenant.trialEndsAt) : NaN;
    const base = Number.isFinite(current) && current > nowMs ? current : nowMs;
    const extended = new Date(base + 30 * 86_400_000).toISOString();
    tenant.trialEndsAt = extended;
    if (tenant.subscriptionStatus === 'trial') {
      tenant.subscriptionStatus = 'trial';
    }
    await kv.put(`tenant:${tenantId}`, JSON.stringify(tenant));
    return extended;
  } catch {
    return null;
  }
}

export function getReferralStore(): ReferralStore {
  return globalStore;
}

export async function runEnsureReferralCodeHttp(
  env: WorkerEnv,
  raw: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
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
      : 'https://kipuspay.com';
  if (env.DB) {
    // S12-H1: código persistido en D1 (idempotente por tenant).
    const { ensureReferralCodeD1 } = await import('@kipuspay/adapters-d1');
    const rec = await ensureReferralCodeD1(env.DB, o.tenantId, mintReferralCode(o.tenantId));
    return {
      status: 200,
      body: {
        code: rec.code,
        inviteUrl: brandInviteUrl(marketingOrigin, rec.code),
      },
    };
  }
  const rec = ensureReferralCode(globalStore, o.tenantId);
  return {
    status: 200,
    body: {
      code: rec.code,
      inviteUrl: brandInviteUrl(marketingOrigin, rec.code),
    },
  };
}

export async function runCaptureReferralHttp(
  env: WorkerEnv,
  raw: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.referredTenantId !== 'string' || typeof o.ref !== 'string') {
    return { status: 422, body: { error: 'referredTenantId y ref requeridos', code: 'INVALID' } };
  }
  const attributionId =
    typeof o.attributionId === 'string' && o.attributionId
      ? o.attributionId
      : `attr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  if (env.DB) {
    // S12-H1: atribución persistente (UNIQUE por referido).
    const { ensureReferralCodeD1, captureAttributionD1 } = await import('@kipuspay/adapters-d1');
    const owner = await ensureReferralCodeD1(env.DB, o.referredTenantId, '');
    void owner; // la atribución resuelve el referrer por código en D1
    const code = normalizeReferralCode(o.ref);
    const codeRow = await env.DB.prepare(`SELECT tenant_id FROM referral_codes WHERE code = ?`)
      .bind(code)
      .first<{ tenant_id: string }>();
    if (!codeRow) {
      return {
        status: 422,
        body: { error: 'Codigo de referido desconocido', code: 'REFERRAL_REJECTED' },
      };
    }
    const attr = await captureAttributionD1(env.DB, {
      id: attributionId,
      referredTenantId: o.referredTenantId,
      referrerTenantId: codeRow.tenant_id,
      code,
    });
    return { status: 201, body: { ...attr } };
  }
  try {
    const attr = captureRef(globalStore, {
      attributionId,
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

export async function runFirstSaleReferralHttp(
  env: WorkerEnv,
  raw: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.tenantId !== 'string' || !o.tenantId) {
    return { status: 422, body: { error: 'tenantId requerido', code: 'INVALID' } };
  }
  const now = typeof o.nowIso === 'string' ? o.nowIso : new Date().toISOString();
  if (env.DB) {
    // S12-H1/S12-H3: persistencia D1 — atribución credited + growth_events
    // first_sale (telemetría GTM §9 TTFS/activación) y referral_credited.
    const { loadAttributionForTenant, markAttributionCreditedD1, insertGrowthEventD1 } =
      await import('@kipuspay/adapters-d1');
    await insertGrowthEventD1(env.DB, {
      tenantId: o.tenantId,
      eventType: 'first_sale',
      occurredAtIso: now,
      meta: { source: 'first-sale-referral' },
    });
    const attr = await loadAttributionForTenant(env.DB, o.tenantId);
    if (!attr || attr.status === 'credited') {
      return { status: 200, body: { credited: false, trialEndsAt: null } };
    }
    await markAttributionCreditedD1(env.DB, {
      attributionId: attr.id,
      referredTenantId: attr.tenant_id,
      referrerTenantId: attr.referrer_tenant_id,
      nowIso: now,
    });
    // S11-B4: mes gratis para referidor y referido (GTM §7.1 / blog §7).
    const nowMs = Date.parse(now);
    const referredTrial = await extendTrialByMonth(
      env.TENANT_KV,
      attr.tenant_id,
      nowMs,
    );
    await extendTrialByMonth(env.TENANT_KV, attr.referrer_tenant_id, nowMs);
    return {
      status: 200,
      body: { credited: true, trialEndsAt: referredTrial ?? null },
    };
  }
  // Fallback soft-launch in-memory.
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
