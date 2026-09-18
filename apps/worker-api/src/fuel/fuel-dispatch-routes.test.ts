import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
const processOfflineSaleAtomicMock = vi.hoisted(() =>
  vi.fn(
    async (
      _db: unknown,
      _tenant: string,
      _user: string,
      _payload: unknown,
      options: {
        afterSaleStatements?: (
          plan: { add(statement: unknown): void },
          saleId: string,
          audit: string | null,
        ) => void;
      },
    ) => {
      const added: unknown[] = [];
      options.afterSaleStatements?.({ add: (statement) => added.push(statement) }, 'sale-1', null);
      return { saleId: 'sale-1', added };
    },
  ),
);
vi.mock('@kipuspay/adapters-d1', () => ({
  processOfflineSaleAtomic: processOfflineSaleAtomicMock,
}));
import {
  runCreateFuelDispatchHttp,
  runFuelCatalogHttp,
  runFuelIslandShiftReportHttp,
} from './fuel-dispatch-routes.js';

function env(
  options: {
    readonly capability?: number;
    readonly catalog?: Record<string, unknown> | null;
    readonly existing?: Record<string, unknown> | null;
    readonly reportRows?: readonly Record<string, unknown>[];
    readonly capabilityConfig?: Record<string, unknown>;
    readonly reject?: boolean;
  } = {},
): WorkerEnv {
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => {
          if (options.reject) throw new Error('D1_DOWN');
          if (sql.includes('tenant_capabilities')) {
            return {
              enabled: options.capability ?? 1,
              config_json: JSON.stringify(options.capabilityConfig ?? {}),
              epoch: 4,
            };
          }
          if (sql.includes('fuel_dispatches') && sql.includes('idempotency_key')) {
            return options.existing ?? null;
          }
          if (sql.includes('fuel_catalog')) return options.catalog ?? null;
          if (sql.includes('payment_methods')) return { id: 'pm-cash' };
          if (sql.includes('branch_document_series')) return { series: 'B001' };
          return null;
        }),
        all: vi.fn(async () => ({ results: options.reportRows ?? [] })),
      })),
    })),
    batch: vi.fn(async () => [{ success: true }]),
  };
  return {
    DB: db,
    FEATURE_FUEL_STATION: '1',
  } as unknown as WorkerEnv;
}

const actor = { tenantId: 't1', userId: 'u1', role: 'cashier' };
const body = {
  dispatchId: 'dispatch-1',
  idempotencyKey: 'idem-1',
  fuelCode: 'DIESEL_B5',
  volumeMicrounits: 2_000_000,
  businessInvoice: true,
  documentType: '01',
  islandId: 'isla-1',
  nozzleId: 'manguera-1',
  paymentMethod: 'cash',
  branchId: 'branch-1',
  cashRegisterSessionId: 'session-1',
  clientDocumentType: '6',
  clientDocumentNumber: '20123456789',
  clientName: 'Cliente Empresa',
};

