/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../index.js';
import type { WorkerEnv } from '../auth/control-plane.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function fakeD1(opts: {
  tenants?: Record<string, { plan_id: string; subscription_status: string }>;
  throwOnPrepare?: boolean;
}) {
  const tenants = opts.tenants ?? { 't-1': { plan_id: 'arranque', subscription_status: 'active' } };
  const db: unknown = {
    prepare: vi.fn((sql: string) => {
      if (opts.throwOnPrepare) throw new Error('D1_DOWN');
      const makeBound = (args: unknown[]) => ({
        sql,
        args,
        first: vi.fn(async () => {
          if (sql.includes('FROM tenants WHERE id')) {
            const id = String(args[0] ?? '');
            const row = tenants[id];
            if (!row) return null;
            return { id, ...row };
          }
          if (sql.includes('SELECT last_hash FROM audit_chain_heads')) return null;
          if (sql.includes('SELECT epoch FROM tenant_data_epochs')) return { epoch: 0 };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM tenants ORDER BY')) {
            const results = Object.entries(tenants).map(([id, v]) => ({
              id,
              plan_id: v.plan_id,
              subscription_status: v.subscription_status,
              subscriptionStatus: v.subscription_status,
              status: 'active',
              is_active: 1,
              trial_ends_at: null,
              created_at: new Date().toISOString(),
            }));
            return { results } as unknown;
          }
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

function platformEnv(opts: {
  tenants?: Record<string, { plan_id: string; subscription_status: string }>;
  allowlist?: string;
  token?: string;
  teamDomain?: string;
  aud?: string;
  kv?: KVNamespace | null;
}): WorkerEnv & Record<string, unknown> {
  const db = fakeD1({ tenants: opts.tenants });
  const kv = opts.kv === null ? null : (opts.kv ?? fakeKv());
  return {
    DB: db,
    TENANT_KV: kv as unknown as KVNamespace,
    PLATFORM_STAFF_TOKEN: opts.token ?? 'staff-secret-12345',
    ALLOWLIST_STAFF_EMAILS: opts.allowlist ?? 'staff@kipuspay.com',
    CF_ACCESS_TEAM_DOMAIN: opts.teamDomain,
    CF_ACCESS_AUD: opts.aud,
    ALLOWED_ORIGINS: '*',
    AUTH_JWT_HS_SECRET: 'test-secret-32-chars-long!!',
  } as unknown as WorkerEnv & Record<string, unknown>;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

async function generateRsaPair(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pubJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & {
    kid?: string;
    alg?: string;
  };
  pubJwk.kid = kid;
  pubJwk.alg = 'RS256';
  // ensure kty etc
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk: pubJwk, kid };
}

async function signRs256(
  privateKey: CryptoKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const headerB64 = b64urlEncodeJson(header);
  const payloadB64 = b64urlEncodeJson(payload);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, data);
  const sigB64 = b64urlEncode(new Uint8Array(sig));
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

describe('HIGH-01 — Zero-Trust CF Access JWT verification (fix bloqueante prod)', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./platform-auth.js');
    (mod as unknown as { _clearCfCacheForTests?: () => void })._clearCfCacheForTests?.();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('CF JWT forjado con email allowlist debe 401 (firma inválida)', async () => {
    const kid = 'test-kid-forged-1';
    const teamDomain = 'test-team';
    const aud = 'test-aud-123';
    // Generate legitimate key for certs, but sign forged token with different key
    const legit = await generateRsaPair(kid);
    const attacker = await generateRsaPair(kid);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`)) {
        return new Response(JSON.stringify({ keys: [legit.publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    // @ts-ignore mock
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const payload = {
      email: 'staff@kipuspay.com',
      aud,
      iss: `https://${teamDomain}.cloudflareaccess.com`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    // Forjado: firmado con attacker key, pero cert es legit key → verificación debe fallar 401
    const forgedToken = await signRs256(attacker.privateKey, header, payload);

    const env = platformEnv({
      teamDomain,
      aud,
      allowlist: 'staff@kipuspay.com,admin@kipuspay.com',
    });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      { headers: { 'Cf-Access-Jwt-Assertion': forgedToken } },
      env as unknown as Env,
    );
    // Tras fix: firma inválida → 401. Antes de fix: sin verificación → 200 (FAIL RED esperado)
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
    // Verifica que intentó validar contra JWK (fetch certs) — antes de fix no lo hacía
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string | undefined;
    expect(String(calledUrl)).toContain(`${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  });

  it('CF JWT válido con firma real simulada (mock fetch certs) debe 200', async () => {
    const kid = 'test-kid-valid-1';
    const teamDomain = 'test-team';
    const aud = 'test-aud-123';
    const legit = await generateRsaPair(kid);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`)) {
        return new Response(JSON.stringify({ keys: [legit.publicJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    // @ts-ignore
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const payload = {
      email: 'staff@kipuspay.com',
      aud,
      iss: `https://${teamDomain}.cloudflareaccess.com`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const validToken = await signRs256(legit.privateKey, header, payload);

    const env = platformEnv({ teamDomain, aud, allowlist: 'staff@kipuspay.com' });
    const app = createApp();
    const res = await app.request(
      '/platform/tenants',
      { headers: { 'Cf-Access-Jwt-Assertion': validToken } },
      env as unknown as Env,
    );
    // Tras fix: firma válida + iss/aud/kid + allowlist → 200
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    // Además sin teamDomain debe ser fail-closed 503, no 401
    const envNoTeam = platformEnv({ aud, allowlist: 'staff@kipuspay.com' }); // sin teamDomain
    // @ts-ignore fetch still mocked but teamDomain missing should 503 sin llamar fetch
    const fetchMock2 = vi.fn(
      async () => new Response(JSON.stringify({ keys: [legit.publicJwk] }), { status: 200 }),
    );
    globalThis.fetch = fetchMock2 as unknown as typeof fetch;
    const res2 = await app.request(
      '/platform/tenants',
      { headers: { 'Cf-Access-Jwt-Assertion': validToken } },
      envNoTeam as unknown as Env,
    );
    expect(res2.status).toBe(503);
    const body2 = (await res2.json()) as { code: string };
    expect(body2.code).toBe('STAFF_UNAVAILABLE');
  });

  it('x-platform-staff-token longitud distinta debe constant-time 401 sin leak', async () => {
    // Verifica que el código no hace early return por longitud (leak timing)
    let content: string;
    try {
      // @ts-ignore import.meta is ESM
      const u = (import.meta as unknown as { url: string }).url;
      content = fs.readFileSync(new URL('./platform-auth.ts', u), 'utf8');
    } catch {
      try {
        content = fs.readFileSync(
          path.resolve(process.cwd(), 'src/platform/platform-auth.ts'),
          'utf8',
        );
      } catch {
        content = fs.readFileSync(
          '/home/deuz/projects/KipusPay/apps/worker-api/src/platform/platform-auth.ts',
          'utf8',
        );
      }
    }
    // El fix debe eliminar el early return de longitud en isStaffTokenValid y en constantTimeEqual
    expect(content).not.toContain('if (expected.length !== provided.length) return false');
    expect(content).not.toContain('if (a.length !== b.length) return false');
    // Debe implementar timingSafeEqual sobre Uint8Array longitud fija sin early return
    expect(content).toContain('TextEncoder');
    expect(content).toContain('Uint8Array');
    // Funcionalmente: longitud distinta → 401, pero sin leak (no early return, constant-time)
    const env = platformEnv({ token: 'staff-secret-12345' });
    const app = createApp();
    const resShort = await app.request(
      '/platform/tenants',
      { headers: { 'x-platform-staff-token': 'short' } },
      env as unknown as Env,
    );
    expect(resShort.status).toBe(401);
    const resLong = await app.request(
      '/platform/tenants',
      { headers: { 'x-platform-staff-token': 'staff-secret-12345-extra-long-value' } },
      env as unknown as Env,
    );
    expect(resLong.status).toBe(401);
    const resValid = await app.request(
      '/platform/tenants',
      { headers: { 'x-platform-staff-token': 'staff-secret-12345' } },
      env as unknown as Env,
    );
    expect(resValid.status).toBe(200);
    // Solo acepta Cf-Access-Jwt-Assertion, no alias cf-authorization
    expect(content).not.toMatch(/cf-authorization/);
    expect(content).not.toMatch(/cf_authorization/);
    expect(content).not.toMatch(/x-cf-authorization/);
    // Debe usar CF_ACCESS_TEAM_DOMAIN y verificar iss/aud/kid/alg
    expect(content).toContain('CF_ACCESS_TEAM_DOMAIN');
    expect(content).toContain('Zero-Trust');
  });
});
