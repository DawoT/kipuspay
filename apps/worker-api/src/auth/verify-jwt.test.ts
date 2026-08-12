import { describe, expect, it, vi } from 'vitest';
import { signHs256ForTests, verifyJwt } from './verify-jwt.js';

const SECRET = 'test-hs-secret-not-for-production';
const nowMs = Date.parse('2026-08-04T12:00:00Z');

const textEncoder = new TextEncoder();

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Genera un par RSA y firma un JWT RS256 (solo tests). */
async function mintRs256ForTests(claims: Record<string, unknown>): Promise<{
  token: string;
  jwks: JsonWebKey;
}> {
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
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = 'kid-rsa-1';
  const headerB64 = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payloadB64 = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    pair.privateKey,
    textEncoder.encode(`${headerB64}.${payloadB64}`),
  );
  return {
    token: `${headerB64}.${payloadB64}.${b64url(new Uint8Array(sig))}`,
    jwks: { ...jwk, kid, alg: 'RS256', use: 'sig' } as JsonWebKey & {
      kid: string;
      alg: string;
      use: string;
    },
  };
}

describe('verifyJwt (SEC-01)', () => {
  it('acepta HS256 válido con tenantId y sub', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'user-ext-1',
      iat: Math.floor(nowMs / 1000) - 10,
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    await expect(verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, token, nowMs)).resolves.toEqual({
      tenantId: 't1',
      sub: 'user-ext-1',
    });
  });

  it('propaga auth_time verificado para autorización step-up', async () => {
    const authTime = Math.floor(nowMs / 1000) - 60;
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'user-ext-1',
      auth_time: authTime,
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    await expect(verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, token, nowMs)).resolves.toEqual({
      tenantId: 't1',
      sub: 'user-ext-1',
      authTime,
    });
  });

  it('rechaza alg=none', async () => {
    const token = await signHs256ForTests(
      SECRET,
      { tenantId: 't1', sub: 'u1', exp: Math.floor(nowMs / 1000) + 3600 },
      { alg: 'none', typ: 'JWT' },
    );
    // firma HS con header none: verifyJwt deniega por alg antes de verificar
    await expect(verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, token, nowMs)).resolves.toBeNull();
  });

  it('rechaza JWT expirado', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) - 10,
    });
    await expect(verifyJwt({ AUTH_JWT_HS_SECRET: SECRET }, token, nowMs)).resolves.toBeNull();
  });

  it('rechaza firma inválida', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    await expect(
      verifyJwt({ AUTH_JWT_HS_SECRET: 'other-secret' }, token, nowMs),
    ).resolves.toBeNull();
  });

  it('deniega HS si AUTH_JWT_JWKS_URL está configurado', async () => {
    const token = await signHs256ForTests(SECRET, {
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    await expect(
      verifyJwt(
        {
          AUTH_JWT_HS_SECRET: SECRET,
          AUTH_JWT_JWKS_URL: 'https://idp.example/.well-known/jwks.json',
        },
        token,
        nowMs,
      ),
    ).resolves.toBeNull();
  });

  it('B5: acepta RS256 válido vía JWKS (kid + firma)', async () => {
    const { token, jwks } = await mintRs256ForTests({
      tenantId: 't1',
      sub: 'user-ext-1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwks] }), { status: 200 })),
    );
    try {
      await expect(
        verifyJwt({ AUTH_JWT_JWKS_URL: 'https://idp.example/.well-known/jwks.json' }, token, nowMs),
      ).resolves.toEqual({ tenantId: 't1', sub: 'user-ext-1' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('B5: rechaza firma RS256 inválida (fail-closed)', async () => {
    const { token, jwks } = await mintRs256ForTests({
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    const [h, p] = token.split('.') as [string, string];
    const tampered = `${h}.${p}.AAAA`;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwks] }), { status: 200 })),
    );
    try {
      await expect(
        verifyJwt(
          { AUTH_JWT_JWKS_URL: 'https://idp.example/.well-known/jwks.json' },
          tampered,
          nowMs,
        ),
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('B5: JWKS inalcanzable → null (fail-closed, nunca acceso por omisión)', async () => {
    const { token } = await mintRs256ForTests({
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    try {
      await expect(
        verifyJwt({ AUTH_JWT_JWKS_URL: 'https://idp.example/.well-known/jwks.json' }, token, nowMs),
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('B5: kid desconocido → null', async () => {
    const { token, jwks } = await mintRs256ForTests({
      tenantId: 't1',
      sub: 'u1',
      exp: Math.floor(nowMs / 1000) + 3600,
    });
    const otherKey = { ...jwks, kid: 'kid-otra' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ keys: [otherKey] }), { status: 200 })),
    );
    try {
      await expect(
        verifyJwt({ AUTH_JWT_JWKS_URL: 'https://idp.example/.well-known/jwks.json' }, token, nowMs),
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
