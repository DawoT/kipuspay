import { describe, expect, it } from 'vitest';
import { signHs256ForTests, verifyJwt } from './verify-jwt.js';

const SECRET = 'test-hs-secret-not-for-production';
const nowMs = Date.parse('2026-08-04T12:00:00Z');

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
});
