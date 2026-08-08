import { describe, expect, it, vi } from 'vitest';
import { processOfflineSaleAtomic } from '@kipuspay/adapters-d1';
import { createApp } from '../index.js';
import type { AuthTenantSnapshot } from '../auth/auth-decide.js';
import type { WorkerEnv } from '../auth/control-plane.js';
import type { TenantAuthDeps } from '../auth/tenant-auth-middleware.js';
import {
  isAcidOfflineSaleEnabled,
  isFiscalCpeEnabled,
  runOfflineSaleHttp,
} from './offline-sale-route.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  processOfflineSaleAtomic: vi.fn(() => Promise.resolve({ saleId: 'sale-m3' })),
}));

vi.mock('../integrations/integration-routes.js', () => ({
  enqueuePublicEventForTenant: vi.fn(() => Promise.reject(new Error('ENQUEUE_DB_FAILURE'))),
}));

const tenant: AuthTenantSnapshot = {
  id: 't1',
  status: 'active',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  pastGracePeriod: false,
};

const authed: TenantAuthDeps = {
  verifyJwt: () => Promise.resolve({ tenantId: 't1', sub: 'u1' }),
  getTenant: () => Promise.resolve(tenant),
  checkRevocation: () => Promise.resolve({ available: true, revoked: false }),
};

describe('isAcidOfflineSaleEnabled', () => {
  it('solo true con 1/true', () => {
    expect(isAcidOfflineSaleEnabled(undefined)).toBe(false);
    expect(isAcidOfflineSaleEnabled({} as WorkerEnv)).toBe(false);
    expect(isAcidOfflineSaleEnabled({ FEATURE_ACID_OFFLINE_SALE: '0' } as WorkerEnv)).toBe(false);
    expect(isAcidOfflineSaleEnabled({ FEATURE_ACID_OFFLINE_SALE: '1' } as WorkerEnv)).toBe(true);
    expect(isAcidOfflineSaleEnabled({ FEATURE_ACID_OFFLINE_SALE: 'true' } as WorkerEnv)).toBe(true);
  });
});

describe('isFiscalCpeEnabled', () => {
  it('default off; CPE exige FEATURE_FISCAL_CPE', () => {
    expect(isFiscalCpeEnabled(undefined)).toBe(false);
    expect(isFiscalCpeEnabled({ FEATURE_FISCAL_CPE: '0' } as WorkerEnv)).toBe(false);
    expect(isFiscalCpeEnabled({ FEATURE_FISCAL_CPE: '1' } as WorkerEnv)).toBe(true);
  });
});

