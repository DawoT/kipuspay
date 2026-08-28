import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from './control-plane.js';
import type { UserSession } from './idp-user.js';
import { clearSessionCapabilitiesCache, runAuthenticatedSessionHttp } from './session-route.js';

const cashier: UserSession = {
  userId: 'user-a',
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  allowedBranches: ['branch-a'],
  role: 'cashier',
  permissions: [],
};

afterEach(() => {
  clearSessionCapabilitiesCache();
});

function env(row: Record<string, unknown> | null): WorkerEnv {
  return {
    FEATURE_TENANT_CAPABILITIES_DYNAMIC: '0',
    DB: {
      prepare: vi.fn(() => {
        const statement: Record<string, unknown> = {
          bind: vi.fn(() => statement),
          first: vi.fn(() => Promise.resolve(row)),
          all: vi.fn(() => Promise.resolve({ results: [] })),
        };
        return statement as unknown as D1PreparedStatement;
      }),
      batch: vi.fn(),
    },
  } as unknown as WorkerEnv;
}

function envWithCaps(opts: {
  terminalRow?: Record<string, unknown> | null;
  capsByTenant?: Record<string, string[]>;
  epochByTenant?: Record<string, number>;
  flag?: string;
  throwCaps?: boolean;
  throwEpoch?: boolean;
}): WorkerEnv & { prepareCalls: () => number } {
  let prepareCalls = 0;
  const capsByTenant = opts.capsByTenant ?? {};
  const epochByTenant = opts.epochByTenant ?? {};
  const terminalRow = opts.terminalRow ?? null;
  return {
    FEATURE_TENANT_CAPABILITIES_DYNAMIC: opts.flag ?? '1',
    DB: {
      prepare: vi.fn((sql: string) => {
        prepareCalls += 1;
        let bindArgs: unknown[] = [];
        const statement: Record<string, unknown> = {
          bind: vi.fn((...args: unknown[]) => {
            bindArgs = args;
            return statement;
          }),
          first: vi.fn(async () => {
            if (sql.includes('tenant_capabilities')) {
              // caps uses .all, not first; if called via first return null
              return null;
            }
            if (sql.includes('tenant_data_epochs')) {
              if (opts.throwEpoch) throw new Error('D1_DOWN_EPOCH');
              const tenantId = String(bindArgs[0] ?? '');
              const epoch = epochByTenant[tenantId];
              if (epoch === undefined) return null;
              return { epoch };
            }
            if (sql.includes('pos_terminals')) {
              return terminalRow;
            }
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('tenant_capabilities')) {
              if (opts.throwCaps) throw new Error('D1_DOWN_CAPS');
              const tenantId = String(bindArgs[0] ?? '');
              const caps = capsByTenant[tenantId] ?? [];
              return {
                results: caps.map((c) => ({ capability: c })),
              } as unknown as D1Result<unknown>;
            }
            return { results: [] } as unknown as D1Result<unknown>;
          }),
        };
        return statement as unknown as D1PreparedStatement;
      }),
      batch: vi.fn(),
    },
    prepareCalls: () => prepareCalls,
  } as unknown as WorkerEnv & { prepareCalls: () => number };
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
        capabilities: [],
        capabilitiesEpoch: 0,
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
      body: {
        userId: 'user-a',
        role: 'owner',
        branchId: '',
        terminal: null,
        capabilities: [],
        capabilitiesEpoch: 0,
      },
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
      capabilities: [],
      capabilitiesEpoch: 0,
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
      capabilities: [],
      capabilitiesEpoch: 0,
    });
  });
});

