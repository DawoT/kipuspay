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
    binds?: unknown[][];
    sqls?: string[];
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
    opts.sqls?.push(sql);
    const stmt = {
      bind: (...values: unknown[]) => {
        opts.binds?.push(values);
        return stmt;
      },
      run: () => Promise.resolve({ success: true }),
      first: () => {
        if (sql.includes('tenant_discount_policies')) {
          return Promise.resolve({ max_amount_without_auth_cents: 2000 });
        }
        return Promise.resolve(opts.first?.(sql) ?? null);
      },
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
    const res = await runSubmitCountReviewHttp(mockDbEnv(), 't1', 'owner', {});
    expect(res.status).toBe(400);
  });

  it('not found', async () => {
    const res = await runSubmitCountReviewHttp(mockDbEnv({ first: () => null }), 't1', 'owner', {
      countId: 'c1',
    });
    expect(res.status).toBe(404);
  });

  it('rechaza conteo ya aprobado', async () => {
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({ first: () => ({ status: 'APPROVED' }) }),
      't1',
      'owner',
      { countId: 'c1', lines: [] },
    );
    expect(res.status).toBe(422);
  });

  it('pasa a DIFFERENCE_REVIEW', async () => {
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({
        first: (sql) =>
          sql.includes('FROM inventory_counts')
            ? { status: 'COUNTING', branch_id: 'b1' }
            : {
                quantity_microunits: 10_000_000,
                pmp_unit_cost_cents: 100,
                location_id: 'loc-1',
              },
      }),
      't1',
      'owner',
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

  it('ignora systemQty/costo del cliente y carga autoridad del servidor', async () => {
    const binds: unknown[][] = [];
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({
        binds,
        first: (sql) =>
          sql.includes('FROM inventory_counts')
            ? { status: 'COUNTING', branch_id: 'b1' }
            : {
                quantity_microunits: 2_000_000,
                pmp_unit_cost_cents: 125,
                location_id: 'loc-1',
              },
      }),
      't1',
      'owner',
      {
        countId: 'c1',
        lines: [
          {
            productId: 'p1',
            countedQty: 3,
            systemQty: 999,
            unitCostCents: 999,
          },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(binds.flat()).toContain(2_000_000);
    expect(binds.flat()).toContain(125);
    expect(binds.flat()).not.toContain(999);
  });

  it('exige identidades exactas al enviar conteo serializado', async () => {
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({
        first: (sql) => {
          if (sql.includes('FROM inventory_counts')) {
            return { status: 'COUNTING', branch_id: 'b1' };
          }
          if (sql.includes('COALESCE(s.quantity_microunits')) {
            return {
              quantity_microunits: 2_000_000,
              pmp_unit_cost_cents: 100,
              location_id: 'loc-1',
              serial_tracking_mode: 'REQUIRED',
            };
          }
          if (sql.includes('SELECT serial_tracking_mode')) {
            return { serial_tracking_mode: 'REQUIRED' };
          }
          return null;
        },
        all: (sql) =>
          sql.includes('SELECT id, serial_tracking_mode FROM products')
            ? [{ id: 'p1', serial_tracking_mode: 'REQUIRED' }]
            : [],
      }),
      't1',
      'owner',
      {
        countId: 'c1',
        lines: [{ productId: 'p1', locationId: 'loc-1', countedQty: 2 }],
      },
    );
    expect(res).toMatchObject({ status: 422, body: { code: 'SERIAL_MANIFEST_REQUIRED' } });
  });

  it('persiste manifest e identidades observadas en el batch del conteo', async () => {
    const sqls: string[] = [];
    const res = await runSubmitCountReviewHttp(
      mockDbEnv({
        sqls,
        first: (sql) => {
          if (sql.includes('FROM inventory_counts')) {
            return { status: 'COUNTING', branch_id: 'b1' };
          }
          if (sql.includes('COALESCE(s.quantity_microunits')) {
            return {
              quantity_microunits: 2_000_000,
              pmp_unit_cost_cents: 100,
              location_id: 'loc-1',
              serial_tracking_mode: 'REQUIRED',
            };
          }
          return null;
        },
        all: (sql) => {
          if (sql.includes('SELECT id, serial_tracking_mode FROM products')) {
            return [{ id: 'p1', serial_tracking_mode: 'REQUIRED' }];
          }
          if (sql.includes('FROM serial_numbers')) {
            return ['serial-1', 'serial-2'].map((id) => ({
              id,
              product_id: 'p1',
              branch_id: 'b1',
              location_id: 'loc-1',
              status: 'AVAILABLE',
              version: 1,
            }));
          }
          return [];
        },
      }),
      't1',
      'owner',
      {
        countId: 'c1',
        lines: [
          {
            productId: 'p1',
            locationId: 'loc-1',
            countedQty: 2,
            observedSerialIds: ['serial-1', 'serial-2'],
          },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('INSERT INTO serial_manifests'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('INSERT INTO serial_manifest_items'))).toBe(true);
  });
});

describe('approve count', () => {
  it('countId required', async () => {
    const res = await runApproveCountHttp(mockDbEnv(), 't1', 'u1', 'owner', {});
    expect(res.status).toBe(400);
  });

  it('not found', async () => {
    const res = await runApproveCountHttp(mockDbEnv({ first: () => null }), 't1', 'u1', 'owner', {
      countId: 'c1',
    });
    expect(res.status).toBe(404);
  });

  it('S18-H3: rechaza aprobación con diferencia SIN motivo (422 REASON_REQUIRED)', async () => {
    const res = await runApproveCountHttp(
      mockDbEnv({
        first: (sql) => {
          if (sql.includes('FROM users')) return { role: 'admin' };
          return {
            status: 'DIFFERENCE_REVIEW',
            difference_threshold_cents: 100,
            branch_id: 'b1',
          };
        },
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', authorizedByUserId: 'mgr1', adjustmentReason: '' },
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('REASON_REQUIRED');
  });

  it('S18-H3: acepta aprobación con motivo', async () => {
    const sqls: string[] = [];
    const res = await runApproveCountHttp(
      mockDbEnv({
        sqls,
        first: (sql) => {
          if (sql.includes('FROM users')) return { role: 'owner' };
          return {
            status: 'DIFFERENCE_REVIEW',
            difference_threshold_cents: 100,
            branch_id: 'b1',
          };
        },
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', authorizedByUserId: 'mgr1', adjustmentReason: 'Conteo físico' },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(sqls.some((sql) => sql.includes('adjustment_reason'))).toBe(true);
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
      'owner',
      { countId: 'c1', adjustmentReason: 'Conteo físico' },
    );
    expect(res.status).toBe(403);
  });

  it('S18-H3: rechaza aprobación si el autorizador NO es admin/owner (403 FORBIDDEN_ROLE)', async () => {
    const res = await runApproveCountHttp(
      mockDbEnv({
        first: (sql) => {
          if (sql.includes('FROM users')) return { role: 'cashier' };
          return {
            status: 'DIFFERENCE_REVIEW',
            difference_threshold_cents: 100,
            branch_id: 'b1',
          };
        },
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', authorizedByUserId: 'cash1' },
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('S18-H3: acepta autorizador admin/owner', async () => {
    const sqls: string[] = [];
    const res = await runApproveCountHttp(
      mockDbEnv({
        sqls,
        first: (sql) => {
          if (sql.includes('FROM users')) return { role: 'admin' };
          return {
            status: 'DIFFERENCE_REVIEW',
            difference_threshold_cents: 100,
            branch_id: 'b1',
          };
        },
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', authorizedByUserId: 'mgr1', adjustmentReason: 'Conteo físico' },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(sqls.some((sql) => sql.includes('inventory_location_stock'))).toBe(true);
  });

  it('aprueba con authz y genera AJUSTE', async () => {
    const sqls: string[] = [];
    const res = await runApproveCountHttp(
      mockDbEnv({
        sqls,
        first: (sql) => {
          if (sql.includes('FROM users')) return { role: 'owner' };
          return {
            status: 'DIFFERENCE_REVIEW',
            difference_threshold_cents: 100,
            branch_id: 'b1',
          };
        },
        all: () => [{ product_id: 'p1', difference_qty: -5, unit_cost_cents: 100 }],
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', authorizedByUserId: 'mgr1', adjustmentReason: 'Conteo físico' },
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(sqls.some((sql) => sql.includes('inventory_location_stock'))).toBe(true);
  });

  it('rechaza diff serial que no coincide con identidades actuales', async () => {
    const res = await runApproveCountHttp(
      mockDbEnv({
        first: () => ({
          status: 'DIFFERENCE_REVIEW',
          difference_threshold_cents: 1000,
          branch_id: 'b1',
        }),
        all: (sql) => {
          if (sql.includes('FROM inventory_count_lines')) {
            return [
              {
                id: 'line-1',
                product_id: 'p1',
                location_id: 'loc-1',
                difference_qty: 0,
                difference_qty_microunits: 0,
                unit_cost_cents: 100,
                serial_tracking_mode: 'REQUIRED',
              },
            ];
          }
          if (sql.includes('serial_manifest_items')) return [{ id: 'serial-1' }];
          if (sql.includes('FROM serial_numbers')) {
            return [
              { id: 'serial-1', version: 1 },
              { id: 'serial-2', version: 1 },
            ];
          }
          return [];
        },
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1' },
    );
    expect(res).toMatchObject({ status: 422, body: { code: 'SERIAL_COUNT_DIFF_MISMATCH' } });
  });

  it('aprueba faltantes seriales como LOST sin duplicar el ajuste agregado', async () => {
    const sqls: string[] = [];
    const binds: unknown[][] = [];
    const res = await runApproveCountHttp(
      mockDbEnv({
        sqls,
        binds,
        first: () => ({
          status: 'DIFFERENCE_REVIEW',
          difference_threshold_cents: 1000,
          branch_id: 'b1',
        }),
        all: (sql) => {
          if (sql.includes('FROM inventory_count_lines')) {
            return [
              {
                id: 'line-1',
                product_id: 'p1',
                location_id: 'loc-1',
                difference_qty: -1,
                difference_qty_microunits: -1_000_000,
                unit_cost_cents: 100,
                serial_tracking_mode: 'REQUIRED',
              },
            ];
          }
          if (sql.includes('serial_manifest_items')) return [{ id: 'serial-1' }];
          if (sql.includes('FROM serial_numbers')) {
            return [
              {
                id: 'serial-1',
                product_id: 'p1',
                branch_id: 'b1',
                location_id: 'loc-1',
                status: 'AVAILABLE',
                version: 1,
              },
              {
                id: 'serial-2',
                product_id: 'p1',
                branch_id: 'b1',
                location_id: 'loc-1',
                status: 'AVAILABLE',
                version: 1,
              },
            ];
          }
          return [];
        },
      }),
      't1',
      'u1',
      'owner',
      { countId: 'c1', adjustmentReason: 'Serial perdido en conteo' },
    );
    expect(res.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('UPDATE serial_numbers'))).toBe(true);
    expect(binds.flat()).toContain('LOST');
    expect(sqls.filter((sql) => sql.includes('UPDATE branch_product_stock'))).toHaveLength(1);
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

  it('create exige seriales y persiste location+manifest para REQUIRED', async () => {
    const missing = await runCreateStockLossHttp(
      mockDbEnv({
        first: (sql) =>
          sql.includes('SELECT serial_tracking_mode') ? { serial_tracking_mode: 'REQUIRED' } : null,
        all: (sql) =>
          sql.includes('SELECT id, serial_tracking_mode FROM products')
            ? [{ id: 'p1', serial_tracking_mode: 'REQUIRED' }]
            : [],
      }),
      't1',
      'u1',
      {
        branchId: 'b1',
        productId: 'p1',
        locationId: 'loc-1',
        quantity: 1,
        category: 'DAMAGED',
        reason: 'roto',
      },
    );
    expect(missing).toMatchObject({ status: 422, body: { code: 'SERIAL_MANIFEST_REQUIRED' } });

    const sqls: string[] = [];
    const created = await runCreateStockLossHttp(
      mockDbEnv({
        sqls,
        first: (sql) => {
          if (sql.includes('SELECT serial_tracking_mode')) {
            return { serial_tracking_mode: 'REQUIRED' };
          }
          return null;
        },
        all: (sql) => {
          if (sql.includes('SELECT id, serial_tracking_mode FROM products')) {
            return [{ id: 'p1', serial_tracking_mode: 'REQUIRED' }];
          }
          if (sql.includes('FROM serial_numbers')) {
            return [
              {
                id: 'serial-1',
                product_id: 'p1',
                branch_id: 'b1',
                location_id: 'loc-1',
                status: 'AVAILABLE',
                version: 1,
              },
            ];
          }
          return [];
        },
      }),
      't1',
      'u1',
      {
        branchId: 'b1',
        productId: 'p1',
        locationId: 'loc-1',
        quantity: 1,
        category: 'DAMAGED',
        reason: 'roto',
        serialIds: ['serial-1'],
      },
    );
    expect(created.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('INSERT INTO serial_manifests'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('location_id'))).toBe(true);
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
      'owner',
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
      'owner',
      { lossId: 'l1' },
    );
    expect(res.status).toBe(200);
    expect(res.body.adjustmentQty).toBe(-2);
  });

  it('approve loss transiciona identidades en el mismo plan sin segundo débito', async () => {
    const sqls: string[] = [];
    const binds: unknown[][] = [];
    const res = await runApproveStockLossHttp(
      mockDbEnv({
        sqls,
        binds,
        first: (sql) => {
          if (sql.includes('FROM stock_losses')) {
            return {
              status: 'PENDING',
              quantity: 1,
              quantity_microunits: 1_000_000,
              category: 'DAMAGED',
              evidence_r2_key: 'r2/e',
              reason: 'roto',
              branch_id: 'b1',
              location_id: 'loc-1',
              product_id: 'p1',
              batch_id: null,
            };
          }
          if (sql.includes('SELECT serial_tracking_mode')) {
            return { serial_tracking_mode: 'REQUIRED' };
          }
          if (sql.includes('FROM serial_numbers')) {
            return {
              id: 'serial-1',
              product_id: 'p1',
              branch_id: 'b1',
              location_id: 'loc-1',
              status: 'AVAILABLE',
              version: 1,
            };
          }
          return null;
        },
        all: (sql) => {
          if (sql.includes('serial_manifest_items')) return [{ id: 'serial-1' }];
          if (sql.includes('SELECT id, serial_tracking_mode FROM products')) {
            return [{ id: 'p1', serial_tracking_mode: 'REQUIRED' }];
          }
          if (sql.includes('FROM serial_numbers')) {
            return [
              {
                id: 'serial-1',
                product_id: 'p1',
                branch_id: 'b1',
                location_id: 'loc-1',
                status: 'AVAILABLE',
                version: 1,
              },
            ];
          }
          return [];
        },
      }),
      't1',
      'u1',
      'owner',
      { lossId: 'l1' },
    );
    expect(res.status).toBe(200);
    expect(sqls.some((sql) => sql.includes('UPDATE serial_numbers'))).toBe(true);
    expect(binds.flat()).toContain('DAMAGED');
    expect(sqls.filter((sql) => sql.includes('UPDATE branch_product_stock'))).toHaveLength(1);
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
    const res = await runApproveStockLossHttp(mockDbEnv(), 't1', 'u1', 'owner', {});
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

describe('S39-H1: authz de conteos y mermas', () => {
  it('submit-review con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runSubmitCountReviewHttp(mockDbEnv(), 't1', 'cashier', { countId: 'c1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('approve count con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runApproveCountHttp(mockDbEnv(), 't1', 'u1', 'cashier', { countId: 'c1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('approve loss con cashier → 403 FORBIDDEN_ROLE', async () => {
    const res = await runApproveStockLossHttp(mockDbEnv(), 't1', 'u1', 'cashier', { lossId: 'l1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('create count: el umbral es SERVER-side (política), nunca el del body', async () => {
    const binds: unknown[][] = [];
    const res = await runCreateInventoryCountHttp(mockDbEnv({ binds }), 't1', 'u1', {
      branchId: 'b1',
      differenceThresholdCents: 999_999_999,
    });
    expect(res.status).toBe(200);
    // El INSERT usa el umbral de la política (2000), no el del cliente.
    const insertBind = binds.find((b) => b.length >= 5 && b[4] === 2000);
    expect(insertBind).toBeDefined();
  });
});
