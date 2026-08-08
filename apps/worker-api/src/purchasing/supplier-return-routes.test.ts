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

  it('owner open list', async () => {
    const res = await runOwnerSupplierReturnsHttp(env(), 't1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openReturns');
  });
});
