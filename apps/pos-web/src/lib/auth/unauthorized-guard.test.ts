import { describe, expect, it, vi } from 'vitest';
import { installUnauthorizedGuard } from './unauthorized-guard.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('guard de sesión expirada (401 → /login, F5)', () => {
  it('redirige a /login cuando el API responde 401 fuera de la allowlist', async () => {
    const assign = vi.fn();
    const inner = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED' }, 401));
    const guard = installUnauthorizedGuard({
      fetcher: inner,
      locationAssign: assign,
      pathname: '/caja',
      allowlist: ['/api/auth/session'],
    });
    const res = await guard('https://api.test/api/cash/movements');
    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('no redirige si ya estamos en /login (evita loops)', async () => {
    const assign = vi.fn();
    const inner = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED' }, 401));
    const guard = installUnauthorizedGuard({
      fetcher: inner,
      locationAssign: assign,
      pathname: '/login',
      allowlist: ['/api/auth/session'],
    });
    await guard('https://api.test/api/catalog/sellable');
    expect(assign).not.toHaveBeenCalled();
  });

  it('no redirige en el bootstrap de sesión (allowlist)', async () => {
    const assign = vi.fn();
    const inner = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED' }, 401));
    const guard = installUnauthorizedGuard({
      fetcher: inner,
      locationAssign: assign,
      pathname: '/',
      allowlist: ['/api/auth/session'],
    });
    await guard('https://api.test/api/auth/session');
    expect(assign).not.toHaveBeenCalled();
  });

  it('deja pasar respuestas no-401 sin tocar nada', async () => {
    const assign = vi.fn();
    const inner = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const guard = installUnauthorizedGuard({
      fetcher: inner,
      locationAssign: assign,
      pathname: '/',
      allowlist: ['/api/auth/session'],
    });
    const res = await guard('https://api.test/api/pos/totals', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(assign).not.toHaveBeenCalled();
    const [url, init] = inner.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/pos/totals');
    expect(init?.method).toBe('POST');
  });

  it('ignora rutas fuera de /api (webhooks públicos, referidos)', async () => {
    const assign = vi.fn();
    const inner = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    const guard = installUnauthorizedGuard({
      fetcher: inner,
      locationAssign: assign,
      pathname: '/',
      allowlist: ['/api/auth/session'],
    });
    await guard('https://api.test/v1/referrals/code');
    expect(assign).not.toHaveBeenCalled();
  });
});
