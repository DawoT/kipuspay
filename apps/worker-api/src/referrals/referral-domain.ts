/**
 * Referidos 1+1 mes — GTM §7.1 / ADR-0009.
 * Puro: sin D1; el adaptador aplica créditos con db.batch.
 */

export type AttributionStatus = 'captured' | 'qualified' | 'credited';

export const REFERRAL_CREDIT_DAYS = 30;

export interface ReferralCodeRecord {
  readonly tenantId: string;
  readonly code: string;
}

export interface AttributionRecord {
  readonly id: string;
  readonly referredTenantId: string;
  readonly referrerTenantId: string;
  readonly referralCode: string;
  readonly status: AttributionStatus;
}

export function normalizeReferralCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

export function mintReferralCode(tenantId: string): string {
  const base =
    tenantId
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(-6) || 'KP';
  const salt = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  return normalizeReferralCode(`KP${base}${salt}`);
}

export function brandInviteUrl(marketingOrigin: string, code: string): string {
  const origin = marketingOrigin.replace(/\/$/, '');
  return `${origin}/empezar?ref=${encodeURIComponent(code)}`;
}

export function assertValidCapture(opts: {
  readonly referredTenantId: string;
  readonly referrerTenantId: string;
  readonly code: string;
  readonly codeOwnerTenantId: string | null;
}): void {
  const code = normalizeReferralCode(opts.code);
  if (!code || code.length < 4) throw new Error('Codigo de referido invalido');
  if (!opts.codeOwnerTenantId) throw new Error('Codigo de referido desconocido');
  if (opts.codeOwnerTenantId !== opts.referrerTenantId) {
    throw new Error('Codigo de referido no coincide con el referidor');
  }
  if (opts.referredTenantId === opts.referrerTenantId) {
    throw new Error('No puedes referirte a ti mismo');
  }
}

export function captureAttribution(input: {
  readonly id: string;
  readonly referredTenantId: string;
  readonly referrerTenantId: string;
  readonly code: string;
  readonly codeOwnerTenantId: string | null;
  readonly alreadyAttributed: boolean;
}): AttributionRecord {
  if (input.alreadyAttributed) {
    throw new Error('Este negocio ya tiene un referido atribuido');
  }
  assertValidCapture({
    referredTenantId: input.referredTenantId,
    referrerTenantId: input.referrerTenantId,
    code: input.code,
    codeOwnerTenantId: input.codeOwnerTenantId,
  });
  return {
    id: input.id,
    referredTenantId: input.referredTenantId,
    referrerTenantId: input.referrerTenantId,
    referralCode: normalizeReferralCode(input.code),
    status: 'captured',
  };
}

export function qualifyAttribution(attr: AttributionRecord): AttributionRecord {
  if (attr.status === 'credited') return attr;
  if (attr.status === 'qualified') return attr;
  return { ...attr, status: 'qualified' };
}

export interface CreditPlan {
  readonly attributionId: string;
  readonly referredTenantId: string;
  readonly referrerTenantId: string;
  readonly creditDays: number;
  /** true si ya estaba credited — no reaplicar días */
  readonly alreadyCredited: boolean;
}

export function planBilateralCredit(attr: AttributionRecord): CreditPlan {
  if (attr.status === 'credited') {
    return {
      attributionId: attr.id,
      referredTenantId: attr.referredTenantId,
      referrerTenantId: attr.referrerTenantId,
      creditDays: REFERRAL_CREDIT_DAYS,
      alreadyCredited: true,
    };
  }
  if (attr.status !== 'qualified' && attr.status !== 'captured') {
    throw new Error('Atribucion no elegible para credito');
  }
  return {
    attributionId: attr.id,
    referredTenantId: attr.referredTenantId,
    referrerTenantId: attr.referrerTenantId,
    creditDays: REFERRAL_CREDIT_DAYS,
    alreadyCredited: false,
  };
}

/** Extiende una fecha ISO/DATETIME por N días (UTC). */
export function extendTrialEndsAt(
  currentIso: string | null,
  creditDays: number,
  nowIso: string,
): string {
  const baseMs = currentIso ? Date.parse(currentIso) : Date.parse(nowIso);
  const from = Number.isFinite(baseMs) ? Math.max(baseMs, Date.parse(nowIso)) : Date.parse(nowIso);
  return new Date(from + creditDays * 86_400_000).toISOString();
}

/** K-factor: referidos credited / referrers activos que generaron ≥1 credited. */
export function computeKFactor(opts: {
  readonly creditedAttributions: number;
  readonly activeReferrersWithCredit: number;
}): number | null {
  if (opts.activeReferrersWithCredit <= 0) return null;
  return opts.creditedAttributions / opts.activeReferrersWithCredit;
}
