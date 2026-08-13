/**
 * Cliente HTTP de aplicación — contrato de auth unificado (F1).
 *
 * Origen de autorización (fail-closed, nunca un fallback "demo"):
 *   1. PUBLIC_DEV_AUTH explícito (solo desarrollo local/e2e).
 *   2. Token de cajero `kipuspay_token` (JWT emitido por cashier-login).
 *   3. Sin header: el middleware del worker responde 401 UNAUTHENTICATED.
 *
 * Base URL única: PUBLIC_API_BASE → override local `kipuspay_api_base`
 * (harness de sync dev) → mismo origen.
 */

export interface ApiAuthHeaders {
  readonly authorization?: string;
}

function browserStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function resolveApiAuth(storage?: Pick<Storage, 'getItem'> | null): ApiAuthHeaders {
  const devAuth = import.meta.env.PUBLIC_DEV_AUTH as string | undefined;
  if (devAuth) return { authorization: devAuth };
  const store = storage ?? browserStorage();
  let token: string | null = null;
  try {
    token = store?.getItem('kipuspay_token') ?? null;
  } catch {
    // storage bloqueado: sin token.
  }
  if (!token) return {};
  return { authorization: `Bearer ${token}` };
}

export function resolveApiBase(storage?: Pick<Storage, 'getItem'> | null): string {
  const envBase = import.meta.env.PUBLIC_API_BASE as string | undefined;
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
  const doFetch = init.fetcher ?? fetch;
  const response = await doFetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers,
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
