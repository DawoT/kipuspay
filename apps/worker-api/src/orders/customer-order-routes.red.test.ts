/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion -- hoisted adapter test doubles */
import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
const sendQuote = vi.hoisted(() => vi.fn(async () => ({ accepted: true })));
const resolveActiveTerminalSession = vi.hoisted(() =>
  vi.fn(async (_db, input) => ({
    terminalSessionId: input.terminalSessionId,
    terminalId: input.terminalId,
    cashRegisterSessionId: 'register-a',
    userId: input.userId,
    branchId: 'branch-a',
  })),
);
vi.mock('@kipuspay/adapters-messaging', () => ({
  createWhatsAppMessagingSender: () => ({ sendQuote }),
}));
vi.mock('@kipuspay/adapters-d1/process-customer-order-atomic', () => ({
  resolveActiveTerminalSession,
  createCustomerOrderAtomic: vi.fn(async (_db, input) => ({
    orderId: 'order-a',
    tenantId: input.tenantId,
    status: 'OPEN',
    saleId: null,
    paymentId: null,
    fiscalDocumentId: null,
    alreadyApplied: false,
  })),
  mintCustomerOrderLeaseAtomic: vi.fn(async () => ({
    envelope: 'opaque',
    envelopeId: 'lease-a',
    scope: 'CUSTOMER_ORDER_FULFILL',
    oneShot: true,
    ttlSeconds: 300,
  })),
  fulfillCustomerOrderAtomic: vi.fn(async (_db, input) => {
    if (input.orderId === 'order-owned-by-a' && input.tenantId === 'tenant-b') {
      throw new Error('CUSTOMER_ORDER_NOT_FOUND');
    }
    return {
      orderId: input.orderId,
      saleId: 'sale-a',
      saleItemId: 'sale-item-a',
      status: 'FULFILLED',
      totalAmountCents: 1180,
      alreadyApplied: false,
    };
  }),
  cancelCustomerOrderAtomic: vi.fn(async (_db, input) => ({
    orderId: input.orderId,
    status: 'CANCELLED',
  })),
  expireCustomerOrderAtomic: vi.fn(async (_db, input) => ({
    orderId: input.orderId,
    status: 'EXPIRED',
  })),
  listCustomerOrders: vi.fn(async () => []),
  getCustomerOrderDetail: vi.fn(async () => ({ id: 'order-a' })),
  mintCustomerOrderRepriceAuthorizationAtomic: vi.fn(async () => ({
    token: 'opaque-reprice',
    expiresAt: '2026-08-08T18:00:00.000Z',
    scope: 'CUSTOMER_ORDER_REPRICE',
  })),
  processExpiredCustomerOrderRepriceHandoffAtomic: vi.fn(async (_db, input) => ({
    quoteId: 'quote-a',
    source: 'CURRENT_SERVER_PRICING',
    requiresOrdinaryCheckout: true,
    input,
    lines: [{ unitPriceCents: 2500 }],
  })),
  dispatchCustomerOrderNotice: vi.fn(async (_db, input, sender) => {
    await sender.sendExpiryWarning({
      tenantId: input.tenantId,
      orderId: 'order-a',
      notificationId: input.notificationId,
    });
    return { status: 'SENT' };
  }),
}));
import {
  cancelCustomerOrderAtomic,
  getCustomerOrderDetail,
  listCustomerOrders,
  mintCustomerOrderLeaseAtomic,
  processExpiredCustomerOrderRepriceHandoffAtomic,
} from '@kipuspay/adapters-d1/process-customer-order-atomic';
import {
  isCustomerOrdersEnabled,
  runCancelCustomerOrderHttp,
  runCreateCustomerOrderHttp,
  runExpireCustomerOrderHttp,
  runFulfillCustomerOrderHttp,
  runDispatchCustomerOrderNoticeHttp,
  runMintCustomerOrderLeaseHttp,
  runMintCustomerOrderRepriceAuthorizationHttp,
  runRepriceExpiredCustomerOrderHttp,
  runGetCustomerOrderHttp,
  runListCustomerOrdersHttp,
} from './customer-order-routes.js';

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_ORDERS_CUSTOMER_ORDERS: '1',
    DB: {
      prepare: vi.fn((sql: string) => {
        const statement = {
          bind: vi.fn(() => statement),
          first: vi.fn(async () =>
            sql.includes('SELECT o.customer_id')
              ? { customer_id: 'customer-a', phone: '+51999999999' }
              : { enabled: 1 },
          ),
        };
        return statement;
      }),
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
    ['cashier', 201],
    ['supervisor', 201],
    ['admin', 403],
    ['owner', 403],
  ] as const)('enforces create RBAC for %s', async (role, status) => {
    const response = await runCreateCustomerOrderHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'user-a', role, branchId: 'branch-a' },
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
      {
        tenantId: 'tenant-a',
        userId: 'supervisor-a',
        role: 'supervisor',
        branchId: 'branch-a',
      },
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
      {
        tenantId: 'tenant-b',
        userId: 'cashier-b',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-b',
        terminalSessionId: 'session-b',
      },
      { orderId: 'order-owned-by-a', envelope: 'opaque', idempotencyKey: 'f1', documentType: 'NV' },
    );
    expect(crossTenant).toMatchObject({ status: 404 });

    const first = await runFulfillCustomerOrderHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      },
      { orderId: 'order-a', envelope: 'opaque', idempotencyKey: 'f1', documentType: 'NV' },
    );
    const replay = await runFulfillCustomerOrderHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      },
      { orderId: 'order-a', envelope: 'opaque', idempotencyKey: 'f1', documentType: 'NV' },
    );
    expect(replay).toEqual(first);
  });

  it('mints only server-scoped bounded one-shot leases without client authority', async () => {
    const response = await runMintCustomerOrderLeaseHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      },
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
      scope: 'CUSTOMER_ORDER_FULFILL',
      oneShot: true,
    });
    expect(response.body).not.toHaveProperty('tenantId');
    expect(response.body).not.toHaveProperty('unitPriceCents');
    expect(response.body.ttlSeconds).toBeLessThanOrEqual(300);
  });

  it('passes every requested item in one server-scoped envelope', async () => {
    await runMintCustomerOrderLeaseHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-trusted',
        terminalSessionId: 'session-a',
      },
      {
        orderId: 'order-a',
        items: [
          { itemId: 'item-a', quantityMicrounits: 1_000_000 },
          { itemId: 'item-b', quantityMicrounits: 2_000_000 },
        ],
      },
    );
    expect(vi.mocked(mintCustomerOrderLeaseAtomic)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-a',
        terminalId: 'terminal-trusted',
        items: [
          { itemId: 'item-a', quantityMicrounits: 1_000_000 },
          { itemId: 'item-b', quantityMicrounits: 2_000_000 },
        ],
      }),
    );
  });

  it('requires supervisor minting and ignores client prices during repricing handoff', async () => {
    const denied = await runMintCustomerOrderRepriceAuthorizationHttp(
      env(),
      { tenantId: 'tenant-a', userId: 'cashier-a', role: 'cashier' },
      { orderId: 'order-a', actorUserId: 'cashier-a', terminalId: 'terminal-a' },
    );
    expect(denied.status).toBe(403);
    const handoff = await runRepriceExpiredCustomerOrderHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      },
      {
        tenantId: 'forged',
        orderId: 'order-a',
        authorizationToken: 'opaque',
        unitPriceCents: 1,
        items: [{ productId: 'forged', unitPriceCents: 1 }],
        idempotencyKey: 'reprice-a',
      },
    );
    expect(handoff.status).toBe(200);
    expect(vi.mocked(processExpiredCustomerOrderRepriceHandoffAtomic)).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        tenantId: 'tenant-a',
        orderId: 'order-a',
        actorUserId: 'cashier-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
        authorizationToken: 'opaque',
        idempotencyKey: 'reprice-a',
      },
    );
  });

  it('wires WhatsApp only behind both feature and tenant capability', async () => {
    sendQuote.mockClear();
    const response = await runDispatchCustomerOrderNoticeHttp(
      env({ FEATURE_MESSAGING_WHATSAPP: '1' }),
      { tenantId: 'tenant-a', userId: 'supervisor-a', role: 'supervisor' },
      { notificationId: 'notice-a' },
    );
    expect(response).toMatchObject({ status: 200, body: { status: 'SENT' } });
    expect(sendQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        quoteId: 'notice-a',
        optedIn: true,
      }),
    );
  });

  it('requires supervisor auth for expired repricing and keeps expiry transport-independent', async () => {
    const noApproval = await runFulfillCustomerOrderHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      },
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

  it('forces cash-role reads to the trusted actor branch and hides cross-branch detail', async () => {
    const actor = {
      tenantId: 'tenant-a',
      userId: 'cashier-a',
      role: 'cashier',
      branchId: 'branch-a',
      allowedBranches: ['branch-a'],
    };
    await runListCustomerOrdersHttp(env(), actor, { branchId: 'branch-b' });
    expect(vi.mocked(listCustomerOrders)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-a', branchId: 'branch-a' }),
    );

    await runGetCustomerOrderHttp(env(), actor, 'order-b');
    expect(vi.mocked(getCustomerOrderDetail)).toHaveBeenLastCalledWith(
      expect.anything(),
      'tenant-a',
      'order-b',
      'branch-a',
    );
  });

  it('preflights supervisor close mutations against the trusted branch', async () => {
    vi.mocked(cancelCustomerOrderAtomic).mockClear();
    const scopedEnv = env({
      DB: {
        prepare: vi.fn((sql: string) => {
          const statement = {
            bind: vi.fn(() => statement),
            first: vi.fn(async () => (sql.includes('tenant_capabilities') ? { enabled: 1 } : null)),
          };
          return statement;
        }),
        batch: vi.fn(),
      } as never,
    });
    const response = await runCancelCustomerOrderHttp(
      scopedEnv,
      {
        tenantId: 'tenant-a',
        userId: 'supervisor-a',
        role: 'supervisor',
        branchId: 'branch-a',
      },
      { orderId: 'order-branch-b', reason: 'requested', idempotencyKey: 'cross-branch' },
    );
    expect(response).toMatchObject({
      status: 404,
      body: { code: 'CUSTOMER_ORDER_NOT_FOUND' },
    });
    expect(cancelCustomerOrderAtomic).not.toHaveBeenCalled();
  });

  it('requires explicit tenant-wide policy for admin and owner mutations', async () => {
    for (const role of ['admin', 'owner']) {
      const denied = await runCancelCustomerOrderHttp(
        env(),
        { tenantId: 'tenant-a', userId: `${role}-a`, role, permissions: [] },
        { orderId: 'order-a', reason: 'requested', idempotencyKey: `${role}-denied` },
      );
      expect(denied).toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });

      await runCancelCustomerOrderHttp(
        env(),
        {
          tenantId: 'tenant-a',
          userId: `${role}-a`,
          role,
          permissions: ['orders.customer_orders.manage'],
        },
        { orderId: 'order-a', reason: 'requested', idempotencyKey: `${role}-allowed` },
      );
      const lastInput = vi.mocked(cancelCustomerOrderAtomic).mock.lastCall?.[1];
      expect(lastInput).not.toHaveProperty('branchId');
    }
  });

  it('never lets owner execute cash create or fulfillment', async () => {
    const actor = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: 'owner',
      branchId: 'branch-a',
      terminalId: 'terminal-a',
      terminalSessionId: 'terminal-session-a',
      permissions: ['orders.customer_orders.manage'],
    };
    await expect(
      runCreateCustomerOrderHttp(env(), actor, {
        branchId: 'branch-a',
        customerId: 'customer-a',
        items: [],
      }),
    ).resolves.toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
    await expect(
      runFulfillCustomerOrderHttp(env(), actor, {
        orderId: 'order-a',
        envelope: 'opaque',
        idempotencyKey: 'owner-fulfill',
      }),
    ).resolves.toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
  });

  it('requires and resolves the trusted terminal session for cash mutations', async () => {
    const withoutSession = await runMintCustomerOrderLeaseHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
      },
      { orderId: 'order-a', idempotencyKey: 'missing-session' },
    );
    expect(withoutSession).toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });

    await runMintCustomerOrderLeaseHttp(
      env(),
      {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        role: 'cashier',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
        terminalSessionId: 'terminal-session-a',
      },
      { orderId: 'order-a', idempotencyKey: 'bound-session' },
    );
    expect(resolveActiveTerminalSession).toHaveBeenLastCalledWith(expect.anything(), {
      tenantId: 'tenant-a',
      userId: 'cashier-a',
      terminalId: 'terminal-a',
      terminalSessionId: 'terminal-session-a',
      branchId: 'branch-a',
    });
    expect(vi.mocked(mintCustomerOrderLeaseAtomic)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ terminalSessionId: 'terminal-session-a' }),
    );
  });
});
