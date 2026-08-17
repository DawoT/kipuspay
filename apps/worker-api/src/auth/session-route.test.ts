import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from './control-plane.js';
import type { UserSession } from './idp-user.js';
import { runAuthenticatedSessionHttp } from './session-route.js';

const cashier: UserSession = {
  userId: 'user-a',
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  allowedBranches: ['branch-a'],
  role: 'cashier',
  permissions: [],
};

function env(row: Record<string, unknown> | null): WorkerEnv {
  return {
    DB: {
      prepare: vi.fn(() => {
        const statement = {
          bind: vi.fn(() => statement),
          first: vi.fn(() => Promise.resolve(row)),
        };
        return statement;
      }),
      batch: vi.fn(),
    },
  } as unknown as WorkerEnv;
}

describe('authenticated app-shell session route', () => {
  it('returns only a server-verified active terminal session for cash roles', async () => {
    await expect(
      runAuthenticatedSessionHttp(
        env({ terminal_id: 'terminal-a', terminal_session_id: 'terminal-session-a' }),
        cashier,
        'terminal-a',
      ),
    ).resolves.toEqual({
      status: 200,
      body: {
        userId: 'user-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminal: {
          terminalId: 'terminal-a',
          terminalSessionId: 'terminal-session-a',
        },
      },
    });
  });

  it('fails closed when a cash role has no active matching terminal session', async () => {
    await expect(runAuthenticatedSessionHttp(env(null), cashier, 'terminal-a')).resolves.toEqual({
      status: 403,
      body: { code: 'TERMINAL_SESSION_REQUIRED' },
    });
  });

  it('allows owner read context but returns no cash-operating terminal', async () => {
    await expect(
      runAuthenticatedSessionHttp(env(null), { ...cashier, role: 'owner', branchId: '' }, ''),
    ).resolves.toEqual({
      status: 200,
      body: { userId: 'user-a', role: 'owner', branchId: '', terminal: null },
    });
  });

  it('rejects absent authenticated user', async () => {
    await expect(runAuthenticatedSessionHttp(env(null), undefined, '')).resolves.toEqual({
      status: 401,
      body: { code: 'UNAUTHENTICATED' },
    });
  });

  it('S9-A2: expone billing status (anti-apagado) sin bloquear la caja', async () => {
    const tenant = {
      id: 'tenant-a',
      status: 'active' as const,
      subscriptionStatus: 'past_due' as const,
      trialEndsAt: null,
      pastGracePeriod: false,
    };
    const res = await runAuthenticatedSessionHttp(
      env({ terminal_id: 'terminal-a', terminal_session_id: 'terminal-session-a' }),
      cashier,
      'terminal-a',
      tenant,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      billing: {
        subscriptionStatus: 'past_due',
        trialEndsAt: null,
        pastGracePeriod: false,
      },
    });
    // owner (no cash role) también recibe billing.
    const ownerRes = await runAuthenticatedSessionHttp(
      env(null),
      { ...cashier, role: 'owner', branchId: '' },
      '',
      { ...tenant, subscriptionStatus: 'trial', trialEndsAt: '2026-08-20T00:00:00.000Z' },
    );
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body).toMatchObject({
      billing: { subscriptionStatus: 'trial', trialEndsAt: '2026-08-20T00:00:00.000Z' },
    });
  });
});
