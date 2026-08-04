import { isPremiumFeatureRoute } from './plan-routes.js';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled';
export type TenantStatus = 'active' | 'suspended';

export interface AuthTenantSnapshot {
  readonly id: string;
  readonly status: TenantStatus;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly trialEndsAt: string | null;
  /** true cuando ya venció el periodo de gracia post past_due (especificación §3). */
  readonly pastGracePeriod: boolean;
}

export type RevocationLookup =
  { readonly available: true; readonly revoked: boolean } | { readonly available: false };

export interface AuthGateInput {
  readonly hasBearerJwt: boolean;
  readonly jwtValid: boolean;
  readonly tenantHintMismatch: boolean;
  readonly tenant: AuthTenantSnapshot | null;
  readonly tenantLookupFailed: boolean;
  readonly revocation: RevocationLookup;
  readonly path: string;
  readonly nowMs: number;
}

export interface AuthGateDeny {
  readonly ok: false;
  readonly status: 401 | 403 | 402 | 404 | 503;
  readonly code: string;
  readonly error: string;
}

export type AuthGateResult = { readonly ok: true } | AuthGateDeny;

function deny(status: AuthGateDeny['status'], code: string, error: string): AuthGateDeny {
  return { ok: false, status, code, error };
}

function identityGate(input: AuthGateInput): AuthGateResult | null {
  if (!input.hasBearerJwt || !input.jwtValid) {
    return deny(401, 'UNAUTHENTICATED', 'Missing or invalid Bearer JWT');
  }
  if (input.tenantHintMismatch) {
    return deny(403, 'TENANT_HINT_MISMATCH', 'Tenant hint mismatch with verified JWT');
  }
  if (input.tenantLookupFailed) {
    return deny(503, 'AUTH_CONTROL_UNAVAILABLE', 'Tenant control plane unavailable');
  }
  if (!input.tenant) {
    return deny(404, 'TENANT_NOT_FOUND', 'Tenant non-existent');
  }
  return null;
}

function revocationGate(input: AuthGateInput): AuthGateResult | null {
  // Invariante 5: sin verificación de revocación → 503, nunca acceso por omisión.
  if (!input.revocation.available) {
    return deny(503, 'REVOCATION_CHECK_UNAVAILABLE', 'Tenant revocation control plane unavailable');
  }
  if (input.revocation.revoked) {
    return deny(403, 'TENANT_REVOKED', 'Tenant account suspended or revoked');
  }
  if (input.tenant && input.tenant.status !== 'active') {
    return deny(403, 'TENANT_INACTIVE', 'Tenant account inactive');
  }
  return null;
}

function planGate(input: AuthGateInput): AuthGateResult {
  const tenant = input.tenant;
  if (!tenant || !isPremiumFeatureRoute(input.path)) {
    return { ok: true };
  }

  if (tenant.subscriptionStatus === 'trial' && tenant.trialEndsAt) {
    const trialEnd = Date.parse(tenant.trialEndsAt);
    if (Number.isFinite(trialEnd) && input.nowMs > trialEnd) {
      return deny(
        402,
        'TRIAL_EXPIRED',
        'Payment Required: Trial period expired. Please upgrade your plan.',
      );
    }
  }

  if (
    (tenant.subscriptionStatus === 'past_due' || tenant.subscriptionStatus === 'canceled') &&
    tenant.pastGracePeriod
  ) {
    return deny(
      402,
      'SUBSCRIPTION_INACTIVE',
      'Payment Required: Subscription past due or canceled.',
    );
  }

  return { ok: true };
}

/**
 * Decisión pura del gate de auth/plan (SEC-01 + fail-closed + Plan Guard).
 * Sin Hono/D1: testeable en Vitest node; el middleware solo adapta headers/env.
 */
export function decideAuthGate(input: AuthGateInput): AuthGateResult {
  return identityGate(input) ?? revocationGate(input) ?? planGate(input);
}