describe('fuel dispatch HTTP', () => {
  it('no confirma ni descuenta stock si falta el contexto de venta y caja', async () => {
    const runtime = env({
      catalog: {
        code: 'DIESEL_B5',
        price_cents_per_gallon: 1620,
        igv_rate_bps: 1800,
        detraction_rate_bps: 1000,
        stock_microunits: 5_000_000,
      },
    });
    const result = await runCreateFuelDispatchHttp(runtime, actor, {
      ...body,
      branchId: undefined,
      cashRegisterSessionId: undefined,
    });
    expect(result).toMatchObject({ status: 422, body: { code: 'FUEL_SALE_CONTEXT_REQUIRED' } });
    expect(
      (runtime.DB as unknown as { batch: ReturnType<typeof vi.fn> }).batch,
    ).not.toHaveBeenCalled();
  });

  it('persists vehicle, fleet and meter readings as part of the dispatch snapshot', async () => {
    const runtime = env({
      catalog: {
        code: 'DIESEL_B5',
        price_cents_per_gallon: 1620,
        igv_rate_bps: 1800,
        detraction_rate_bps: 1000,
        stock_microunits: 5_000_000,
      },
    });
    const result = await runCreateFuelDispatchHttp(runtime, actor, {
      ...body,
      plate: 'ABC123',
      fleetId: 'fleet-1',
      meterReadingMicrounits: 12_345_000,
    });

    expect(result.status).toBe(201);
    const prepared = (runtime.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare;
    expect(
      prepared.mock.calls.some(([sql]) => String(sql).includes('meter_reading_microunits')),
    ).toBe(true);
  });

  it('reads tenant catalog policy and persists an authoritative dispatch atomically', async () => {
    const runtime = env({
      catalog: {
        code: 'DIESEL_B5',
        price_cents_per_gallon: 1620,
        igv_rate_bps: 1800,
        detraction_rate_bps: 1000,
        stock_microunits: 5_000_000,
      },
    });

    const result = await runCreateFuelDispatchHttp(runtime, actor, body);

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      dispatchId: 'dispatch-1',
      totalCents: 3823,
      detractionCents: 382,
      volumeMicrounits: 2_000_000,
    });
    expect(processOfflineSaleAtomicMock).toHaveBeenCalled();
    const prepared = (runtime.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare;
    expect(prepared.mock.calls.some(([sql]) => String(sql).includes('NOT EXISTS'))).toBe(true);
  });

  it('replays an existing idempotency key without a second batch', async () => {
    const runtime = env({ existing: { dispatch_id: 'dispatch-1', total_cents: 3823 } });
    const result = await runCreateFuelDispatchHttp(runtime, actor, body);

    expect(result).toMatchObject({
      status: 200,
      body: { replayed: true, dispatchId: 'dispatch-1' },
    });
    expect(
      (runtime.DB as unknown as { batch: ReturnType<typeof vi.fn> }).batch,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when the tenant capability is revoked or D1 is unavailable', async () => {
    await expect(
      runCreateFuelDispatchHttp(env({ capability: 0 }), actor, body),
    ).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      runCreateFuelDispatchHttp(env({ reject: true }), actor, body),
    ).resolves.toMatchObject({
      status: 503,
    });
  });

  it('requires an operational POS role before reading or writing fuel state', async () => {
    await expect(
      runCreateFuelDispatchHttp(env(), { ...actor, role: 'viewer' }, body),
    ).resolves.toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
  });

  it('builds the island shift report from server-side dispatch facts', async () => {
    const runtime = env({
      reportRows: [
        {
          island_id: 'isla-1',
          nozzle_id: 'm1',
          volume_microunits: 1_000_000,
          total_cents: 1_000,
          payment_method: 'cash',
          cash_register_session_id: 'session-1',
        },
      ],
    });
    const result = await runFuelIslandShiftReportHttp(runtime, actor, 'isla-1');

    expect(result).toMatchObject({
      status: 200,
      body: {
        reports: [{ islandId: 'isla-1', totalCents: 1_000, volumeMicrounits: 1_000_000 }],
        cashRegisterSessionIds: ['session-1'],
      },
    });
    const prepared = (runtime.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare;
    expect(
      prepared.mock.calls.some(([sql]) =>
        String(sql).includes('JOIN sales s ON s.tenant_id = fd.tenant_id'),
      ),
    ).toBe(true);
  });

  it('can use a validated capability price snapshot when the catalog row is not yet materialized', async () => {
    const runtime = env({
      capabilityConfig: {
        priceCentsPerGallon: 1620,
        igvRateBps: 1800,
        detractionRateBps: 1000,
        stockMicrounits: 5_000_000,
      },
    });
    const result = await runCreateFuelDispatchHttp(runtime, actor, body);

    expect(result).toMatchObject({ status: 201, body: { totalCents: 3823 } });
  });

  it('rejects a capability snapshot that has no materialized stock', async () => {
    const result = await runCreateFuelDispatchHttp(
      env({
        capabilityConfig: {
          priceCentsPerGallon: 1620,
          igvRateBps: 1800,
          detractionRateBps: 1000,
        },
      }),
      actor,
      body,
    );
    expect(result).toMatchObject({ status: 422, body: { code: 'FUEL_STOCK_NOT_CONFIGURED' } });
  });

  it('materializes a common ACID sale and links the dispatch when a cash session is present', async () => {
    processOfflineSaleAtomicMock.mockClear();
    const runtime = env({
      catalog: {
        code: 'DIESEL_B5',
        price_cents_per_gallon: 1620,
        igv_rate_bps: 1800,
        detraction_rate_bps: 1000,
        stock_microunits: 5_000_000,
      },
    });
    const result = await runCreateFuelDispatchHttp(runtime, actor, {
      ...body,
      businessInvoice: false,
      documentType: '03',
      branchId: 'branch-1',
      cashRegisterSessionId: 'session-1',
    });
    expect(result).toMatchObject({ status: 201, body: { saleId: 'sale-1' } });
    expect(processOfflineSaleAtomicMock).toHaveBeenCalledOnce();
    const processed = await (processOfflineSaleAtomicMock.mock.results[0]!.value as Promise<{
      added: unknown[];
    }>);
    expect(processed.added).toHaveLength(3);
  });

  it('preserves NV as an internal document instead of coercing it to a boleta', async () => {
    processOfflineSaleAtomicMock.mockClear();
    const runtime = env({
      catalog: {
        code: 'DIESEL_B5',
        price_cents_per_gallon: 1620,
        igv_rate_bps: 1800,
        detraction_rate_bps: 1000,
        stock_microunits: 5_000_000,
      },
    });
    const result = await runCreateFuelDispatchHttp(runtime, actor, {
      ...body,
      businessInvoice: false,
      documentType: 'NV',
      series: 'NV01',
    });
    expect(result.status).toBe(201);
    expect(processOfflineSaleAtomicMock).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      'u1',
      expect.objectContaining({ documentType: 'NV', series: 'NV01' }),
      expect.anything(),
    );
  });

  it('serves a validated tenant catalog snapshot without exposing client-side defaults', async () => {
    const runtime = env({
      capabilityConfig: {
        catalog: [
          {
            code: 'GASOHOL_95',
            name: 'Gasohol 95',
            priceCentsPerGallon: 1780,
            igvRateBps: 1800,
            detractionRateBps: 0,
          },
        ],
      },
    });
    const result = await runFuelCatalogHttp(runtime, actor);

    expect(result).toMatchObject({
      status: 200,
      body: { items: [{ code: 'GASOHOL_95', priceCentsPerGallon: 1780 }] },
    });
  });
});
