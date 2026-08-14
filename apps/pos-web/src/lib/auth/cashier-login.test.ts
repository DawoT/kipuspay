import { describe, expect, it, vi } from 'vitest';
import { cashierLogin, LoginError } from './cashier-login';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cashierLogin', () => {
  it('loguea con badge y PIN y devuelve el token', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse({
        token: 'jwt-abc',
        expiresAt: '2026-08-14T00:00:00.000Z',
        user: { userId: 'u1', role: 'cashier', branchId: 'b1' },
      }),
    );
    const result = await cashierLogin({
      apiBase: '',
      tenantId: 't1',
      identifier: 'EMP-12345',
      pin: '1234',
      fetcher,
    });
    expect(result.token).toBe('jwt-abc');
    expect(result.user.role).toBe('cashier');
    const call = fetcher.mock.calls[0];
    const url = typeof call?.[0] === 'string' ? call[0] : '';
    expect(url).toContain('/api/auth/cashier-login');
    const body = call?.[1];
    const sent = typeof body?.body === 'string' ? (JSON.parse(body.body) as unknown) : null;
    expect(sent).toMatchObject({
      tenantId: 't1',
      identifier: 'EMP-12345',
      pin: '1234',
    });
  });

  it('PIN inválido → LoginError PIN_INVALID', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ code: 'PIN_INVALID' }, 403)));
    await expect(
      cashierLogin({ apiBase: '', tenantId: 't1', identifier: 'u1', pin: '9999', fetcher }),
    ).rejects.toMatchObject({ code: 'PIN_INVALID' });
  });

  it('lockout → LoginError PIN_LOCKED', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ code: 'PIN_LOCKED' }, 403)));
    await expect(
      cashierLogin({ apiBase: '', tenantId: 't1', identifier: 'u1', pin: '1234', fetcher }),
    ).rejects.toMatchObject({ code: 'PIN_LOCKED' });
  });

  it('capability off → LoginError FEATURE_OFF', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ code: 'FEATURE_OFF' }, 404)));
    await expect(
      cashierLogin({ apiBase: '', tenantId: 't1', identifier: 'u1', pin: '1234', fetcher }),
    ).rejects.toThrow(LoginError);
  });

  it('sin red → LoginError LOGIN_OFFLINE sin TypeError', async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      cashierLogin({ apiBase: '', tenantId: 't1', identifier: 'u1', pin: '1234', fetcher }),
    ).rejects.toMatchObject({ code: 'LOGIN_OFFLINE' });
  });

  it('respuesta sin token → LoginError LOGIN_INVALID', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ user: {} })));
    await expect(
      cashierLogin({ apiBase: '', tenantId: 't1', identifier: 'u1', pin: '1234', fetcher }),
    ).rejects.toMatchObject({ code: 'LOGIN_INVALID' });
  });
});
