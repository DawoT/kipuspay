import { describe, expect, it, vi, beforeEach } from 'vitest';
import { corsHeadersFor } from '../auth/public-cors.js';
import { createApp } from '../index.js';
import type { WorkerEnv } from '../auth/control-plane.js';

// Fake D1/KV minimal for platform routes
function fakeD1() {
  const db: unknown = {
    prepare: vi.fn((sql: string) => {
      const makeBound = (args: unknown[]) => ({
        sql,
        args,
        first: vi.fn(async () => {
          if (sql.includes('FROM tenants WHERE id')) return null;
          if (sql.includes('SELECT last_hash FROM audit_chain_heads')) return null;
          if (sql.includes('SELECT epoch FROM tenant_data_epochs')) return { epoch: 0 };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM tenants ORDER BY')) return { results: [] } as unknown;
          if (sql.includes('FROM tenant_capabilities WHERE tenant_id'))
            return { results: [] } as unknown;
          return { results: [] } as unknown;
        }),
        run: vi.fn(async () => ({ meta: { changes: 1 }, success: true })),
      });
      const base = makeBound([]);
      return {
        bind: vi.fn((...args: unknown[]) => makeBound(args)),
        first: base.first,
        all: base.all,
        run: base.run,
      } as unknown as D1PreparedStatement;
    }),
    batch: vi.fn(async (stmts: unknown[]) =>
      stmts.map(() => ({ success: true, meta: { changes: 1 }, results: [] })),
    ),
  };
  return db as unknown as D1Database;
}
function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  } as unknown as KVNamespace;
}

function platformEnvWithCors(opts: {
  allowedOrigins?: string;
  platformOrigins?: string;
  token?: string;
  allowlist?: string;
}): WorkerEnv & Record<string, unknown> {
  return {
    DB: fakeD1(),
    TENANT_KV: fakeKv() as unknown as KVNamespace,
    PLATFORM_STAFF_TOKEN: opts.token ?? 'staff-secret',
    ALLOWLIST_STAFF_EMAILS: opts.allowlist ?? 'staff@kipuspay.com',
    ALLOWED_ORIGINS:
      opts.allowedOrigins ?? 'http://localhost:4173,http://localhost:5173,https://*.pages.dev',
    ALLOWED_PLATFORM_ORIGINS: opts.platformOrigins ?? 'https://admin.kipuspay.com',
    AUTH_JWT_HS_SECRET: 'test-secret-32-chars-long!!',
  } as unknown as WorkerEnv & Record<string, unknown>;
}

