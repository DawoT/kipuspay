import { describe, expect, it } from 'vitest';
import {
  LOCATION_EXPIRED_BATCH,
  LOCATION_INSUFFICIENT_STOCK,
  LOCATION_INVALID_QUANTITY,
  LOCATION_NONEMPTY,
  LOCATION_RECONCILIATION_DRIFT,
  allocateStockByLocation,
  assertLocationCanDeactivate,
  planLocationCountAdjustment,
  planLocationTransfer,
  reconcileLocationTotal,
  sumActiveLocationStockMicrounits,
} from './locations.js';

describe('inventory locations', () => {
  it('suma solo ubicaciones activas en INTEGER microunits', () => {
    expect(
      sumActiveLocationStockMicrounits([
        { locationId: 'A', active: true, quantityMicrounits: 2_000_000 },
        { locationId: 'B', active: true, quantityMicrounits: 500_000 },
        { locationId: 'X', active: false, quantityMicrounits: 9_000_000 },
      ]),
    ).toBe(2_500_000);
    expect(() =>
      sumActiveLocationStockMicrounits([
        { locationId: 'A', active: true, quantityMicrounits: Number.MAX_SAFE_INTEGER },
        { locationId: 'B', active: true, quantityMicrounits: 1_000 },
      ]),
    ).toThrow('LOCATION_INVALID_QUANTITY');
  });

  it('transfiere sin alterar el total de sucursal', () => {
    expect(
      planLocationTransfer({
        sourceQuantityMicrounits: 3_000_000,
        destinationQuantityMicrounits: 250_000,
        transferQuantityMicrounits: 1_000_000,
      }),
    ).toEqual({
      sourceAfterMicrounits: 2_000_000,
      destinationAfterMicrounits: 1_250_000,
      branchDeltaMicrounits: 0,
    });
    expect(() =>
      planLocationTransfer({
        sourceQuantityMicrounits: 10,
        destinationQuantityMicrounits: 0,
        transferQuantityMicrounits: 11,
      }),
    ).toThrow(LOCATION_INSUFFICIENT_STOCK);
  });

  it('asigna FEFO y desempata por código de ubicación', () => {
    const allocations = allocateStockByLocation(
      [
        {
          locationId: 'loc-b',
          locationCode: 'B-01',
          batchId: 'batch-1',
          expiresAtIso: '2026-09-01',
          quantityMicrounits: 1_000_000,
        },
        {
          locationId: 'loc-a',
          locationCode: 'A-01',
          batchId: 'batch-1',
          expiresAtIso: '2026-09-01',
          quantityMicrounits: 750_000,
        },
        {
          locationId: 'loc-c',
          locationCode: 'C-01',
          batchId: 'batch-2',
          expiresAtIso: '2026-10-01',
          quantityMicrounits: 2_000_000,
        },
      ],
      2_000_000,
      '2026-08-08',
    );
    expect(allocations).toEqual([
      { locationId: 'loc-a', batchId: 'batch-1', quantityMicrounits: 750_000 },
      { locationId: 'loc-b', batchId: 'batch-1', quantityMicrounits: 1_000_000 },
      { locationId: 'loc-c', batchId: 'batch-2', quantityMicrounits: 250_000 },
    ]);
  });

  it('reconcilia agregado, conteo y desactivación', () => {
    expect(reconcileLocationTotal(2_000_000, 2_000_000)).toBe(0);
    expect(() => reconcileLocationTotal(2_000_000, 1_999_999)).toThrow(
      LOCATION_RECONCILIATION_DRIFT,
    );
    expect(
      planLocationCountAdjustment({
        systemQuantityMicrounits: 2_000_000,
        countedQuantityMicrounits: 1_750_000,
      }),
    ).toEqual({ differenceMicrounits: -250_000, nextQuantityMicrounits: 1_750_000 });
    expect(() => assertLocationCanDeactivate(1)).toThrow(LOCATION_NONEMPTY);
    expect(() => assertLocationCanDeactivate(0)).not.toThrow();
  });

  it('rechaza lote vencido, transferencia cero, o stock insuficiente en asignacion FEFO', () => {
    expect(() =>
      allocateStockByLocation(
        [
          {
            locationId: 'loc-exp',
            locationCode: 'A-01',
            batchId: 'batch-exp',
            expiresAtIso: '2026-07-01',
            quantityMicrounits: 1_000_000,
          },
        ],
        500_000,
        '2026-08-08',
      ),
    ).toThrow(LOCATION_EXPIRED_BATCH);

    expect(() => allocateStockByLocation([], 0, '2026-08-08')).toThrow(LOCATION_INVALID_QUANTITY);

    expect(() =>
      allocateStockByLocation(
        [
          {
            locationId: 'loc-1',
            locationCode: 'A-01',
            batchId: 'b-1',
            expiresAtIso: null,
            quantityMicrounits: 500_000,
          },
          {
            locationId: 'loc-2',
            locationCode: 'A-01',
            batchId: 'b-2',
            expiresAtIso: null,
            quantityMicrounits: 500_000,
          },
        ],
        1_500_000,
        '2026-08-08',
      ),
    ).toThrow(LOCATION_INSUFFICIENT_STOCK);

    expect(() =>
      planLocationTransfer({
        sourceQuantityMicrounits: 1_000_000,
        destinationQuantityMicrounits: 0,
        transferQuantityMicrounits: 0,
      }),
    ).toThrow(LOCATION_INVALID_QUANTITY);
  });

  it('valida assertMicrounits rechaza flotantes y negativos no permitidos', () => {
    expect(() =>
      planLocationTransfer({
        sourceQuantityMicrounits: 1.5,
        destinationQuantityMicrounits: 0,
        transferQuantityMicrounits: 1,
      }),
    ).toThrow(LOCATION_INVALID_QUANTITY);

    expect(() =>
      planLocationTransfer({
        sourceQuantityMicrounits: -100,
        destinationQuantityMicrounits: 0,
        transferQuantityMicrounits: 1,
      }),
    ).toThrow(LOCATION_INVALID_QUANTITY);
  });

  it('desempata por locationId y batchId y descarta candidatas en cero', () => {
    const allocations = allocateStockByLocation(
      [
        {
          locationId: 'loc-2',
          locationCode: 'A-01',
          batchId: 'batch-b',
          expiresAtIso: '2026-09-01',
          quantityMicrounits: 500_000,
        },
        {
          locationId: 'loc-1',
          locationCode: 'A-01',
          batchId: 'batch-a',
          expiresAtIso: '2026-09-01',
          quantityMicrounits: 500_000,
        },
        {
          locationId: 'loc-1',
          locationCode: 'A-01',
          batchId: 'batch-b',
          expiresAtIso: '2026-09-01',
          quantityMicrounits: 500_000,
        },
        {
          locationId: 'loc-zero',
          locationCode: 'A-00',
          batchId: 'batch-z',
          expiresAtIso: '2026-01-01',
          quantityMicrounits: 0,
        },
      ],
      1_000_000,
      '2026-08-08',
    );
    expect(allocations).toEqual([
      { locationId: 'loc-1', batchId: 'batch-a', quantityMicrounits: 500_000 },
      { locationId: 'loc-1', batchId: 'batch-b', quantityMicrounits: 500_000 },
    ]);
  });
});
