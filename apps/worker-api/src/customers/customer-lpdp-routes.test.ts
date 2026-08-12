import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  runEraseCustomerHttp,
  runExportCustomerHttp,
  runListConsentsHttp,
  runListCustomersHttp,
  runWriteConsentHttp,
  type LpdpActor,
} from './customer-lpdp-routes.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  listCustomers: vi.fn(() =>
    Promise.resolve([
      { documentTypeCode: '1', documentNumber: '12345678', name: 'Ana', piiErased: false },
    ]),
  ),
  listConsents: vi.fn(() =>
    Promise.resolve([
      { purpose: 'marketing', granted: true, grantedAtIso: 'g', revokedAtIso: null },
    ]),
  ),
  writeConsent: vi.fn(() => Promise.resolve({ kind: 'GRANT' })),
  exportCustomer: vi.fn(() =>
    Promise.resolve({
      customerId: 'c1',
      tenantId: 't1',
      profile: { documentTypeCode: '1', documentNumber: '12345678', name: 'Ana' },
      consents: [],
      sales: [],
    }),
  ),
  eraseCustomer: vi.fn(() =>
    Promise.resolve({
      customerId: 'c1',
      tenantId: 't1',
      fiscalSnapshotsAnonymized: 1,
      consentsRevoked: 1,
    }),
  ),
}));

function envWith(flags: Partial<WorkerEnv>): WorkerEnv {
  return {
    FEATURE_LPDP: flags.FEATURE_LPDP,
    DB: {
      prepare: () => ({
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
        }),
        all: () => Promise.resolve({ results: [] }),
        first: () => Promise.resolve(null),
      }),
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
}

const adminActor: LpdpActor = {
  tenantId: 't1',
  userId: 'u1',
  role: 'owner',
  branchId: 'b1',
};

const cashierActor: LpdpActor = {
  tenantId: 't1',
  userId: 'u2',
  role: 'cashier',
};

describe('customer LPDP (Sprint 47)', () => {
  it('feature off → 404 FEATURE_OFF', async () => {
    const res = await runListCustomersHttp(envWith({}), adminActor, null, null);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'FEATURE_OFF' });
  });

  it('sin tenant en el actor → 403 FORBIDDEN', async () => {
    const res = await runListCustomersHttp(envWith({ FEATURE_LPDP: '1' }), undefined, null, null);
    expect(res.status).toBe(403);
  });

  it('list: devuelve inventario PII del tenant', async () => {
    const res = await runListCustomersHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, '10', '0');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tenantId: 't1' });
  });

  it('consent: registra propósito', async () => {
    const res = await runWriteConsentHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, 'c1', {
      purpose: 'marketing',
      granted: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kind: 'GRANT' });
  });

  it('list consents: devuelve consentimientos del titular', async () => {
    const res = await runListConsentsHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, 'c1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ customerId: 'c1' });
  });

  it('consent: body inválido → 400', async () => {
    const res = await runWriteConsentHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, 'c1', {});
    expect(res.status).toBe(400);
  });

  it('export: derecho de acceso del titular', async () => {
    const res = await runExportCustomerHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, 'c1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ customerId: 'c1', tenantId: 't1' });
  });

  it('erase: cashier → 403 FORBIDDEN (solo admin/owner/supervisor)', async () => {
    const res = await runEraseCustomerHttp(envWith({ FEATURE_LPDP: '1' }), cashierActor, 'c1');
    expect(res.status).toBe(403);
  });

  it('erase: owner erases cliente', async () => {
    const res = await runEraseCustomerHttp(envWith({ FEATURE_LPDP: '1' }), adminActor, 'c1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fiscalSnapshotsAnonymized: 1, consentsRevoked: 1 });
  });
});