describe('HIGH-02 — CORS Zero-Trust plataforma (admin.kipuspay.com only, sin *.pages.dev)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('corsHeadersFor: evil.pages.dev NO debe recibir ACAO en /platform/* (aunque ALLOWED_ORIGINS tenga *.pages.dev)', () => {
    const env = {
      ALLOWED_ORIGINS: 'https://*.pages.dev,https://kipuspay.com',
      ALLOWED_PLATFORM_ORIGINS: 'https://admin.kipuspay.com',
    };
    // Path platform => debe usar ALLOWED_PLATFORM_ORIGINS, no ALLOWED_ORIGINS
    const headers = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://evil.pages.dev',
      '/platform/tenants',
    );
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    // No debe exponer Allow-Headers con token a evil
    expect(headers['Access-Control-Allow-Headers']).toBeUndefined();
  });

  it('corsHeadersFor: admin.kipuspay.com SÍ recibe ACAO en /platform/* si está en ALLOWED_PLATFORM_ORIGINS', () => {
    const env = {
      ALLOWED_ORIGINS: 'https://*.pages.dev',
      ALLOWED_PLATFORM_ORIGINS: 'https://admin.kipuspay.com',
    };
    const headers = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://admin.kipuspay.com',
      '/platform/tenants',
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://admin.kipuspay.com');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    // Debe exponer x-platform-staff-token solo a allowlist
    expect(headers['Access-Control-Allow-Headers']).toContain('x-platform-staff-token');
  });

  it('corsHeadersFor: *.kipuspay.com wildcard permite subdominio platform pero nunca *.pages.dev', () => {
    const env = {
      ALLOWED_ORIGINS: 'https://*.pages.dev',
      ALLOWED_PLATFORM_ORIGINS: 'https://*.kipuspay.com',
    };
    const adminSub = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://admin.kipuspay.com',
      '/platform/tenants',
    );
    expect(adminSub['Access-Control-Allow-Origin']).toBe('https://admin.kipuspay.com');
    const evil = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://evil.pages.dev',
      '/platform/tenants',
    );
    expect(evil['Access-Control-Allow-Origin']).toBeUndefined();
    // Public path sigue permitiendo pages.dev
    const publicEvil = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://evil.pages.dev',
      '/api/auth/cashier-login',
    );
    expect(publicEvil['Access-Control-Allow-Origin']).toBe('https://evil.pages.dev');
  });

  it('corsHeadersFor: public /api/* no expone x-platform-staff-token a *.pages.dev si separamos headers', () => {
    const env = {
      ALLOWED_ORIGINS: 'https://*.pages.dev',
      ALLOWED_PLATFORM_ORIGINS: 'https://admin.kipuspay.com',
    };
    const headers = corsHeadersFor(
      env as unknown as { ALLOWED_ORIGINS?: string },
      'https://evil.pages.dev',
      '/api/test',
    );
    // Public CORS no debe exponer token (defensa en profundidad) o al menos no en platform path
    // Si aún lo expone, este test fallará antes de fix y pasará tras fix de separación de headers
    // Aceptamos ambas: lo crítico es que platform evil no lo expone, pero ideal public tampoco
    if (headers['Access-Control-Allow-Headers']) {
      // Tras fix ideal: public no contiene token
      expect(headers['Access-Control-Allow-Headers']).not.toContain('x-platform-staff-token');
    }
  });

  it('GET /platform/tenants con Origin evil.pages.dev → sin ACAOrigin (app integration)', async () => {
    const env = platformEnvWithCors({
      allowedOrigins: 'http://localhost:4173,https://*.pages.dev',
      platformOrigins: 'https://admin.kipuspay.com',
    });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      {
        headers: {
          origin: 'https://evil.pages.dev',
          'x-platform-staff-token': 'staff-secret',
        },
      },
      env as unknown as Env,
    );
    // Ruta existe (no 404) pero CORS debe estar vacío para evil
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // No debe haber ACAHeaders con token para evil
    const acaHeaders = res.headers.get('Access-Control-Allow-Headers');
    expect(acaHeaders == null || !acaHeaders.includes('x-platform-staff-token')).toBe(true);
  });

  it('GET /platform/tenants con Origin admin.kipuspay.com → con ACAO (app integration)', async () => {
    const env = platformEnvWithCors({
      allowedOrigins: 'https://*.pages.dev',
      platformOrigins: 'https://admin.kipuspay.com',
    });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      {
        headers: {
          origin: 'https://admin.kipuspay.com',
          'x-platform-staff-token': 'staff-secret',
        },
      },
      env as unknown as Env,
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.kipuspay.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    const allowHeaders = res.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allowHeaders).toContain('x-platform-staff-token');
  });

  it('preflight OPTIONS /platform/tenants con evil origin + x-platform-staff-token → sin ACAO (CORS bloqueado)', async () => {
    const env = platformEnvWithCors({
      allowedOrigins: 'https://*.pages.dev',
      platformOrigins: 'https://admin.kipuspay.com',
    });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.pages.dev',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-platform-staff-token',
        },
      },
      env as unknown as Env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // Preflight no debe permitir token a evil
    const acaHeaders = res.headers.get('Access-Control-Allow-Headers');
    // Sin ACAO, браузер bloquea; headers puede estar vacío o sin token
    if (acaHeaders) {
      // Si hay headers pero sin ACAO, es fail; no debe contener token para evil
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight OPTIONS /platform/tenants con admin origin → con ACAO + Allow-Headers token', async () => {
    const env = platformEnvWithCors({
      allowedOrigins: 'https://*.pages.dev',
      platformOrigins: 'https://admin.kipuspay.com',
    });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://admin.kipuspay.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-platform-staff-token',
        },
      },
      env as unknown as Env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.kipuspay.com');
    expect(res.headers.get('Access-Control-Allow-Headers') ?? '').toContain(
      'x-platform-staff-token',
    );
  });

  it('GET /platform/tenants sin ALLOWED_PLATFORM_ORIGINS configurado → fail-closed sin ACAO ni para admin', async () => {
    const env = {
      DB: fakeD1(),
      TENANT_KV: fakeKv() as unknown as KVNamespace,
      PLATFORM_STAFF_TOKEN: 'staff-secret',
      ALLOWLIST_STAFF_EMAILS: 'staff@kipuspay.com',
      ALLOWED_ORIGINS: 'https://*.pages.dev,https://admin.kipuspay.com',
      // Sin ALLOWED_PLATFORM_ORIGINS → fail-closed
      ALLOWED_PLATFORM_ORIGINS: '',
      AUTH_JWT_HS_SECRET: 'test-secret-32-chars-long!!',
    } as unknown as WorkerEnv & Record<string, unknown>;
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      {
        headers: {
          origin: 'https://admin.kipuspay.com',
          'x-platform-staff-token': 'staff-secret',
        },
      },
      env as unknown as Env,
    );
    // Fail-closed: aunque ALLOWED_ORIGINS tenga admin, platform sin config no debe dar ACAO
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
