/**
 * Guard global de sesión expirada (F5): cuando el worker responde 401 en una
 * ruta /api, el POS redirige a /login en vez de mostrar errores sueltos.
 * Nunca intercepta: el bootstrap de sesión, rutas públicas /v1 ni la propia
 * pantalla de login. Es un wrapper de fetch, no un reemplazo.
 */

export function installUnauthorizedGuard(input: {
  readonly fetcher?: typeof fetch;
  readonly locationAssign?: (href: string) => void;
  readonly pathname?: string;
  readonly allowlist?: readonly string[];
}): typeof fetch {
  const doFetch = input.fetcher ?? fetch;
  const assign = input.locationAssign ?? ((href: string) => window.location.assign(href));
  const pathname =
    input.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const allowlist = input.allowlist ?? ['/api/auth/session'];
  return async (request, init) => {
    const response = await doFetch(request, init);
    if (response.status !== 401) return response;
    if (pathname === '/login') return response;
    const url =
      typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    if (!url.includes('/api/')) return response;
    if (allowlist.some((path) => url.includes(path))) return response;
    assign('/login');
    return response;
  };
}
