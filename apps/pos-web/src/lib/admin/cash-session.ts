/**
 * S10-D7 — contexto real de caja para clientes del POS.
 * Fe de errata de integración: varias páginas enviaban branchId/sessionId
 * demo ('b-demo'/'s-demo'); el server las rechazaba en producción. Fuente de
 * verdad: el login del claim/cajero (kipuspay_user) y la sesión de caja del
 * claim de onboarding (módulo). Fail-closed: sin sesión → '' (nunca demo).
 */
import { readLastOnboardingClaim } from '../auth/onboarding-claim.js';
import { readLoginUser } from '../auth/token-store.js';

export interface CashSessionContext {
  readonly branchId: string;
  readonly sessionId: string;
}

export function tenantBranchId(storage?: Pick<Storage, 'getItem'> | null): string {
  return readLoginUser(storage)?.branchId ?? '';
}

export function cashSessionContext(storage?: Pick<Storage, 'getItem'> | null): CashSessionContext {
  const resolvedStorage = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  const branchId = tenantBranchId(resolvedStorage);
  let tenantId = '';
  try {
    tenantId = resolvedStorage?.getItem('kipuspay_tenant_id')?.trim() ?? '';
  } catch {
    // Sin identidad de tenant verificable no se reutiliza una caja persistida.
  }
  const onboarding = readLastOnboardingClaim();
  return {
    branchId,
    sessionId:
      branchId && tenantId && onboarding?.branchId === branchId && onboarding.tenantId === tenantId
        ? onboarding.sessionId
        : '',
  };
}

/** Inicializador SSR-safe para $state top-level (localStorage no existe en el server). */
export function initTenantBranchId(): string {
  return typeof localStorage === 'undefined' ? '' : tenantBranchId(localStorage);
}

export function initCashSessionContext(): CashSessionContext {
  return typeof localStorage === 'undefined'
    ? { branchId: '', sessionId: '' }
    : cashSessionContext(localStorage);
}
