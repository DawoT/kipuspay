/**
 * Cliente HTTP de aplicación — contrato de auth unificado (F1).
 *
 * Origen de autorización (fail-closed, nunca un fallback "demo"):
 *   1. PUBLIC_DEV_AUTH explícito (solo desarrollo local/e2e).
 *   2. Token de cajero `kipuspay_token` (JWT emitido por cashier-login).
 *   3. Sin header: el middleware del worker responde 401 UNAUTHENTICATED.
 *
 * Base URL única: PUBLIC_API_BASE → override local `kipuspay_api_base`
 * (harness de sync dev) → mismo origen. Env runtime vía $env/dynamic/public
 * (SvelteKit) — import.meta.env.PUBLIC_* no se reemplaza en build.
 */
import { env as publicEnv } from '$env/dynamic/public';

export interface ApiAuthHeaders {
  authorization?: string;
  /** Hint de tenant (shard): el middleware 403 si no coincide con el claim del JWT. */
  'x-tenant-id'?: string;
}

function browserStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function resolveApiAuth(storage?: Pick<Storage, 'getItem'> | null): ApiAuthHeaders {
  const devAuth = publicEnv.PUBLIC_DEV_AUTH;
  if (devAuth) return { authorization: devAuth };
  const store = storage ?? browserStorage();
  const headers: ApiAuthHeaders = {};
  let token: string | null = null;
  try {
    token = store?.getItem('kipuspay_token') ?? null;
  } catch {
    // storage bloqueado: sin token.
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  let tenantId: string | null = null;
  try {
    tenantId = store?.getItem('kipuspay_tenant_id') ?? null;
  } catch {
    // storage bloqueado: sin hint.
  }
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }
  return headers;
}

export function resolveApiBase(storage?: Pick<Storage, 'getItem'> | null): string {
  const envBase = publicEnv.PUBLIC_API_BASE;
  if (envBase) return envBase.replace(/\/$/, '');
  const store = storage ?? browserStorage();
  let localBase: string | null = null;
  try {
    localBase = store?.getItem('kipuspay_api_base') ?? null;
  } catch {
    // storage bloqueado: mismo origen.
  }
  return (localBase ?? '').replace(/\/$/, '');
}

/** Une path de API con la base (vacío = mismo origen / proxy Vite). */
export function absolutizeApiUrl(
  path: string,
  storage?: Pick<Storage, 'getItem'> | null,
  apiBase?: string,
): string {
  if (/^https?:\/\//i.test(path) || /^wss?:\/\//i.test(path)) return path;
  const base = (apiBase ?? resolveApiBase(storage)).replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Aplica authorization + hint x-tenant-id a un Headers mutable.
 * Los clientes autenticados que usan fetch directo (no apiFetch) deben
 * invocarlo: el middleware 403 si el tenant no coincide con el JWT.
 */
export function applyApiAuthHeaders(
  headers: Headers,
  storage?: Pick<Storage, 'getItem'> | null,
): void {
  const auth = resolveApiAuth(storage);
  if (auth.authorization) headers.set('authorization', auth.authorization);
  if (auth['x-tenant-id']) headers.set('x-tenant-id', auth['x-tenant-id']);
}

/** Hint de tenant desde storage ('' si no hay): para clientes con autorización propia. */
export function readTenantIdHint(storage?: Pick<Storage, 'getItem'> | null): string {
  return resolveApiAuth(storage)['x-tenant-id'] ?? '';
}

export async function apiFetch(
  path: string,
  init: {
    readonly apiBase?: string;
    readonly storage?: Pick<Storage, 'getItem'> | null;
    readonly headers?: Record<string, string>;
    readonly allowUnauthorizedRedirect?: boolean;
    readonly fetcher?: typeof fetch;
    readonly method?: string;
    readonly body?: BodyInit | null;
  } = {},
): Promise<Response> {
  const base = (init.apiBase ?? resolveApiBase(init.storage)).replace(/\/$/, '');
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  const auth = resolveApiAuth(init.storage);
  if (auth.authorization && !headers.authorization) headers.authorization = auth.authorization;
  if (auth['x-tenant-id'] && !headers['x-tenant-id']) headers['x-tenant-id'] = auth['x-tenant-id'];
  const doFetch = init.fetcher ?? fetch;
  const response = await doFetch(absolutizeApiUrl(path, init.storage, base), {
    method: init.method ?? 'GET',
    headers,
    credentials: 'include',
    body: init.body,
  });
  if (
    response.status === 401 &&
    init.allowUnauthorizedRedirect !== false &&
    typeof window !== 'undefined'
  ) {
    window.location.assign('/login');
  }
  return response;
}
