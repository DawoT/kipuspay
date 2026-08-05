import { describe, expect, it } from 'vitest';
import {
  isInventoryOpsEnabled,
  runApproveCountHttp,
  runApproveStockLossHttp,
  runCreateInventoryCountHttp,
  runCreateStockLossHttp,
  runOwnerStockAlertsHttp,
  runRejectStockLossHttp,
  runSubmitCountReviewHttp,
} from './inventory-ops-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

type Row = Record<string, unknown>;

function mockDbEnv(
  opts: {
    feature?: boolean;
    ownerMode?: boolean;
    first?: (sql: string) => Row | null;
    all?: (sql: string) => Row[];
    noDb?: boolean;
  } = {},
): WorkerEnv {
  const feature = opts.feature ?? true;
  if (opts.noDb) {
    return {
      FEATURE_INVENTORY_BATCHES: feature ? '1' : '0',
      FEATURE_OWNER_MODE: opts.ownerMode ? '1' : '0',
    } as unknown as WorkerEnv;
  }

  const prepare = (sql: string) => {
    const stmt = {
      bind: () => stmt,
      run: () => Promise.resolve({ success: true }),
      first: () => Promise.resolve(opts.first?.(sql) ?? null),
      all: () => Promise.resolve({ results: opts.all?.(sql) ?? [] }),
    };
    return stmt;
  };

  return {
    FEATURE_INVENTORY_BATCHES: feature ? '1' : '0',
    FEATURE_OWNER_MODE: opts.ownerMode ? '1' : '0',
    DB: {
      prepare,
      batch: () => Promise.resolve([]),
    },
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response('{}')) }),
    },
  } as unknown as WorkerEnv;
}

describe('inventory ops flags', () => {
  it('default off', () => {
    expect(isInventoryOpsEnabled({} as WorkerEnv)).toBe(false);
    expect(isInventoryOpsEnabled({ FEATURE_INVENTORY_BATCHES: '1' } as WorkerEnv)).toBe(true);
    expect(isInventoryOpsEnabled({ FEATURE_INVENTORY_BOM: 'true' } as WorkerEnv)).toBe(true);
  });
});

