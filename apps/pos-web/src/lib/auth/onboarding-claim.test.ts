import { describe, expect, it, vi } from 'vitest';
import { claimOnboardingToken } from './onboarding-claim.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installBrowserStubs(search: string) {
  const storage = new Map<string, string>();
  const windowMock = {
    location: { search, pathname: '/' },
    history: { replaceState: vi.fn() },
  } as unknown as Window & typeof globalThis;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
  return {
    storage,
    restore() {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    },
  };
}

describe('claim de onboarding (M6C)', () => {
  it('consume el token single-use y devuelve sesión + identidad + caja', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        token: 'jwt.sesion.owner',
        expiresAt: '2026-08-15T00:00:00.000Z',
        user: { userId: 'owner-1', role: 'owner', branchId: 'br-1' },
        cashRegisterSessionId: 'sess-1',
      }),
    );
    const res = await claimOnboardingToken({
      fetcher,
      apiBase: 'https://api.test',
      token: 'jwt.onboarding',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.token).toBe('jwt.sesion.owner');
    expect(res.user).toEqual({ userId: 'owner-1', role: 'owner', branchId: 'br-1' });
    expect(res.cashRegisterSessionId).toBe('sess-1');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/onboarding/claim');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'jwt.onboarding' });
  });

  it('token usado o inválido → 403 INVALID_TOKEN', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'Token used', code: 'INVALID_TOKEN' }, 403));
    const res = await claimOnboardingToken({
      fetcher,
      apiBase: 'https://api.test',
      token: 'viejo',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_TOKEN');
  });

  it('offline → error sin reventar', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await claimOnboardingToken({ fetcher, apiBase: 'https://api.test', token: 'x' });
    expect(res.ok).toBe(false);
  });

  it('single-flight (fe de errata de walkthrough): dos callers comparten el claim', async () => {
    vi.resetModules();
    const { claimOnboardingFromUrlIfPresent, readLastOnboardingClaim } =
      await import('./onboarding-claim.js');
    const stubs = installBrowserStubs('?onboarding_token=tok-1&tenant=t-x');
    const fetchMock = vi.fn();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    let resolveClaim!: (res: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolveClaim = resolve)),
    );

    const p1 = claimOnboardingFromUrlIfPresent();
    const p2 = claimOnboardingFromUrlIfPresent();
    // Un solo fetch para ambos callers (el layout y la página corren en paralelo).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveClaim(
      jsonResponse({
        token: 'jwt.sesion.owner',
        expiresAt: '2026-08-15T00:00:00.000Z',
        user: { userId: 'owner-1', role: 'owner', branchId: 'br-1' },
        cashRegisterSessionId: 'sess-9',
      }),
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readLastOnboardingClaim()).toEqual({
      branchId: 'br-1',
      sessionId: 'sess-9',
      tenantId: 't-x',
    });
    // El login quedó en storage: la página puede atar la sesión de caja.
    expect(stubs.storage.get('kipuspay_token')).toBe('jwt.sesion.owner');
    expect(stubs.storage.get('kipuspay_tenant_id')).toBe('t-x');
    stubs.restore();
  });

  it('sin token en la URL → false sin tocar el fetch', async () => {
    vi.resetModules();
    const { claimOnboardingFromUrlIfPresent } = await import('./onboarding-claim.js');
    const stubs = installBrowserStubs('');
    const fetchMock = vi.fn();
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    const ok = await claimOnboardingFromUrlIfPresent();
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    stubs.restore();
  });

  it('F-4: la sesión de caja persiste y rehidrata tras un reload', async () => {
    vi.resetModules();
    const { claimOnboardingFromUrlIfPresent, ONBOARDING_CLAIM_KEY } =
      await import('./onboarding-claim.js');
    const stubs = installBrowserStubs('?onboarding_token=tok-1&tenant=t-x');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        token: 'jwt.sesion.owner',
        expiresAt: '2026-08-15T00:00:00.000Z',
        user: { userId: 'owner-1', role: 'owner', branchId: 'br-1' },
        cashRegisterSessionId: 'sess-9',
      }),
    );
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });

    await claimOnboardingFromUrlIfPresent();
    expect(JSON.parse(stubs.storage.get(ONBOARDING_CLAIM_KEY) ?? '{}')).toEqual({
      branchId: 'br-1',
      sessionId: 'sess-9',
      tenantId: 't-x',
    });

    // Reload: módulo nuevo (memoria limpia) con el mismo localStorage → rehidrata.
    vi.resetModules();
    const fresh = await import('./onboarding-claim.js');
    expect(fresh.readLastOnboardingClaim()).toEqual({
      branchId: 'br-1',
      sessionId: 'sess-9',
      tenantId: 't-x',
    });
    stubs.restore();
  });
});
