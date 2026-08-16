import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  runTitularConsentsHttp,
  runTitularEraseHttp,
  runTitularExportHttp,
  runTitularVerifyHttp,
} from './titular-lpdp-routes.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  exportCustomer: vi.fn(() =>
    Promise.resolve({
      customerId: 'cust-1',
      tenantId: 't1',
      profile: { documentTypeCode: '1', documentNumber: '45123456', name: 'Ana' },
      consents: [],
      sales: [],
    }),
  ),
  listConsents: vi.fn(() =>
    Promise.resolve([
      { purpose: 'marketing', granted: true, grantedAtIso: 'g', revokedAtIso: null },
    ]),
  ),
  writeConsent: vi.fn(() => Promise.resolve({ kind: 'GRANT' })),
  eraseCustomer: vi.fn(() =>
    Promise.resolve({ customerId: 'cust-1', fiscalSnapshotsAnonymized: 3, consentsRevoked: 2 }),
  ),
}));

const SECRET = 'test-secret-titular';

function env(overrides: Record<string, unknown> = {}): WorkerEnv {
  const customer = {
    id: 'cust-1',
    name: 'Ana Perez',
    phone: '+51999999999',
    pii_erased: 0,
  };
  return {
    FEATURE_LPDP: '1',
    AUTH_JWT_HS_SECRET: SECRET,
    DB: {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.resolve(customer),
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
          run: () => Promise.resolve({ success: true, meta: {} }),
        }),
      }),
      batch: () => Promise.resolve([]),
    },
    ...overrides,
  } as unknown as WorkerEnv;
}

describe('LPDP ARCO self-serve del titular (Sprint C3)', () => {
  it('verify: identidad por datos emite un token de titular', async () => {
    const res = await runTitularVerifyHttp(env(), {
      tenantId: 't1',
      documentNumber: '45123456',
      name: 'Ana Perez',
      phone: '+51999999999',
    });
    expect(res.status).toBe(200);
    expect(typeof (res.body as { token?: string }).token).toBe('string');
    expect((res.body as { expiresInSeconds?: number }).expiresInSeconds).toBe(900);
  });

  it('verify: nombre o teléfono incorrectos → 403 TITULAR_IDENTITY_MISMATCH', async () => {
    const res = await runTitularVerifyHttp(env(), {
      tenantId: 't1',
      documentNumber: '45123456',
      name: 'Otra Persona',
      phone: '+51999999999',
    });
    expect(res.status).toBe(403);
    expect((res.body as { code?: string }).code).toBe('TITULAR_IDENTITY_MISMATCH');
  });

  it('verify: flag off → 404 y datos incompletos → 400', async () => {
    expect((await runTitularVerifyHttp(env({ FEATURE_LPDP: '0' }), {})).status).toBe(404);
    expect((await runTitularVerifyHttp(env(), { tenantId: 't1' })).status).toBe(400);
  });

  it('export: token de titular devuelve la copia del propio titular', async () => {
    const { token } = (
      await runTitularVerifyHttp(env(), {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
      })
    ).body as { token: string };
    const res = await runTitularExportHttp(env(), `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as { export?: { customerId?: string } }).export?.customerId).toBe('cust-1');
  });

  it('token admin (sin scope) jamás pasa como titular → 401', async () => {
    const { signHs256 } = await import('../auth/verify-jwt.js');
    const adminToken = await signHs256(SECRET, {
      tenantId: 't1',
      sub: 'admin-1',
      role: 'owner',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await runTitularExportHttp(env(), `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it('erase exige confirmación doble y luego anonimiza', async () => {
    const { token } = (
      await runTitularVerifyHttp(env(), {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
      })
    ).body as { token: string };
    const unconfirmed = await runTitularEraseHttp(env(), `Bearer ${token}`, {});
    expect(unconfirmed.status).toBe(400);
    expect((unconfirmed.body as { code?: string }).code).toBe(
      'TITULAR_ERASE_CONFIRMATION_REQUIRED',
    );
    const res = await runTitularEraseHttp(env(), `Bearer ${token}`, { confirmed: true });
    expect(res.status).toBe(200);
    expect((res.body as { consentsRevoked?: number }).consentsRevoked).toBe(2);
  });

  it('consents: el titular lee sus consentimientos', async () => {
    const { token } = (
      await runTitularVerifyHttp(env(), {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
      })
    ).body as { token: string };
    const res = await runTitularConsentsHttp(env(), `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as { customerId?: string }).customerId).toBe('cust-1');
  });
});
