/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- RED contract imports an intentionally missing module */
import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike } from './index.js';
import {
  appendWeightMeasurementToPlan,
  assertWeightedMeasurementCoverage,
  reconcileWeightedSync,
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

describe('inventory.scale ACID contract', () => {
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

  it('plans measurement, stock, audit and one-shot token consumption in one batch', async () => {
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
    expect(sql.some((statement) => statement.includes('stock_microunits'))).toBe(true);
    expect(sql.some((statement) => statement.includes("'WEIGHT_OVERRIDE'"))).toBe(true);
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
