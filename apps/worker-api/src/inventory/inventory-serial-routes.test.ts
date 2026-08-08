import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isInventorySerialsEnabled,
  runAcquireSerialLeaseHttp,
  runConfigureSerialTrackingHttp,
  runCreateSerialManifestHttp,
  runDisposeSerialHttp,
  runSearchSerialsHttp,
} from './inventory-serial-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const adapters = vi.hoisted(() => ({
  configureSerialTrackingAtomic: vi.fn(),
  createSerialManifestAtomic: vi.fn(),
  acquireSerialLeaseAtomic: vi.fn(),
  disposeSerialAtomic: vi.fn(),
}));

vi.mock('@kipuspay/adapters-d1', () => adapters);

function env(flag = '1'): WorkerEnv {
  const statement = {
    bind: vi.fn(),
    all: vi.fn(() =>
      Promise.resolve({
        results: [
          {
            serial_id: 'serial-1',
            serial_number: 'SN-001',
            product_id: 'product-1',
            status: 'AVAILABLE',
          },
        ],
      }),
    ),
  };
  statement.bind.mockReturnValue(statement);
  return {
    FEATURE_INVENTORY_SERIALS: flag,
    DB: { prepare: vi.fn(() => statement) },
  } as unknown as WorkerEnv;
}

describe('inventory-serial-routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.configureSerialTrackingAtomic.mockResolvedValue({
      productId: 'product-1',
      serialTrackingMode: 'REQUIRED',
    });
    adapters.createSerialManifestAtomic.mockResolvedValue({
      manifestId: 'manifest-1',
      serialCount: 1,
    });
    adapters.acquireSerialLeaseAtomic.mockResolvedValue({
      leaseToken: 'opaque_kp_7FXQm19w',
      replayed: false,
    });
    adapters.disposeSerialAtomic.mockResolvedValue({
      serialId: 'serial-1',
      status: 'AVAILABLE',
    });
  });

  it('defaults off and hides serial routes', async () => {
    expect(isInventorySerialsEnabled({} as WorkerEnv)).toBe(false);
    const response = await runSearchSerialsHttp(env('0'), 'tenant-jwt', 'cashier', {
      serialNumber: 'SN-001',
    });
    expect(response).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('allows only admin/owner to configure tracking and trusts the JWT tenant', async () => {
    const denied = await runConfigureSerialTrackingHttp(env(), 'tenant-jwt', 'user-1', 'cashier', {
      tenantId: 'tenant-attacker',
      productId: 'product-1',
      serialTrackingMode: 'REQUIRED',
    });
    expect(denied.status).toBe(403);

    const allowed = await runConfigureSerialTrackingHttp(env(), 'tenant-jwt', 'user-1', 'admin', {
      tenantId: 'tenant-attacker',
      productId: 'product-1',
      serialTrackingMode: 'REQUIRED',
    });
    expect(allowed.status).toBe(200);
    expect(adapters.configureSerialTrackingAtomic).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-jwt',
      'user-1',
      expect.objectContaining({ productId: 'product-1', serialTrackingMode: 'REQUIRED' }),
    );
    expect(adapters.configureSerialTrackingAtomic.mock.calls[0]?.[3]).not.toHaveProperty(
      'tenantId',
    );
  });

  it('search is tenant-scoped and available to operational roles', async () => {
    const db = env().DB!;
    const response = await runSearchSerialsHttp(
      { ...env(), DB: db } as WorkerEnv,
      'tenant-jwt',
      'cashier',
      { serialNumber: ' SN-001 ' },
    );
    expect(response.status).toBe(200);
    const statement = vi.mocked(db.prepare).mock.results[0]?.value;
    expect(statement.bind).toHaveBeenCalledWith('tenant-jwt', expect.stringMatching(/^SN-001$/));
  });

  it('maps a tenant-wide duplicate serial in a receipt manifest to 422', async () => {
    adapters.createSerialManifestAtomic.mockRejectedValueOnce(new Error('SERIAL_DUPLICATE'));
    const response = await runCreateSerialManifestHttp(env(), 'tenant-jwt', 'user-1', 'admin', {
      branchId: 'branch-1',
      purchaseReceiptLineId: 'receipt-line-1',
      serialNumbers: ['SN-001', 'SN-001'],
    });
    expect(response).toMatchObject({ status: 422, body: { code: 'SERIAL_DUPLICATE' } });
  });

  it('rejects lease replay and cross-terminal acquisition with 422', async () => {
    adapters.acquireSerialLeaseAtomic
      .mockResolvedValueOnce({ leaseToken: 'opaque_kp_7FXQm19w', replayed: false })
      .mockRejectedValueOnce(new Error('SERIAL_LEASE_REPLAY'))
      .mockRejectedValueOnce(new Error('SERIAL_LEASED_BY_OTHER_TERMINAL'));

    const body = { serialId: 'serial-1', idempotencyKey: 'lease-attempt-1' };
    const first = await runAcquireSerialLeaseHttp(
      env(),
      'tenant-jwt',
      'user-1',
      'cashier',
      'terminal-a',
      body,
    );
    const replay = await runAcquireSerialLeaseHttp(
      env(),
      'tenant-jwt',
      'user-1',
      'cashier',
      'terminal-a',
      body,
    );
    const crossTerminal = await runAcquireSerialLeaseHttp(
      env(),
      'tenant-jwt',
      'user-2',
      'cashier',
      'terminal-b',
      body,
    );

    expect(first).toMatchObject({
      status: 201,
      body: { leaseToken: 'opaque_kp_7FXQm19w', replayed: false },
    });
    expect(replay).toMatchObject({ status: 422, body: { code: 'SERIAL_LEASE_REPLAY' } });
    expect(crossTerminal).toMatchObject({
      status: 422,
      body: { code: 'SERIAL_LEASED_BY_OTHER_TERMINAL' },
    });
    expect(String(first.body.leaseToken)).not.toContain('serial-1');
    expect(String(first.body.leaseToken)).not.toContain('tenant-jwt');
  });

  it('keeps disposition server-authoritative and privileged', async () => {
    const denied = await runDisposeSerialHttp(env(), 'tenant-jwt', 'user-1', 'cashier', {
      serialId: 'serial-1',
      disposition: 'RETURN_TO_STOCK',
      status: 'AVAILABLE',
    });
    expect(denied.status).toBe(403);

    const allowed = await runDisposeSerialHttp(env(), 'tenant-jwt', 'user-1', 'owner', {
      serialId: 'serial-1',
      disposition: 'RETURN_TO_STOCK',
      status: 'SOLD',
    });
    expect(allowed.status).toBe(200);
    expect(adapters.disposeSerialAtomic).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-jwt',
      'user-1',
      {
        serialId: 'serial-1',
        disposition: 'RETURN_TO_STOCK',
      },
    );
  });

  it('requires privileged manifest writes and never accepts a client tenant', async () => {
    const response = await runCreateSerialManifestHttp(env(), 'tenant-jwt', 'user-1', 'owner', {
      tenantId: 'tenant-attacker',
      branchId: 'branch-1',
      purchaseReceiptLineId: 'receipt-line-1',
      serialNumbers: [' SN-002 '],
    });
    expect(response.status).toBe(201);
    expect(adapters.createSerialManifestAtomic).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-jwt',
      'user-1',
      expect.objectContaining({
        branchId: 'branch-1',
        purchaseReceiptLineId: 'receipt-line-1',
        serialNumbers: ['SN-002'],
      }),
    );
    expect(adapters.createSerialManifestAtomic.mock.calls[0]?.[3]).not.toHaveProperty('tenantId');
  });
});
