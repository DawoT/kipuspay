/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- RED contract imports an intentionally missing route module */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isInventoryScaleEnabled,
  runAuthorizeManualWeightHttp,
  runSubmitWeightHttp,
} from './inventory-scale-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const adapters = vi.hoisted(() => ({
  createWeightOverrideAuthorization: vi.fn(),
  submitWeightMeasurementAtomic: vi.fn(),
}));

vi.mock('@kipuspay/adapters-d1', () => adapters);

function env(flag = '1'): WorkerEnv {
  return {
    FEATURE_INVENTORY_SCALE: flag,
    DB: { prepare: vi.fn() },
  } as unknown as WorkerEnv;
}

describe('inventory.scale Worker routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.createWeightOverrideAuthorization.mockResolvedValue({
      authorizationToken: 'opaque-weight-token',
      expiresInSeconds: 90,
    });
    adapters.submitWeightMeasurementAtomic.mockResolvedValue({
      measurementId: 'measure-1',
      weightMicrounits: 500_000,
      authoritativeSubtotalCents: 100,
    });
  });

  it('defaults the capability off and hides the route', async () => {
    expect(isInventoryScaleEnabled({} as WorkerEnv)).toBe(false);
    const response = await runSubmitWeightHttp(
      env('0'),
      { tenantId: 'tenant-jwt', userId: 'cashier-1', role: 'cashier', terminalId: 'terminal-1' },
      {},
    );
    expect(response).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('splits untrusted hardware input from the trusted HTTP DTO', async () => {
    const response = await runSubmitWeightHttp(
      env(),
      { tenantId: 'tenant-jwt', userId: 'cashier-1', role: 'cashier', terminalId: 'terminal-1' },
      {
        tenantId: 'tenant-attacker',
        measurementId: 'measure-1',
        saleItemId: 'line-1',
        productId: 'product-1',
        weightMicrounits: 500_000,
        measurementSource: 'DEVICE',
        scaleProtocol: 'WEBHID',
        scaleDeviceId: 'scale-1',
        observedAt: '2026-08-08T17:00:00.000Z',
        heartbeatSequence: 9,
        rawBytes: [255, 1],
        unit: 'KG',
        unitPricePerBaseCents: 1,
        subtotalCents: 1,
      },
    );

    expect(response).toMatchObject({
      status: 201,
      body: { measurementId: 'measure-1', authoritativeSubtotalCents: 100 },
    });
    expect(adapters.submitWeightMeasurementAtomic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-jwt',
        actorUserId: 'cashier-1',
        terminalId: 'terminal-1',
        measurementId: 'measure-1',
        weightMicrounits: 500_000,
      }),
    );
    const trusted = adapters.submitWeightMeasurementAtomic.mock.calls[0]?.[1];
    expect(trusted).not.toHaveProperty('rawBytes');
    expect(trusted).not.toHaveProperty('unit');
    expect(trusted).not.toHaveProperty('unitPricePerBaseCents');
    expect(trusted).not.toHaveProperty('subtotalCents');
  });

  it('allows only supervisor/admin/owner to issue a scoped 90-second override', async () => {
    const body = {
      offlineSaleId: 'offline-1',
      saleItemId: 'line-1',
      measurementId: 'measure-1',
    };
    const denied = await runAuthorizeManualWeightHttp(
      env(),
      { tenantId: 'tenant-jwt', userId: 'cashier-1', role: 'cashier', terminalId: 'terminal-1' },
      body,
    );
    expect(denied.status).toBe(403);

    const allowed = await runAuthorizeManualWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'supervisor-1',
        role: 'supervisor',
        terminalId: 'terminal-1',
      },
      body,
    );
    expect(allowed).toMatchObject({
      status: 201,
      body: { authorizationToken: 'opaque-weight-token', expiresInSeconds: 90 },
    });
    expect(adapters.createWeightOverrideAuthorization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'WEIGHT_OVERRIDE',
        tenantId: 'tenant-jwt',
        actorUserId: 'supervisor-1',
        terminalId: 'terminal-1',
        offlineSaleId: 'offline-1',
        saleItemId: 'line-1',
        measurementId: 'measure-1',
        ttlSeconds: 90,
      }),
    );
  });

  it('returns 403 when manual weight exceeds the tenant threshold without scoped auth', async () => {
    adapters.submitWeightMeasurementAtomic.mockRejectedValueOnce(
      new Error('WEIGHT_OVERRIDE_REQUIRED'),
    );
    const response = await runSubmitWeightHttp(
      env(),
      { tenantId: 'tenant-jwt', userId: 'cashier-1', role: 'cashier', terminalId: 'terminal-1' },
      {
        measurementId: 'measure-1',
        saleItemId: 'line-1',
        productId: 'product-1',
        weightMicrounits: 1,
        measurementSource: 'MANUAL',
      },
    );
    expect(response).toMatchObject({ status: 403, body: { code: 'WEIGHT_OVERRIDE_REQUIRED' } });
  });
});
