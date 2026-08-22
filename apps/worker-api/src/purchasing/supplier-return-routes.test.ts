import { describe, expect, it, vi } from 'vitest';
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

  it('US-04: enteredQuantityMicrounits de tipo inválido → 400 estable sin tocar el adapter', async () => {
    const { processSupplierReturnCreateAtomic } = await import('@kipuspay/adapters-d1');
    const callsBefore = vi.mocked(processSupplierReturnCreateAtomic).mock.calls.length;
    for (const bad of ['1000000', true, null, [1_000_000], {}, NaN]) {
      const res = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
        purchaseReceiptId: 'r1',
        reason: 'dañado',
        items: [{ productId: 'p1', enteredQuantityMicrounits: bad as unknown as number }],
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'invalid quantity microunits',
        code: 'INVALID_QUANTITY_MICROUNITS',
      });
    }
    // Fail-closed también para filas que el filtro de productId vacío habría
    // descartado antes: un tipo inválido se rechaza, no se ignora.
    const ghostRow = await runCreateSupplierReturnHttp(env(), 't1', 'u1', {
      purchaseReceiptId: 'r1',
      reason: 'dañado',
      items: [{ productId: '', enteredQuantityMicrounits: '999' }],
    });
    expect(ghostRow.status).toBe(400);
    expect(vi.mocked(processSupplierReturnCreateAtomic).mock.calls.length).toBe(callsBefore);
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
