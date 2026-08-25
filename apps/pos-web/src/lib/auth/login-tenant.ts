/**
 * Hidratación robusta de tenant para el login del POS (S11 UI real).
 *
 * Orden de resolución cuando sessionStorage está vacío:
 *   1. sessionStorage kipuspay.pos.tenant.v1 (JSON con tenantId)
 *   2. query param ?tenant=
 *   3. localStorage kipuspay_tenant_id
 * Si sigue vacío, el login no debe disparar fetch con tenantId vacío.
 */

import { readTenantSession, TENANT_SESSION_KEY, type PosTenantSession } from '../tenant/session.js';
import { LOGIN_TENANT_KEY } from './token-store.js';

export const MISSING_TENANT_MESSAGE =
  'Selecciona tu tienda o usa el enlace de acceso que te compartió tu administrador. Debe abrirse con el identificador de tu tienda (?tenant=...&onboarding=1).';

function isUsableTenantId(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'demo') return false;
  if (lower === 't-demo') return false;
  if (lower === 's-demo') return false;
  if (lower === 'b-demo') return false;
  return true;
}

function tenantFromSessionStorage(ss: Pick<Storage, 'getItem'> | null | undefined): string {
  if (!ss) return '';
  try {
    const raw = ss.getItem(TENANT_SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PosTenantSession;
        const tid = typeof parsed.tenantId === 'string' ? parsed.tenantId.trim() : '';
        if (isUsableTenantId(tid)) return tid;
      } catch {
        // JSON corrupto
      }
    }
  } catch {
    // storage bloqueado
  }
  try {
    const sess = readTenantSession(ss as Storage);
    const tid = sess.tenantId?.trim() ?? '';
    if (isUsableTenantId(tid)) return tid;
  } catch {
    // storage bloqueado
  }
  return '';
}

function tenantFromSearch(search: string | undefined): string {
  try {
    const effective = search ?? (typeof window !== 'undefined' ? window.location.search : '');
    if (!effective) return '';
    const params = new URLSearchParams(effective);
    const tenant = params.get('tenant')?.trim() ?? '';
    if (isUsableTenantId(tenant)) return tenant;
  } catch {
    // URLSearchParams inválido
  }
  return '';
}

function tenantFromLocalStorage(ls: Pick<Storage, 'getItem'> | null | undefined): string {
  if (!ls) return '';
  try {
    const tenant = ls.getItem(LOGIN_TENANT_KEY)?.trim() ?? '';
    if (isUsableTenantId(tenant)) return tenant;
    const legacy = ls.getItem('kipuspay_tenant_id')?.trim() ?? '';
    if (isUsableTenantId(legacy)) return legacy;
  } catch {
    // storage bloqueado
  }
  return '';
}

export function resolveLoginTenantId(
  input: {
    sessionStorage?: Pick<Storage, 'getItem'> | null;
    localStorage?: Pick<Storage, 'getItem'> | null;
    search?: string;
  } = {},
): string {
  const fromSession = tenantFromSessionStorage(input.sessionStorage);
  if (fromSession) return fromSession;
  const fromSearch = tenantFromSearch(input.search);
  if (fromSearch) return fromSearch;
  const fromLocal = tenantFromLocalStorage(input.localStorage);
  if (fromLocal) return fromLocal;
  return '';
}
