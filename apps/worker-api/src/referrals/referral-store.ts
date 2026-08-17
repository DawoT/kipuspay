/**
 * Orquestación in-memory de referidos (Sprint 12) — simula batch D1 sin D1.
 */

import {
  brandInviteUrl,
  captureAttribution,
  extendTrialEndsAt,
  mintReferralCode,
  planBilateralCredit,
  qualifyAttribution,
  type AttributionRecord,
  type ReferralCodeRecord,
} from './referral-domain.js';

export interface TenantTrialState {
  tenantId: string;
  trialEndsAt: string | null;
}

export interface ReferralStore {
  codes: Map<string, ReferralCodeRecord>;
  byTenantCode: Map<string, string>;
  attributions: Map<string, AttributionRecord>;
  byReferred: Map<string, string>;
  trials: Map<string, TenantTrialState>;
}

export function createReferralStore(): ReferralStore {
  return {
    codes: new Map(),
    byTenantCode: new Map(),
    attributions: new Map(),
    byReferred: new Map(),
    trials: new Map(),
  };
}

export function ensureReferralCode(store: ReferralStore, tenantId: string): ReferralCodeRecord {
  const existing = store.byTenantCode.get(tenantId);
  if (existing) return store.codes.get(existing)!;
  let code = mintReferralCode(tenantId);
  while (store.codes.has(code)) code = mintReferralCode(tenantId + Math.random());
  const rec = { tenantId, code };
  store.codes.set(code, rec);
  store.byTenantCode.set(tenantId, code);
  return rec;
}

export function captureRef(
  store: ReferralStore,
  opts: {
    attributionId: string;
    referredTenantId: string;
    code: string;
  },
): AttributionRecord {
  const owner = store.codes.get(opts.code.toUpperCase()) ?? null;
  const attr = captureAttribution({
    id: opts.attributionId,
    referredTenantId: opts.referredTenantId,
    referrerTenantId: owner?.tenantId ?? '',
    code: opts.code,
    codeOwnerTenantId: owner?.tenantId ?? null,
    alreadyAttributed: store.byReferred.has(opts.referredTenantId),
  });
  store.attributions.set(attr.id, attr);
  store.byReferred.set(attr.referredTenantId, attr.id);
  return attr;
}

/** Primera venta → qualify + credit bilateral idempotente. */
export function onFirstSaleCredit(
  store: ReferralStore,
  referredTenantId: string,
  nowIso: string,
): {
  credited: boolean;
  inviteUrlPreview: string | null;
} {
  const attrId = store.byReferred.get(referredTenantId);
  if (!attrId) return { credited: false, inviteUrlPreview: null };
  let attr = store.attributions.get(attrId)!;
  attr = qualifyAttribution(attr);
  const plan = planBilateralCredit(attr);
  if (plan.alreadyCredited) {
    return { credited: false, inviteUrlPreview: null };
  }
  for (const tid of [plan.referredTenantId, plan.referrerTenantId]) {
    const cur = store.trials.get(tid) ?? { tenantId: tid, trialEndsAt: null };
    store.trials.set(tid, {
      tenantId: tid,
      trialEndsAt: extendTrialEndsAt(cur.trialEndsAt, plan.creditDays, nowIso),
    });
  }
  attr = { ...attr, status: 'credited' };
  store.attributions.set(attr.id, attr);
  const refCode = ensureReferralCode(store, plan.referrerTenantId);
  return {
    credited: true,
    inviteUrlPreview: brandInviteUrl('https://kipuspay.com', refCode.code),
  };
}