describe('runOfflineSaleHttp', () => {
  it('flag off → 404 FEATURE_DISABLED', async () => {
    const res = await runOfflineSaleHttp(undefined, 't1', 'u1', {
      offlineSaleId: 'x',
      branchId: 'b',
      cashRegisterSessionId: 's',
      documentType: 'NV',
      series: 'NV01',
      clientDocumentType: '1',
      clientDocumentNumber: '1',
      clientName: 'C',
      items: [{ productId: 'p', quantity: 1 }],
      payments: [{ paymentMethodId: 'pm', amountCents: 1 }],
    });
    expect(res).toEqual({
      status: 404,
      body: { error: 'Feature disabled', code: 'FEATURE_DISABLED' },
    });
  });

  it('flag on sin DB → 503', async () => {
    const res = await runOfflineSaleHttp(
      { FEATURE_ACID_OFFLINE_SALE: '1' } as WorkerEnv,
      't1',
      'u1',
      {
        offlineSaleId: 'x',
        branchId: 'b',
        cashRegisterSessionId: 's',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '1',
        clientName: 'C',
        items: [{ productId: 'p', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm', amountCents: 1 }],
      },
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DB_UNAVAILABLE');
  });

  it('CPE con FEATURE_FISCAL_CPE off → 404', async () => {
    const res = await runOfflineSaleHttp(
      { FEATURE_ACID_OFFLINE_SALE: '1', FEATURE_FISCAL_CPE: '0' } as WorkerEnv,
      't1',
      'u1',
      {
        offlineSaleId: 'x',
        branchId: 'b',
        cashRegisterSessionId: 's',
        documentType: '01',
        series: 'F001',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
        clientName: 'ACME',
        items: [{ productId: 'p', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm', amountCents: 1180 }],
      },
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it('M3: enqueue post-commit falla → la venta sigue devolviendo 200 (ya commiteada)', async () => {
    const res = await runOfflineSaleHttp(
      {
        FEATURE_ACID_OFFLINE_SALE: '1',
        FEATURE_INTEGRATIONS_API: '1',
        DB: {
          prepare: () => ({ bind: () => ({ run: () => Promise.resolve({ success: true }) }) }),
        },
        TENANT_KV: {
          get: () => Promise.resolve(null),
          put: () => Promise.resolve(),
          delete: () => Promise.resolve(),
        },
      } as unknown as WorkerEnv,
      't1',
      'u1',
      {
        offlineSaleId: 'x',
        branchId: 'b',
        cashRegisterSessionId: 's',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '1',
        clientName: 'C',
        items: [{ productId: 'p', quantity: 1 }],
        payments: [{ paymentMethodId: 'pm', amountCents: 1 }],
      },
    );
    expect(res.status).toBe(200);
    expect((res.body as { saleId?: string }).saleId).toBe('sale-m3');
  });

  it('deriva asignaciones seriales usando el terminal autenticado por cabecera', async () => {
    await runOfflineSaleHttp(
      { FEATURE_ACID_OFFLINE_SALE: '1', DB: {} } as WorkerEnv,
      't1',
      'u1',
      {
        offlineSaleId: 'serial-sale',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '1',
        clientName: 'C',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            serialId: 'serial-1',
            serialLeaseToken: 'opaque_token-1',
          },
        ],
        payments: [{ paymentMethodId: 'pm', amountCents: 100 }],
      },
      false,
      'terminal-trusted',
    );

    expect(vi.mocked(processOfflineSaleAtomic)).toHaveBeenLastCalledWith(
      expect.anything(),
      't1',
      'u1',
      expect.anything(),
      expect.objectContaining({
        serialAssignments: [
          {
            productId: 'p1',
            serialId: 'serial-1',
            leaseToken: 'opaque_token-1',
            terminalId: 'terminal-trusted',
          },
        ],
      }),
    );
  });

  it('passes trusted terminal and inventory.scale capability to the atomic engine', async () => {
    await runOfflineSaleHttp(
      {
        FEATURE_ACID_OFFLINE_SALE: '1',
        FEATURE_INVENTORY_SCALE: '1',
        DB: {},
      } as WorkerEnv,
      't1',
      'u1',
      {
        offlineSaleId: 'weighted-sale',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        documentType: 'NV',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '1',
        clientName: 'C',
        items: [
          {
            productId: 'p1',
            saleItemId: 'line-1',
            weightMeasurement: {
              measurementId: 'measure-1',
              weightMicrounits: 500_000,
              measurementSource: 'MANUAL',
              observedAt: '2026-08-08T12:00:00.000Z',
            },
          },
        ],
        payments: [{ paymentMethodId: 'pm', amountCents: 118 }],
      },
      false,
      'terminal-trusted',
    );

    expect(vi.mocked(processOfflineSaleAtomic)).toHaveBeenLastCalledWith(
      expect.anything(),
      't1',
      'u1',
      expect.anything(),
      expect.objectContaining({
        inventoryScaleEnabled: true,
        terminalId: 'terminal-trusted',
      }),
    );
  });
});

describe('POST /api/pos/offline-sale auth', () => {
  it('exige Bearer (401)', async () => {
    const app = createApp(authed);
    const res = await app.request('/api/pos/offline-sale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });
});
