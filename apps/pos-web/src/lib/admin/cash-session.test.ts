import { describe, expect, it, vi } from 'vitest';

function memoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
}

describe('cash-session (S10-D7, sin valores demo)', () => {
  it('con login real → branchId del login y sessionId del claim', async () => {
    vi.resetModules();
    const { tenantBranchId } = await import('./cash-session.js');
    const storage = memoryStorage({
      kipuspay_user: JSON.stringify({ userId: 'u1', role: 'owner', branchId: 'branch-real' }),
    });
    expect(tenantBranchId(storage)).toBe('branch-real');
    expect(tenantBranchId(memoryStorage({}))).toBe('');
    expect(tenantBranchId(null)).toBe('');
  });

  it('sin storage ni claim → fail-closed vacío, nunca demo', async () => {
    const { cashSessionContext } = await import('./cash-session.js');
    const ctx = cashSessionContext(memoryStorage({}));
    expect(ctx.branchId).toBe('');
    expect(ctx.sessionId).toBe('');
    expect(ctx.branchId).not.toContain('demo');
    expect(ctx.sessionId).not.toContain('demo');
  });

  it('en browser usa localStorage por defecto para completar la caja', async () => {
    vi.resetModules();
    const storage = memoryStorage({
      kipuspay_tenant_id: 'tenant-browser',
      kipuspay_user: JSON.stringify({ userId: 'u1', role: 'owner', branchId: 'branch-browser' }),
      'kipuspay.onboarding.claim': JSON.stringify({
        branchId: 'branch-browser',
        sessionId: 'cash-session-browser',
        tenantId: 'tenant-browser',
      }),
    });
    vi.stubGlobal('localStorage', storage);
    try {
      const { cashSessionContext } = await import('./cash-session.js');
      expect(cashSessionContext()).toEqual({
        branchId: 'branch-browser',
        sessionId: 'cash-session-browser',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('no mezcla una sesión de caja persistida de otro tenant o sucursal', async () => {
    vi.resetModules();
    const storage = memoryStorage({
      kipuspay_tenant_id: 'tenant-current',
      kipuspay_user: JSON.stringify({ userId: 'u2', role: 'owner', branchId: 'branch-current' }),
      'kipuspay.onboarding.claim': JSON.stringify({
        branchId: 'branch-old',
        sessionId: 'cash-session-old',
        tenantId: 'tenant-old',
      }),
    });
    vi.stubGlobal('localStorage', storage);
    try {
      const { cashSessionContext } = await import('./cash-session.js');
      expect(cashSessionContext()).toEqual({ branchId: 'branch-current', sessionId: '' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
