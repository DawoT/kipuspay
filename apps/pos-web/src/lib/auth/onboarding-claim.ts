/**
 * Claim del token de onboarding (M6C) — single-use, minta la sesión del
 * owner. El PIN nunca vuelve a viajar: el token es la credencial del
 * primer acceso.
 */
import { resolveApiBase } from './api-client.js';
import { writeLoginTenantId, writeLoginToken, writeLoginUser } from './token-store.js';

export interface OnboardingClaimSession {
  readonly branchId: string;
  readonly sessionId: string;
  readonly tenantId: string;
}

let lastClaim: OnboardingClaimSession | null = null;
let lastClaimError: string | null = null;
/** F4: la sesión de caja del claim se persiste para sobrevivir a un reload. */
export const ONBOARDING_CLAIM_KEY = 'kipuspay.onboarding.claim';
/**
 * Single-flight (Sprint 7, fe de errata de walkthrough): el layout y la página
 * llaman el claim en paralelo al montar. Sin esto, el segundo caller veía la
 * URL ya limpia (el primero consumió el token), devolvía false y perdía el
 * resultado: el checkout encolaba la venta sin branchId/sessionId y el server
 * la rechazaba con "Invalid or closed cash register session".
 */
let inflightClaim: Promise<boolean> | null = null;

function claimStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // storage bloqueado: la sesión vive solo en memoria.
    return null;
  }
}

function readStoredClaim(): OnboardingClaimSession | null {
  const store = claimStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(ONBOARDING_CLAIM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingClaimSession>;
    if (typeof parsed?.branchId === 'string' && typeof parsed?.sessionId === 'string') {
      return {
        branchId: parsed.branchId,
        sessionId: parsed.sessionId,
        tenantId: parsed.tenantId ?? '',
      };
    }
  } catch {
    // storage corrupto: ignora y deja que el claim se reintente.
  }
  return null;
}

function persistClaim(claim: OnboardingClaimSession): void {
  const store = claimStorage();
  if (!store) return;
  try {
    store.setItem(ONBOARDING_CLAIM_KEY, JSON.stringify(claim));
  } catch {
    // storage bloqueado: no bloquea el flujo; la sesión vive en memoria.
  }
}

export function readLastOnboardingClaim(): OnboardingClaimSession | null {
  return lastClaim ?? readStoredClaim();
}

export function readLastOnboardingError(): string | null {
  return lastClaimError;
}

/** Consume el token si viene en la URL; idempotente y seguro para SSR. */
export async function claimOnboardingFromUrlIfPresent(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (inflightClaim) return inflightClaim;
  inflightClaim = claimFromUrlOnce().finally(() => {
    inflightClaim = null;
  });
  return inflightClaim;
}

async function claimFromUrlOnce(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('onboarding_token');
  const tenantIdFromUrl = params.get('tenant') ?? '';
  if (!token) return false;
  const result = await claimOnboardingToken({
    apiBase: resolveApiBase(localStorage),
    token,
  });
  if (!result.ok) {
    lastClaimError = result.message;
    return false;
  }
  writeLoginToken(localStorage, result.token);
  writeLoginUser(localStorage, {
    userId: result.user.userId,
    role: result.user.role,
    branchId: result.user.branchId,
  });
  if (tenantIdFromUrl) writeLoginTenantId(localStorage, tenantIdFromUrl);
  lastClaim = {
    branchId: result.user.branchId,
    sessionId: result.cashRegisterSessionId,
    tenantId: tenantIdFromUrl,
  };
  persistClaim(lastClaim);
  lastClaimError = null;
  params.delete('onboarding_token');
  const clean = params.toString();
  const next = clean ? `${window.location.pathname}?${clean}` : window.location.pathname;
  window.history.replaceState({}, '', next);
  return true;
}

export interface OnboardingClaimResult {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: { readonly userId: string; readonly role: string; readonly branchId: string };
  readonly cashRegisterSessionId: string;
}

export async function claimOnboardingToken(input: {
  readonly fetcher?: typeof fetch;
  readonly apiBase: string;
  readonly token: string;
}): Promise<({ ok: true } & OnboardingClaimResult) | { ok: false; code: string; message: string }> {
  const doFetch = input.fetcher ?? fetch;
  try {
    const res = await doFetch(`${input.apiBase.replace(/\/$/, '')}/api/onboarding/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: input.token }),
    });
    const data = (await res.json().catch(() => null)) as
      (OnboardingClaimResult & { code?: string; error?: string }) | null;
    if (!res.ok || !data?.token || !data.user) {
      return {
        ok: false,
        code: data?.code ?? 'CLAIM_REJECTED',
        message: data?.error ?? data?.code ?? 'No se pudo iniciar tu sesión.',
      };
    }
    return {
      ok: true,
      token: data.token,
      expiresAt: data.expiresAt,
      user: data.user,
      cashRegisterSessionId: data.cashRegisterSessionId,
    };
  } catch {
    return { ok: false, code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}
