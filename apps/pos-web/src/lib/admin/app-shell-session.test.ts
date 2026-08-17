import { describe, expect, it, vi } from 'vitest';
import { loadAuthenticatedAppShellSession } from './app-shell-session.js';

function storage(terminalId = 'terminal-a', tenantId = 'tenant-x'): Storage {
  const values = new Map([
    ['kipuspay:pos-terminal-id', terminalId],
    ['kipuspay_tenant_id', tenantId],
  ]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe('authenticated app-shell session', () => {
  it('bootstraps JWT-derived role and an active trusted terminal session', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 'user-a',
          role: 'cashier',
          branchId: 'branch-a',
          terminal: {
            terminalId: 'terminal-a',
            terminalSessionId: 'terminal-session-a',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const session = await loadAuthenticatedAppShellSession({
      fetcher,
      storage: storage(),
      authorization: 'Bearer test',
    });
    expect(session).toMatchObject({
      role: 'cashier',
      userId: 'user-a',
      branchId: 'branch-a',
      terminal: {
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'terminal-session-a',
      },
    });
    const bootstrap = fetcher.mock.calls[0] as [string, RequestInit];
    expect(bootstrap[0]).toBe('/api/auth/session');
    expect(new Headers(bootstrap[1].headers).get('authorization')).toBe('Bearer test');
    expect(new Headers(bootstrap[1].headers).get('x-tenant-id')).toBe('tenant-x');
    expect(new Headers(bootstrap[1].headers).get('x-terminal-id')).toBe('terminal-a');

    await session?.authenticatedFetch('/api/orders/customer-orders');
    const authenticated = fetcher.mock.calls[1] as [string, RequestInit];
    expect(authenticated[0]).toBe('/api/orders/customer-orders');
    expect(new Headers(authenticated[1].headers).get('authorization')).toBe('Bearer test');
    expect(new Headers(authenticated[1].headers).get('x-tenant-id')).toBe('tenant-x');
    expect(new Headers(authenticated[1].headers).get('x-terminal-id')).toBe('terminal-a');
    expect(new Headers(authenticated[1].headers).get('x-terminal-session-id')).toBe(
      'terminal-session-a',
    );
  });

  it('absolutiza paths relativos contra apiBase (POS y API en orígenes distintos)', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 'user-a',
          role: 'cashier',
          branchId: 'branch-a',
          terminal: { terminalId: 'terminal-a', terminalSessionId: 'terminal-session-a' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const session = await loadAuthenticatedAppShellSession({
      fetcher,
      storage: storage(),
      authorization: 'Bearer test',
      apiBase: 'https://api.kipuspay.com/',
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.kipuspay.com/api/auth/session');
    await session?.authenticatedFetch('/api/backups');
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.kipuspay.com/api/backups');
  });

  it('allows owner read session without inventing a cash terminal', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ userId: 'owner-a', role: 'owner', branchId: '', terminal: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    await expect(
      loadAuthenticatedAppShellSession({ fetcher, storage: storage('') }),
    ).resolves.toMatchObject({ role: 'owner', terminal: null });
  });

  it('fails closed for absent or malformed authenticated session', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ role: 'cashier' }), { status: 200 }));
    await expect(
      loadAuthenticatedAppShellSession({ fetcher, storage: storage() }),
    ).resolves.toBeNull();
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 }),
    );
    await expect(
      loadAuthenticatedAppShellSession({ fetcher, storage: storage() }),
    ).resolves.toBeNull();
  });
});
