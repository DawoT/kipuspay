/* eslint-disable @typescript-eslint/no-unsafe-assignment -- mocked adapter call inspection */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isInventoryScaleEnabled,
  runAuthorizeManualWeightHttp,
  runConfigureWeightPolicyHttp,
  runDiagnoseScaleDeviceHttp,
  runDisableScaleDeviceHttp,
  runHeartbeatScaleDeviceHttp,
  runListScaleDevicesHttp,
  runRegisterScaleDeviceHttp,
  runRegisterTerminalSessionHttp,
  runSubmitWeightHttp,
} from './inventory-scale-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const adapters = vi.hoisted(() => ({
  createWeightOverrideAuthorization: vi.fn(),
  configureTenantWeightPolicy: vi.fn(),
  diagnoseScaleDevice: vi.fn(),
  disableScaleDevice: vi.fn(),
  listScaleDevices: vi.fn(),
  registerScaleDevice: vi.fn(),
  registerTerminalSession: vi.fn(),
  resolveActiveTerminalSession: vi.fn(),
  submitWeightMeasurementAtomic: vi.fn(),
  writeScaleHeartbeat: vi.fn(),
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
    adapters.configureTenantWeightPolicy.mockResolvedValue({
      manualWeightThresholdMicrounits: 250_000,
    });
    adapters.listScaleDevices.mockResolvedValue([]);
    adapters.registerScaleDevice.mockResolvedValue({ deviceId: 'scale-1', status: 'ACTIVE' });
    adapters.registerTerminalSession.mockResolvedValue({
      terminalSessionId: 'terminal-session-1',
      status: 'ACTIVE',
    });
    adapters.resolveActiveTerminalSession.mockResolvedValue({
      terminalSessionId: 'terminal-session-1',
      terminalId: 'terminal-1',
      cashRegisterSessionId: 'cash-session-1',
      userId: 'cashier-1',
      branchId: 'branch-1',
    });
    adapters.diagnoseScaleDevice.mockResolvedValue({ deviceId: 'scale-1', status: 'ACTIVE' });
    adapters.disableScaleDevice.mockResolvedValue({ deviceId: 'scale-1', status: 'DISABLED' });
    adapters.writeScaleHeartbeat.mockResolvedValue({
      deviceId: 'scale-1',
      heartbeatSequence: 10,
    });
  });

  it('defaults the capability off and hides the route', async () => {
    expect(isInventoryScaleEnabled({} as WorkerEnv)).toBe(false);
    const response = await runSubmitWeightHttp(
      env('0'),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: 'terminal-1',
        terminalSessionId: 'terminal-session-1',
      },
      {},
    );
    expect(response).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('splits untrusted hardware input from the trusted HTTP DTO', async () => {
    const response = await runSubmitWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: 'terminal-1',
        terminalSessionId: 'terminal-session-1',
      },
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
      consumingActorUserId: 'cashier-1',
      terminalSessionId: 'terminal-session-1',
    };
    const denied = await runAuthorizeManualWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: 'terminal-1',
        terminalSessionId: 'terminal-session-1',
      },
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
        terminalSessionId: 'supervisor-session-1',
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
        actorUserId: 'cashier-1',
        approvedByUserId: 'supervisor-1',
        terminalId: 'terminal-1',
        offlineSaleId: 'offline-1',
        saleItemId: 'line-1',
        measurementId: 'measure-1',
        ttlSeconds: 90,
      }),
    );
  });

  it('rejects a free terminal header without an active tenant-user-branch binding', async () => {
    adapters.resolveActiveTerminalSession.mockRejectedValueOnce(
      new Error('TERMINAL_SESSION_FORBIDDEN'),
    );
    const response = await runSubmitWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: 'spoofed-terminal',
        terminalSessionId: 'terminal-session-1',
      },
      {
        measurementId: 'measure-1',
        saleItemId: 'line-1',
        productId: 'product-1',
        weightMicrounits: 1,
        measurementSource: 'MANUAL',
      },
    );
    expect(response).toEqual({ status: 403, body: { code: 'FORBIDDEN' } });
    expect(adapters.submitWeightMeasurementAtomic).not.toHaveBeenCalled();
  });

  it('rejects missing terminal/session preflight before adapter work', async () => {
    const response = await runSubmitWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: '',
        terminalSessionId: '',
      },
      {},
    );
    expect(response).toEqual({ status: 403, body: { code: 'FORBIDDEN' } });
    expect(adapters.resolveActiveTerminalSession).not.toHaveBeenCalled();
  });

  it('writes heartbeat only for the exact bound device, protocol and increasing sequence', async () => {
    const actor = {
      tenantId: 'tenant-jwt',
      userId: 'cashier-1',
      role: 'cashier',
      terminalId: 'terminal-1',
      terminalSessionId: 'terminal-session-1',
    };
    const response = await runHeartbeatScaleDeviceHttp(env(), actor, {
      deviceId: 'scale-1',
      protocol: 'WEBUSB',
      heartbeatSequence: 10,
      observedAt: new Date().toISOString(),
    });
    expect(response).toMatchObject({ status: 200, body: { heartbeatSequence: 10 } });
    expect(adapters.writeScaleHeartbeat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        terminalId: 'terminal-1',
        terminalSessionId: 'terminal-session-1',
        deviceId: 'scale-1',
        protocol: 'WEBUSB',
        heartbeatSequence: 10,
      }),
    );
  });

  it('allows only admin to register a cashier terminal session', async () => {
    const admin = {
      tenantId: 'tenant-jwt',
      userId: 'admin-1',
      role: 'admin',
      terminalId: 'terminal-1',
      terminalSessionId: 'admin-session-1',
    };
    const response = await runRegisterTerminalSessionHttp(env(), admin, {
      terminalId: 'terminal-1',
      cashRegisterSessionId: 'cash-session-1',
      userId: 'cashier-1',
    });
    expect(response.status).toBe(201);
    expect(adapters.registerTerminalSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-jwt',
        terminalId: 'terminal-1',
        cashRegisterSessionId: 'cash-session-1',
        userId: 'cashier-1',
      }),
    );
  });

  it('returns 403 when manual weight exceeds the tenant threshold without scoped auth', async () => {
    adapters.submitWeightMeasurementAtomic.mockRejectedValueOnce(
      new Error('WEIGHT_OVERRIDE_REQUIRED'),
    );
    const response = await runSubmitWeightHttp(
      env(),
      {
        tenantId: 'tenant-jwt',
        userId: 'cashier-1',
        role: 'cashier',
        terminalId: 'terminal-1',
        terminalSessionId: 'terminal-session-1',
      },
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

  it('requires admin RBAC for policy and registration while diagnostics remain terminal-scoped', async () => {
    const cashier = {
      tenantId: 'tenant-jwt',
      userId: 'cashier-1',
      role: 'cashier',
      terminalId: 'terminal-1',
      terminalSessionId: 'terminal-session-1',
    };
    const admin = { ...cashier, role: 'admin', userId: 'admin-1' };
    expect(
      await runConfigureWeightPolicyHttp(env(), cashier, {
        manualWeightThresholdMicrounits: 250_000,
      }),
    ).toMatchObject({ status: 403 });
    expect(
      await runConfigureWeightPolicyHttp(env(), admin, {
        manualWeightThresholdMicrounits: 250_000,
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await runRegisterScaleDeviceHttp(env(), admin, {
        protocol: 'WEBHID',
        deviceFingerprint: 'hid:1234:5678:profile-a',
        profile: { profileId: 'profile-a', vendorId: 4660, productId: 22136, reportId: 3 },
      }),
    ).toMatchObject({ status: 201 });
    await runListScaleDevicesHttp(env(), admin);
    await runDiagnoseScaleDeviceHttp(env(), cashier, { deviceId: 'scale-1' });
    await runDisableScaleDeviceHttp(env(), admin, { deviceId: 'scale-1' });
    expect(adapters.diagnoseScaleDevice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-jwt', terminalId: 'terminal-1' }),
    );
  });

  it('maps unexpected D1 details to an opaque generic 500', async () => {
    adapters.listScaleDevices.mockRejectedValueOnce(
      new Error('D1_ERROR: no such column secret_internal'),
    );
    const response = await runListScaleDevicesHttp(env(), {
      tenantId: 'tenant-jwt',
      userId: 'admin-1',
      role: 'admin',
      terminalId: 'terminal-1',
      terminalSessionId: 'terminal-session-1',
    });
    expect(response).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(response)).not.toContain('secret_internal');
  });
});