describe('create inventory count', () => {
  it('FEATURE_OFF', async () => {
    const res = await runCreateInventoryCountHttp(mockDbEnv({ feature: false }), 't1', 'u1', {
      branchId: 'b1',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('DB unavailable', async () => {
    const res = await runCreateInventoryCountHttp(mockDbEnv({ noDb: true }), 't1', 'u1', {
      branchId: 'b1',
    });
    expect(res.status).toBe(503);
  });

  it('branchId required', async () => {
    const res = await runCreateInventoryCountHttp(mockDbEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
  });

  it('crea conteo ciego COUNTING', async () => {
    const res = await runCreateInventoryCountHttp(mockDbEnv(), 't1', 'u1', {
      branchId: 'b1',
      differenceThresholdCents: 500,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COUNTING');
    expect(res.body.blind).toBe(true);
  });
});

describe('submit count review', () => {
  it('countId required', async () => {
    const res = await runSubmitCountReviewHttp(mockDbEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('not found', async () => {
    const res = await runSubmitCountReviewHttp(mockDbEnv({ first: () => null }), 't1', {
      countId: 'c1',
    });
    expect(res.status).toBe(404);
  });

  it('rechaza conteo ya aprobado', async () => {
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({ first: () => ({ status: 'APPROVED' }) }),
      't1',
      { countId: 'c1', lines: [] },
    );
    expect(res.status).toBe(422);
  });

  it('pasa a DIFFERENCE_REVIEW', async () => {
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({ first: () => ({ status: 'COUNTING' }) }),
      't1',
      {
        countId: 'c1',
        lines: [
          {
            productId: 'p1',
            countedQty: 8,
            systemQty: 10,
            unitCostCents: 100,
          },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DIFFERENCE_REVIEW');
    expect(res.body.lineCount).toBe(1);
  });
});

describe('approve count', () => {
  it('countId required', async () => {
    const res = await runApproveCountHttp(mockDbEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
  });

  it('not found', async () => {
    const res = await runApproveCountHttp(mockDbEnv({ first: () => null }), 't1', 'u1', {
      countId: 'c1',
    });
    expect(res.status).toBe(404);
  });

  it('exige authz si diff supera umbral', async () => {
    const res = await runApproveCountHttp(
      mockDbEnv({
        first: () => ({
          status: 'DIFFERENCE_REVIEW',
          difference_threshold_cents: 100,
          branch_id: 'b1',
        }),
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      { countId: 'c1' },
    );
    expect(res.status).toBe(403);
  });

  it('aprueba con authz y genera AJUSTE', async () => {
    const res = await runApproveCountHttp(
      mockDbEnv({
        first: () => ({
          status: 'DIFFERENCE_REVIEW',
          difference_threshold_cents: 100,
          branch_id: 'b1',
        }),
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      { countId: 'c1', authorizedByUserId: 'mgr1' },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });
});

describe('stock loss', () => {
  it('create valida qty/reason', async () => {
    const bad = await runCreateStockLossHttp(mockDbEnv(), 't1', 'u1', {
      branchId: 'b1',
      productId: 'p1',
      quantity: 0,
      reason: 'x',
    });
    expect(bad.status).toBe(422);

    const ok = await runCreateStockLossHttp(mockDbEnv(), 't1', 'u1', {
      branchId: 'b1',
      productId: 'p1',
      quantity: 2,
      category: 'DAMAGED',
      evidenceR2Key: 'r2/key',
      reason: 'roto',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PENDING');
  });

  it('approve exige evidencia', async () => {
    const res = await runApproveStockLossHttp(
      mockDbEnv({
        first: () => ({
          status: 'PENDING',
          quantity: 2,
          category: 'DAMAGED',
          evidence_r2_key: null,
          reason: 'roto',
          branch_id: 'b1',
          product_id: 'p1',
          batch_id: null,
        }),
      }),
      't1',
      'u1',
      { lossId: 'l1' },
    );
    expect(res.status).toBe(422);
  });

  it('approve aplica AJUSTE negativo', async () => {
    const res = await runApproveStockLossHttp(
      mockDbEnv({
        first: () => ({
          status: 'PENDING',
          quantity: 2,
          category: 'DAMAGED',
          evidence_r2_key: 'r2/e',
          reason: 'roto',
          branch_id: 'b1',
          product_id: 'p1',
          batch_id: 'bat1',
        }),
      }),
      't1',
      'u1',
      { lossId: 'l1' },
    );
    expect(res.status).toBe(200);
    expect(res.body.adjustmentQty).toBe(-2);
  });

  it('reject loss', async () => {
    const missing = await runRejectStockLossHttp(mockDbEnv({ first: () => null }), 't1', {
      lossId: 'l1',
    });
    expect(missing.status).toBe(404);

    const ok = await runRejectStockLossHttp(
      mockDbEnv({ first: () => ({ status: 'PENDING' }) }),
      't1',
      { lossId: 'l1' },
    );
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('REJECTED');
  });

  it('approve lossId required', async () => {
    const res = await runApproveStockLossHttp(mockDbEnv(), 't1', 'u1', {});
    expect(res.status).toBe(400);
  });
});

describe('owner stock alerts', () => {
  it('exige branchId', async () => {
    const res = await runOwnerStockAlertsHttp(mockDbEnv(), 't1', {});
    expect(res.status).toBe(400);
  });

  it('FEATURE_OFF sin owner mode', async () => {
    const res = await runOwnerStockAlertsHttp(mockDbEnv({ feature: false }), 't1', {
      branchId: 'b1',
    });
    expect(res.status).toBe(404);
  });

  it('permite owner mode sin inventory flags', async () => {
    const res = await runOwnerStockAlertsHttp(
      mockDbEnv({
        feature: false,
        ownerMode: true,
        all: (sql) => {
          if (sql.includes('branch_stock_policies')) {
            return [{ product_id: 'p1', min_stock: 5, reorder_point: 10, reorder_qty: 20 }];
          }
          if (sql.includes('inventory_batches')) {
            return [
              {
                id: 'bat1',
                product_id: 'p1',
                stock: 3,
                expiration_date: '2026-08-10',
              },
            ];
          }
          return [];
        },
        first: (sql) => {
          if (sql.includes('branch_product_stock')) return { stock: 3 };
          return null;
        },
      }),
      't1',
      { branchId: 'b1', expiryWarnDays: 30 },
    );
    expect(res.status).toBe(200);
    expect(Number(res.body.alertCount)).toBeGreaterThan(0);
  });

  it('DB unavailable', async () => {
    const res = await runOwnerStockAlertsHttp(mockDbEnv({ noDb: true, ownerMode: true }), 't1', {
      branchId: 'b1',
    });
    expect(res.status).toBe(503);
  });
});
