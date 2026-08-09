import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike } from './index.js';
import { sha256Hex } from './crypto.js';
import {
  appendWeightMeasurementToPlan,
  assertWeightedMeasurementCoverage,
  configureTenantWeightPolicy,
  createWeightOverrideAuthorization,
  diagnoseScaleDevice,
  disableScaleDevice,
  listScaleDevices,
  registerScaleDevice,
  reconcileWeightedSync,
  submitWeightMeasurementAtomic,
  validateWeightOverrideAuthorization,
} from './process-inventory-scale-atomic.js';

function recordingDb(sql: string[]): D1DatabaseLike {
  return {
    prepare(statement) {
      sql.push(statement);
      const bound: D1Bound = {
        bind: () => bound,
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: () => bound };
    },
    batch: () => Promise.resolve([]),
  };
}

function recordingDbWithParams(boundParams: unknown[][]): D1DatabaseLike {
  return {
    prepare() {
      const bound: D1Bound = {
        bind: (...params) => {
          boundParams.push(params);
          return bound;
        },
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: (...params) => bound.bind(...params) };
    },
    batch: () => Promise.resolve([]),
  };
}

function managedDb(calls: { sql: string; params: unknown[] }[]): D1DatabaseLike {
  return {
    prepare(sql) {
      const bound: D1Bound = {
        bind: (...params) => {
          calls.push({ sql, params });
          return bound;
        },
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        first: <T>() =>
          Promise.resolve({
            id: 'scale-a',
            protocol: 'WEBHID',
            terminal_id: 'terminal-a',
            status: 'ACTIVE',
          } as T),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: (...params) => bound.bind(...params) };
    },
    batch: () => Promise.resolve([]),
  };
}