describe('Ola 2 — capabilities dinámicas (ADR-ARCH-003)', () => {
  it('retorna capabilities sorted + epoch cuando flag dinámico está activo', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout', 'inventory.batches', 'cash.blind_z'] },
      epochByTenant: { 'tenant-a': 42 },
      flag: '1',
    });
    const res = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(res.status).toBe(200);
    // DB almacenó desordenado, respuesta debe venir ordenada lexicográficamente
    expect(res.body.capabilities).toEqual(['cash.blind_z', 'inventory.batches', 'pos.checkout']);
    expect(res.body.capabilitiesEpoch).toBe(42);
  });

  it('respeta isolate cache 10s: segunda llamada no toca D1 para caps/epoch', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'] },
      epochByTenant: { 'tenant-a': 5 },
      flag: '1',
    });
    const first = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(first.status).toBe(200);
    const callsAfterFirst = envCap.prepareCalls();
    const second = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(second.status).toBe(200);
    const callsAfterSecond = envCap.prepareCalls();
    // caps + epoch son cacheados, solo terminal vuelve a consultar (1 prepare extra)
    // primera: caps(1) + epoch(1) + terminal(1) = 3 ; segunda: solo terminal(1) = 4 total
    expect(callsAfterSecond - callsAfterFirst).toBe(1);
    expect(second.body.capabilities).toEqual(['pos.checkout']);
    expect(second.body.capabilitiesEpoch).toBe(5);
  });

  it('fail-closed 503 CAPABILITIES_UNAVAILABLE cuando D1 falla leyendo caps', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'] },
      epochByTenant: { 'tenant-a': 1 },
      flag: '1',
      throwCaps: true,
    });
    const res = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(res).toEqual({ status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } });
  });

  it('fail-closed 503 CAPABILITIES_UNAVAILABLE cuando D1 falla leyendo epoch', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'] },
      epochByTenant: { 'tenant-a': 1 },
      flag: '1',
      throwEpoch: true,
    });
    const res = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(res).toEqual({ status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } });
  });

  it('kill-switch flag OFF: retorna [] y 0 sin consultar D1 aunque DB tenga datos', async () => {
    let capsQueried = false;
    let epochQueried = false;
    const envOff = {
      FEATURE_TENANT_CAPABILITIES_DYNAMIC: '0',
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('tenant_capabilities')) capsQueried = true;
          if (sql.includes('tenant_data_epochs')) epochQueried = true;
          const statement: Record<string, unknown> = {
            bind: vi.fn(() => statement),
            first: vi.fn(() =>
              Promise.resolve({ terminal_id: 'terminal-a', terminal_session_id: 'sess-a' }),
            ),
            all: vi.fn(() => Promise.resolve({ results: [{ capability: 'should-not-leak' }] })),
          };
          return statement as unknown as D1PreparedStatement;
        }),
        batch: vi.fn(),
      },
    } as unknown as WorkerEnv;
    const res = await runAuthenticatedSessionHttp(envOff, cashier, 'terminal-a');
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual([]);
    expect(res.body.capabilitiesEpoch).toBe(0);
    expect(capsQueried).toBe(false);
    expect(epochQueried).toBe(false);
  });

  it('kill-switch con flag undefined (default 0) también bloquea D1', async () => {
    let capsQueried = false;
    const envOff = {
      DB: {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('tenant_capabilities')) capsQueried = true;
          const statement: Record<string, unknown> = {
            bind: vi.fn(() => statement),
            first: vi.fn(() =>
              Promise.resolve({ terminal_id: 'terminal-a', terminal_session_id: 'sess-a' }),
            ),
            all: vi.fn(() => Promise.resolve({ results: [] })),
          };
          return statement as unknown as D1PreparedStatement;
        }),
        batch: vi.fn(),
      },
    } as unknown as WorkerEnv;
    const res = await runAuthenticatedSessionHttp(envOff, cashier, 'terminal-a');
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual([]);
    expect(capsQueried).toBe(false);
  });

  it('owner también recibe capabilities + epoch (no solo cashier)', async () => {
    const envCap = envWithCaps({
      capsByTenant: { 'tenant-a': ['owner.mode', 'pos.checkout'] },
      epochByTenant: { 'tenant-a': 7 },
      flag: '1',
    });
    const res = await runAuthenticatedSessionHttp(
      envCap,
      { ...cashier, role: 'owner', branchId: '' },
      '',
    );
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual(['owner.mode', 'pos.checkout']);
    expect(res.body.capabilitiesEpoch).toBe(7);
    expect(res.body.terminal).toBeNull();
  });

  it('tenant isolation: tenant-a no ve capabilities de tenant-b', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'], 'tenant-b': ['owner.mode'] },
      epochByTenant: { 'tenant-a': 10, 'tenant-b': 99 },
      flag: '1',
    });
    const resA = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(resA.body.capabilities).toEqual(['pos.checkout']);
    expect(resA.body.capabilitiesEpoch).toBe(10);
    clearSessionCapabilitiesCache();
    const cashierB: UserSession = { ...cashier, tenantId: 'tenant-b' };
    const envCapB = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'], 'tenant-b': ['owner.mode'] },
      epochByTenant: { 'tenant-a': 10, 'tenant-b': 99 },
      flag: '1',
    });
    const resB = await runAuthenticatedSessionHttp(envCapB, cashierB, 'terminal-a');
    expect(resB.body.capabilities).toEqual(['owner.mode']);
    expect(resB.body.capabilitiesEpoch).toBe(99);
  });

  it('epoch 0 cuando tenant_data_epochs sin fila (tenant nuevo)', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': ['pos.checkout'] },
      epochByTenant: {}, // sin fila
      flag: '1',
    });
    const res = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(res.status).toBe(200);
    expect(res.body.capabilitiesEpoch).toBe(0);
  });

  it('flag ON sin DB → 503 CAPABILITIES_UNAVAILABLE (fail-closed), nunca 200 vacío', async () => {
    const envNoDb = { FEATURE_TENANT_CAPABILITIES_DYNAMIC: '1' } as unknown as WorkerEnv;
    const res = await runAuthenticatedSessionHttp(
      envNoDb,
      { ...cashier, role: 'owner', branchId: '' },
      '',
    );
    expect(res).toEqual({ status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } });
  });

  it('capabilities vacías cuando tenant no tiene filas enabled=1', async () => {
    const envCap = envWithCaps({
      terminalRow: { terminal_id: 'terminal-a', terminal_session_id: 'sess-a' },
      capsByTenant: { 'tenant-a': [] },
      epochByTenant: { 'tenant-a': 3 },
      flag: '1',
    });
    const res = await runAuthenticatedSessionHttp(envCap, cashier, 'terminal-a');
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual([]);
    expect(res.body.capabilitiesEpoch).toBe(3);
  });
});
