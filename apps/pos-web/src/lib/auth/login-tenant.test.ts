import { describe, expect, it, vi } from 'vitest';
import { MISSING_TENANT_MESSAGE, resolveLoginTenantId } from './login-tenant.js';
import { cashierLogin } from './cashier-login.js';
import { TENANT_SESSION_KEY, type PosTenantSession } from '../tenant/session.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

function sessionWithTenant(tenantId: string): Storage {
  const session: PosTenantSession = {
    tenantId,
    tradeName: 'Tienda Test',
    formalizationMode: 'INTERNAL_CONTROL',
    taxRegime: 'RG',
    verticalType: 'retail',
    onboardingStartedAtIso: null,
    firstSaleAtIso: null,
    brandQrEnabled: true,
    referralCode: null,
  };
  return memoryStorage({ [TENANT_SESSION_KEY]: JSON.stringify(session) });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('resolveLoginTenantId — hidratación robusta', () => {
  it('retorna tenant de sessionStorage cuando existe', () => {
    const ss = sessionWithTenant('t-session');
    const ls = memoryStorage({ kipuspay_tenant_id: 't-local' });
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '?tenant=t-query',
    });
    expect(tenant).toBe('t-session');
  });

  it('si sessionStorage vacío, usa query param ?tenant=', () => {
    const ss = memoryStorage();
    const ls = memoryStorage({ kipuspay_tenant_id: 't-local' });
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '?tenant=t-query',
    });
    expect(tenant).toBe('t-query');
  });

  it('si session y query vacíos, usa localStorage kipuspay_tenant_id', () => {
    const ss = memoryStorage();
    const ls = memoryStorage({ kipuspay_tenant_id: 't-local' });
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '',
    });
    expect(tenant).toBe('t-local');
  });

  it('retorna vacío cuando todo está vacío → debe mostrar ayuda', () => {
    const ss = memoryStorage();
    const ls = memoryStorage();
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '',
    });
    expect(tenant).toBe('');
    expect(MISSING_TENANT_MESSAGE).toContain('Selecciona tu tienda');
  });

  it('ignora tenantId vacío o solo espacios en sessionStorage y cae a query', () => {
    const ss = sessionWithTenant('   ');
    const ls = memoryStorage();
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '?tenant=t-query',
    });
    expect(tenant).toBe('t-query');
  });

  it('ignora valores demo defensivos y cae al siguiente fallback', () => {
    const ss = sessionWithTenant('demo');
    const ls = memoryStorage({ kipuspay_tenant_id: 't-local' });
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: ls,
      search: '',
    });
    expect(tenant).toBe('t-local');
  });

  it('ignora t-demo/s-demo/b-demo como placeholders', () => {
    const ss = sessionWithTenant('t-demo');
    const tenant = resolveLoginTenantId({
      sessionStorage: ss,
      localStorage: memoryStorage({ kipuspay_tenant_id: 't-real' }),
      search: '',
    });
    expect(tenant).toBe('t-real');
  });

  it('trimmea espacios alrededor de ?tenant=', () => {
    const tenant = resolveLoginTenantId({
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      search: '?tenant=%20t-spaced%20',
    });
    expect(tenant).toBe('t-spaced');
  });

  it('tolera storage bloqueado sin lanzar', () => {
    const broken: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    const tenant = resolveLoginTenantId({
      sessionStorage: broken as Storage,
      localStorage: broken as Storage,
      search: '?tenant=t-query',
    });
    // query aún debe resolver aunque storages fallen
    expect(tenant).toBe('t-query');
  });
});

describe('login guard — nunca enviar tenantId vacío', () => {
  it('tenant vacío → no fetchea, muestra ayuda (MISSING_TENANT_MESSAGE)', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const tenantId = resolveLoginTenantId({
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      search: '',
    });
    expect(tenantId).toBe('');
    // Simula el guard del +page.svelte: si no hay tenant, no se llama a cashierLogin
    if (!tenantId) {
      expect(MISSING_TENANT_MESSAGE).toContain('Selecciona tu tienda');
      expect(fetcher).not.toHaveBeenCalled();
      return;
    }
    // No debe llegar aquí
    await cashierLogin({
      apiBase: '',
      tenantId,
      identifier: 'EMP-RN-001',
      pin: '246810',
      fetcher,
    });
    expect(fetcher).toHaveBeenCalled();
  });

  it('con query param → fetchea con tenant correcto', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse({
        token: 'jwt-abc',
        expiresAt: '2026-08-14T00:00:00.000Z',
        user: { userId: 'u1', role: 'cashier', branchId: 'b1' },
      }),
    );
    const tenantId = resolveLoginTenantId({
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      search: '?tenant=t-query',
    });
    expect(tenantId).toBe('t-query');
    const result = await cashierLogin({
      apiBase: '',
      tenantId,
      identifier: 'EMP-RN-001',
      pin: '246810',
      fetcher,
    });
    expect(result.token).toBe('jwt-abc');
    const body = JSON.parse((fetcher.mock.calls[0]?.[1] as RequestInit)?.body as string) as {
      tenantId: string;
    };
    expect(body.tenantId).toBe('t-query');
  });

  it('con localStorage → fetchea con tenant correcto cuando query vacío', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse({
        token: 'jwt-abc',
        expiresAt: '2026-08-14T00:00:00.000Z',
        user: { userId: 'u1', role: 'cashier', branchId: 'b1' },
      }),
    );
    const tenantId = resolveLoginTenantId({
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage({ kipuspay_tenant_id: 't-local' }),
      search: '',
    });
    expect(tenantId).toBe('t-local');
    await cashierLogin({
      apiBase: '',
      tenantId,
      identifier: 'EMP-RN-001',
      pin: '246810',
      fetcher,
    });
    const body = JSON.parse((fetcher.mock.calls[0]?.[1] as RequestInit)?.body as string) as {
      tenantId: string;
    };
    expect(body.tenantId).toBe('t-local');
  });

  it('con sessionStorage → fetchea con tenant de sesión aunque query/local existan', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValue(
      jsonResponse({
        token: 'jwt-abc',
        expiresAt: '2026-08-14T00:00:00.000Z',
        user: { userId: 'u1', role: 'cashier', branchId: 'b1' },
      }),
    );
    const tenantId = resolveLoginTenantId({
      sessionStorage: sessionWithTenant('t-session'),
      localStorage: memoryStorage({ kipuspay_tenant_id: 't-local' }),
      search: '?tenant=t-query',
    });
    expect(tenantId).toBe('t-session');
    await cashierLogin({
      apiBase: '',
      tenantId,
      identifier: 'EMP-RN-001',
      pin: '246810',
      fetcher,
    });
    const body = JSON.parse((fetcher.mock.calls[0]?.[1] as RequestInit)?.body as string) as {
      tenantId: string;
    };
    expect(body.tenantId).toBe('t-session');
  });
});