describe('inventory.scale ACID contract', () => {
  it('stores only a SHA-256 digest for the opaque 90-second authorization token', async () => {
    const boundParams: unknown[][] = [];
    const db = recordingDbWithParams(boundParams);
    const result = await createWeightOverrideAuthorization(db, {
      tenantId: 'tenant-a',
      actorUserId: 'supervisor-a',
      terminalId: 'terminal-a',
      offlineSaleId: 'offline-a',
      saleItemId: 'line-a',
      measurementId: 'measure-a',
      action: 'WEIGHT_OVERRIDE',
      ttlSeconds: 90,
    });
    const flattened = boundParams.flat();
    expect(result.authorizationToken).toMatch(/^weight_/);
    expect(flattened).not.toContain(result.authorizationToken);
    expect(flattened).toContain(await sha256Hex(result.authorizationToken));
  });

  it('configures policy and manages only allowlisted terminal-owned scale devices', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = managedDb(calls);
    await configureTenantWeightPolicy(db, {
      tenantId: 'tenant-a',
      manualWeightThresholdMicrounits: 250_000,
    });
    await registerScaleDevice(db, {
      tenantId: 'tenant-a',
      terminalId: 'terminal-a',
      protocol: 'WEBHID',
      deviceFingerprint: 'hid:1234:5678:profile-a',
      profile: {
        profileId: 'profile-a',
        vendorId: 0x1234,
        productId: 0x5678,
        reportId: 3,
      },
    });
    await listScaleDevices(db, { tenantId: 'tenant-a', terminalId: 'terminal-a' });
    await diagnoseScaleDevice(db, {
      tenantId: 'tenant-a',
      terminalId: 'terminal-a',
      deviceId: 'scale-a',
    });
    await disableScaleDevice(db, {
      tenantId: 'tenant-a',
      terminalId: 'terminal-a',
      deviceId: 'scale-a',
    });
    expect(
      calls
        .filter(
          (call) =>
            call.sql.includes('tenant_weight_policies') ||
            call.sql.includes('scale_devices') ||
            call.sql.includes('pos_terminals'),
        )
        .every((call) => call.sql.includes('tenant_id')),
    ).toBe(true);
    expect(calls.some((call) => call.sql.includes('terminal_id = ?'))).toBe(true);
    await expect(
      registerScaleDevice(db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        protocol: 'BLUETOOTH' as 'WEBHID',
        deviceFingerprint: 'unknown',
        profile: { profileId: 'profile-a', vendorId: 1, productId: 2, reportId: 1 },
      }),
    ).rejects.toThrow('SCALE_PROTOCOL_NOT_ALLOWED');
  });

  it('rejects a stale device frame before resolving trusted sale facts', async () => {
    const sql: string[] = [];
    await expect(
      submitWeightMeasurementAtomic(recordingDb(sql), {
        tenantId: 'tenant-a',
        actorUserId: 'cashier-a',
        terminalId: 'terminal-a',
        saleItemId: 'line-a',
        productId: 'product-a',
        measurementId: 'measurement-a',
        weightMicrounits: 1_000_000,
        measurementSource: 'DEVICE',
        scaleProtocol: 'WEB_SERIAL',
        scaleDeviceId: 'scale-a',
        heartbeatSequence: 1,
        observedAt: new Date(Date.now() - 2_001).toISOString(),
      }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
    expect(sql).toEqual([]);
  });

  it('requires exactly one measurement for each weighted line', () => {
    expect(() =>
      assertWeightedMeasurementCoverage(
        [
          { saleItemId: 'line-1', productId: 'product-a', productType: 'WEIGH' },
          { saleItemId: 'line-2', productId: 'product-b', productType: 'physical' },
        ],
        [],
      ),
    ).toThrow('WEIGHT_MEASUREMENT_REQUIRED');
    expect(() =>
      assertWeightedMeasurementCoverage(
        [{ saleItemId: 'line-1', productId: 'product-a', productType: 'WEIGH' }],
        [
          { measurementId: 'measure-1', saleItemId: 'line-1', productId: 'product-a' },
          { measurementId: 'measure-2', saleItemId: 'line-1', productId: 'product-a' },
        ],
      ),
    ).toThrow('WEIGHT_MEASUREMENT_CARDINALITY');
  });

  it('preserves distinct measurement identity for two lines of the same product', () => {
    expect(
      assertWeightedMeasurementCoverage(
        [
          { saleItemId: 'line-1', productId: 'product-a', productType: 'WEIGH' },
          { saleItemId: 'line-2', productId: 'product-a', productType: 'WEIGH' },
        ],
        [
          { measurementId: 'measure-1', saleItemId: 'line-1', productId: 'product-a' },
          { measurementId: 'measure-2', saleItemId: 'line-2', productId: 'product-a' },
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ saleItemId: 'line-1', measurementId: 'measure-1' }),
        expect.objectContaining({ saleItemId: 'line-2', measurementId: 'measure-2' }),
      ]),
    );
  });

  it('binds a 90-second one-shot WEIGHT_OVERRIDE to the complete action scope', () => {
    const token = {
      id: 'auth-a',
      action: 'WEIGHT_OVERRIDE',
      tenantId: 'tenant-a',
      actorUserId: 'supervisor-a',
      terminalId: 'terminal-a',
      offlineSaleId: 'offline-a',
      saleItemId: 'line-a',
      measurementId: 'measure-a',
      issuedAtEpochMs: 10_000,
      expiresAtEpochMs: 100_000,
      usedAtEpochMs: null,
    } as const;

    expect(
      validateWeightOverrideAuthorization(token, {
        nowEpochMs: 99_999,
        tenantId: 'tenant-a',
        actorUserId: 'supervisor-a',
        terminalId: 'terminal-a',
        offlineSaleId: 'offline-a',
        saleItemId: 'line-a',
        measurementId: 'measure-a',
      }),
    ).toEqual({ authorizationTokenId: 'auth-a', consumeOnce: true });
    expect(() =>
      validateWeightOverrideAuthorization(
        { ...token, terminalId: 'terminal-b' },
        {
          nowEpochMs: 20_000,
          tenantId: 'tenant-a',
          actorUserId: 'supervisor-a',
          terminalId: 'terminal-a',
          offlineSaleId: 'offline-a',
          saleItemId: 'line-a',
          measurementId: 'measure-a',
        },
      ),
    ).toThrow('WEIGHT_OVERRIDE_SCOPE_INVALID');
    expect(() =>
      validateWeightOverrideAuthorization(
        { ...token, expiresAtEpochMs: 100_001 },
        {
          nowEpochMs: 20_000,
          tenantId: 'tenant-a',
          actorUserId: 'supervisor-a',
          terminalId: 'terminal-a',
          offlineSaleId: 'offline-a',
          saleItemId: 'line-a',
          measurementId: 'measure-a',
        },
      ),
    ).toThrow('WEIGHT_OVERRIDE_TTL_INVALID');
    expect(() =>
      validateWeightOverrideAuthorization(
        { ...token, usedAtEpochMs: 19_000 },
        {
          nowEpochMs: 20_000,
          tenantId: 'tenant-a',
          actorUserId: 'supervisor-a',
          terminalId: 'terminal-a',
          offlineSaleId: 'offline-a',
          saleItemId: 'line-a',
          measurementId: 'measure-a',
        },
      ),
    ).toThrow('WEIGHT_OVERRIDE_ALREADY_USED');
  });

  it('plans resolved measurement, audit guard and one-shot token consumption without double stock', async () => {
    const sql: string[] = [];
    const db = recordingDb(sql);
    const plan = new AtomicPlanBuilder(db, 'guard-weight');
    await appendWeightMeasurementToPlan(plan, db, {
      tenantId: 'tenant-a',
      actorUserId: 'cashier-a',
      terminalId: 'terminal-a',
      saleId: 'sale-a',
      saleItemId: 'line-a',
      productId: 'product-a',
      measurementId: 'measure-a',
      weightMicrounits: 500_000,
      unitPricePerBaseCents: 199,
      measurementSource: 'MANUAL',
      authorizationTokenId: 'auth-a',
    });

    expect(sql.some((statement) => statement.includes('INSERT INTO weight_measurements'))).toBe(
      true,
    );
    expect(sql.some((statement) => statement.includes('UPDATE branch_product_stock'))).toBe(false);
    expect(sql.some((statement) => statement.includes('UPDATE sale_items'))).toBe(false);
    expect(
      sql.some(
        (statement) =>
          statement.includes('INSERT INTO atomic_guards') &&
          statement.includes("action = 'WEIGHT_OVERRIDE'"),
      ),
    ).toBe(true);
    expect(sql.some((statement) => statement.includes("'WEIGHT_OVERRIDE'"))).toBe(true);
    expect(
      sql.some(
        (statement) =>
          statement.includes('INSERT INTO audit_events') && statement.includes("'WEIGHT_OVERRIDE'"),
      ),
    ).toBe(true);
    expect(
      sql.some(
        (statement) =>
          statement.includes('UPDATE authorization_tokens') &&
          statement.includes('used_at IS NULL'),
      ),
    ).toBe(true);
  });

  it('reconciles online and offline payloads to the same authoritative weight and cents', () => {
    const catalog = [{ productId: 'product-a', productType: 'WEIGH', unitPricePerBaseCents: 199 }];
    const measurements = [
      {
        measurementId: 'measure-a',
        saleItemId: 'line-a',
        productId: 'product-a',
        weightMicrounits: 500_000,
        measurementSource: 'DEVICE',
      },
    ] as const;

    const online = reconcileWeightedSync({
      catalog,
      measurements,
      clientProjectedTotalCents: 999_999,
      transport: 'ONLINE',
    });
    const offline = reconcileWeightedSync({
      catalog,
      measurements,
      clientProjectedTotalCents: 1,
      transport: 'OFFLINE_SYNC',
    });
    expect(offline).toEqual(online);
    expect(online).toMatchObject({
      authoritativeTotalCents: 100,
      lines: [{ saleItemId: 'line-a', weightMicrounits: 500_000, subtotalCents: 100 }],
    });
  });
});
