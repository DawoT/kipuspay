import { describe, expect, it, vi } from 'vitest';
import { processSupplierReturnCreateAtomic } from '@kipuspay/adapters-d1';
import {
  isPurchasingReturnsEnabled,
  runCancelSupplierReturnHttp,
  runCloseSupplierReturnHttp,
  runCreateSupplierReturnHttp,
  runOwnerSupplierReturnsHttp,
} from './supplier-return-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  processSupplierReturnCreateAtomic: vi.fn(() =>
    Promise.resolve({
      returnId: 'sr1',
      snapshotTotalCents: 1000,
      emitsFiscalDocument: false,
      movesStock: false,
    }),
  ),
  processSupplierReturnCloseAtomic: vi.fn(() =>
    Promise.resolve({
      returnId: 'sr1',
      status: 'CLOSED',
      emitsFiscalDocument: false,
      movesStock: true,
    }),
  ),
  processSupplierReturnCancelAtomic: vi.fn(() =>
    Promise.resolve({
      returnId: 'sr1',
      status: 'CANCELLED',
      emitsFiscalDocument: false,
      movesStock: false,
    }),
  ),
}));

function env(over: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_PURCHASING_RETURNS: '1',
    DB: {
      prepare() {
        const stmt = {
          bind() {
            return stmt;
          },
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        };
        return stmt;
      },
    },
    ...over,
  } as unknown as WorkerEnv;
}

describe('supplier-return-routes', () => {
  it('default off', () => {
    expect(isPurchasingReturnsEnabled({} as unknown as WorkerEnv)).toBe(false);
  });

  it('404 when flag off', async () => {
    const res = await runCreateSupplierReturnHttp(
      { FEATURE_PURCHASING_RETURNS: '0' } as unknown as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(404);
  });

  it('create/close/cancel 200', async () => {
    const created = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
      purchaseReceiptId: 'r1',
      reason: 'dañado',
      items: [{ productId: 'p1', enteredQuantityMicrounits: 1_000_000 }],
    });
    expect(created.status).toBe(200);
    expect(created.body.emitsFiscalDocument).toBe(false);
    const closed = await runCloseSupplierReturnHttp(env(), 't1', 'u1', { returnId: 'sr1' });
    expect(closed.status).toBe(200);
    const cancelled = await runCancelSupplierReturnHttp(env(), 't1', 'u1', { returnId: 'sr1' });
    expect(cancelled.status).toBe(200);
  });

  it('T-1: reporte Dueño con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runOwnerSupplierReturnsHttp(env(), 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('owner open list', async () => {
    const res = await runOwnerSupplierReturnsHttp(env(), 't1', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openReturns');
  });
});

describe('US-01 supplier-return: coerción hostil sobre enteredQuantityMicrounits (fail-closed)', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['true (Number→1)', true],
    ['[] (Number→0)', []],
    ["'0x10' (Number→16)", '0x10'],
    ["'' (Number→0)", ''],
    ['{} (Number→NaN)', {}],
    ['0 (cantidad nula)', 0],
    ['-1 (negativa)', -1],
    ['1.5 (no entera)', 1.5],
  ])('%s → 400 estable sin llamar la atómica', async (_label, hostile) => {
    const atomic = vi.mocked(processSupplierReturnCreateAtomic);
    atomic.mockClear();
    const res = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
      purchaseReceiptId: 'r1',
      reason: 'dañado',
      items: [{ productId: 'p1', enteredQuantityMicrounits: hostile as unknown as number }],
    });
    expect(res.status).toBe(400);
    expect(['INVALID_QUANTITY', 'QUANTITY_OUT_OF_RANGE']).toContain(res.body.code);
    // El valor coaccionado jamás llega a la función atómica.
    expect(atomic).not.toHaveBeenCalled();
  });

  it('microunits grandes pasan exactos a la atómica (sin drift de float)', async () => {
    const atomic = vi.mocked(processSupplierReturnCreateAtomic);
    atomic.mockClear();
    const big = 900_719_925_474_091;
    const res = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
      purchaseReceiptId: 'r1',
      reason: 'dañado',
      items: [{ productId: 'p1', enteredQuantityMicrounits: big }],
    });
    expect(res.status).toBe(200);
    const call = atomic.mock.calls[0];
    const input = call?.[3] as { items: Array<{ enteredQuantityMicrounits: number }> };
    expect(input.items[0]?.enteredQuantityMicrounits).toBe(big);
  });

  it('filas sin productId siguen descartándose antes de validar (semántica original)', async () => {
    const res = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
      purchaseReceiptId: 'r1',
      reason: 'dañado',
      items: [{ productId: '', enteredQuantityMicrounits: true as unknown as number }],
    });
    // La fila hostil se descarta por productId vacío → BAD_REQUEST de items
    // requeridos, no un falso 400 de cantidad.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });
});
