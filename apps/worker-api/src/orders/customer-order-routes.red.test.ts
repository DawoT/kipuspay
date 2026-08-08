import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isCustomerOrdersEnabled,
  runCancelCustomerOrderHttp,
  runCreateCustomerOrderHttp,
  runExpireCustomerOrderHttp,
  runFulfillCustomerOrderHttp,
  runMintCustomerOrderLeaseHttp,
} from './customer-order-routes.js';

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_ORDERS_CUSTOMER_ORDERS: '1',
    DB: {
      prepare: vi.fn(),
      batch: vi.fn(),
    },
    ...overrides,
  } as unknown as WorkerEnv;
}

describe('Sprint 43 Worker customer-order routes (RED)', () => {
  it('is default-off and returns opaque 404 while disabled', async () => {
    expect(isCustomerOrdersEnabled({} as WorkerEnv)).toBe(false);
    const response = await runCreateCustomerOrderHttp(
      env({ FEATURE_ORDERS_CUSTOMER_ORDERS: '0' } as Partial<WorkerEnv>),
      { tenantId: 'tenant-a', userId: 'user-a', role: 'admin' },
      {},
    );
    expect(response).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it.each([
    ['cashier', 403],
    ['admin', 201],
    ['owner', 201],
  ] as const)('enforces create RBAC for %s', async (role, status) => {
    const response = await runCreateCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'user-a', role },
      {
        tenantId: 'tenant-from-client-must-be-ignored',
        branchId: 'branch-a',
        customerId: 'customer-a',
        items: [{ productId: 'product-a', quantityMicrounits: 1_000_000 }],
      },
    );
    expect(response.status).toBe(status);
  });

  it('derives tenant and prices server-side and returns zero sale/payment/CPE at create', async () => {
    const response = await runCreateCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'admin-a', role: 'admin' },
      {
        tenantId: 'tenant-b',
        unitPriceCents: 1,
        branchId: 'branch-a',
        customerId: 'customer-a',
        items: [{ productId: 'product-a', quantityMicrounits: 1_000_000 }],
      },
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tenantId: 'tenant-a',
      saleId: null,
      paymentId: null,
      fiscalDocumentId: null,
    });
  });

  it('returns opaque 404 for cross-tenant IDs and rejects double fulfill', async () => {
    const crossTenant = await runFulfillCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-b', userId: 'cashier-b', role: 'cashier' },
      { orderId: 'order-owned-by-a', envelope: 'opaque', idempotencyKey: 'f1' },
    );
    expect(crossTenant).toMatchObject({ status: 404 });

    const first = await runFulfillCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      { orderId: 'order-a', envelope: 'opaque', idempotencyKey: 'f1' },
    );
    const replay = await runFulfillCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      { orderId: 'order-a', envelope: 'opaque', idempotencyKey: 'f1' },
    );
    expect(replay).toEqual(first);
  });

  it('mints only server-scoped bounded one-shot leases without client authority', async () => {
    const response = await runMintCustomerOrderLeaseHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      {
        tenantId: 'tenant-b',
        orderId: 'order-a',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        unitPriceCents: 1,
        requestedTtlSeconds: 86_400,
      },
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tenantId: undefined,
      unitPriceCents: undefined,
      scope: 'CUSTOMER_ORDER_FULFILL',
      oneShot: true,
    });
    expect(response.body.ttlSeconds).toBeLessThanOrEqual(900);
  });

  it('requires supervisor auth for expired repricing and keeps expiry transport-independent', async () => {
    const noApproval = await runFulfillCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      { orderId: 'expired-order', envelope: 'opaque', idempotencyKey: 'expired-1' },
    );
    expect(noApproval).toMatchObject({ status: 422, body: { code: 'AUTH_TOKEN_REQUIRED' } });

    const expiry = await runExpireCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'system', role: 'system' },
      { orderId: 'order-a', idempotencyKey: 'expire-1', simulatedTransportFailure: true },
    );
    expect(expiry).toMatchObject({ status: 200, body: { status: 'EXPIRED' } });
  });

  it('limits cancel to admin/owner and preserves ordinary checkout routing', async () => {
    const forbidden = await runCancelCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      { orderId: 'order-a', reason: 'requested', idempotencyKey: 'cancel-1' },
    );
    expect(forbidden.status).toBe(403);
    expect(isCustomerOrdersEnabled(env())).toBe(true);
  });
});
