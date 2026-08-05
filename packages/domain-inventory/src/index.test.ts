import { describe, expect, it } from 'vitest';
import {
  allocateFefo,
  assertCountDiffAuthorized,
  assertCountMutable,
  assertInventoryCountTransition,
  assertStockLossReject,
  assertTransferLineConservation,
  assertTransferTransition,
  evaluateStockAlerts,
  explodeBom,
  ExpiredBatchError,
  firstExpiringAtUtc,
  planApproveStockLoss,
  refreshAvgCostCents,
  resolveUnitPriceCents,
  suggestReorderQty,
  sumQty,
} from './index.js';

describe('sumQty / firstExpiring', () => {
  const batches = [
    { batchId: 'b1', productId: 'p1', qty: 2, expiresAtUtc: '2026-09-01T00:00:00Z' },
    { batchId: 'b2', productId: 'p1', qty: 3, expiresAtUtc: '2026-08-01T00:00:00Z' },
  ];
  it('suma y FEFO earliest', () => {
    expect(sumQty(batches)).toBe(5);
    expect(firstExpiringAtUtc(batches)).toBe('2026-08-01T00:00:00Z');
    expect(firstExpiringAtUtc([])).toBeNull();
  });
});

describe('allocateFefo', () => {
  it('asigna por vencimiento ASC y bloquea vencidos', () => {
    const batches = [
      { batchId: 'old', productId: 'p1', qty: 5, expiresAtUtc: '2026-07-01T00:00:00Z' },
      { batchId: 'new', productId: 'p1', qty: 5, expiresAtUtc: '2026-12-01T00:00:00Z' },
    ];
    expect(() => allocateFefo(batches, 'p1', 2, '2026-08-05T00:00:00Z')).toThrow(ExpiredBatchError);
    const ok = allocateFefo(
      [{ batchId: 'a', productId: 'p1', qty: 3, expiresAtUtc: '2026-09-01T00:00:00Z' }],
      'p1',
      2,
      '2026-08-05T00:00:00Z',
    );
    expect(ok).toEqual([{ batchId: 'a', qty: 2 }]);
  });
});

describe('explodeBom', () => {
  it('explota kit a componentes', () => {
    expect(
      explodeBom(
        [
          { componentProductId: 'c1', qtyPerKit: 2 },
          { componentProductId: 'c2', qtyPerKit: 1 },
        ],
        3,
      ),
    ).toEqual([
      { componentProductId: 'c1', qty: 6 },
      { componentProductId: 'c2', qty: 3 },
    ]);
  });
});

describe('refreshAvgCostCents', () => {
  it('recomputa PMP en cents enteros', () => {
    // (10*100 + 10*200) / 20 = 150
    expect(
      refreshAvgCostCents({
        previousStock: 10,
        previousPmpCents: 100,
        inboundQty: 10,
        inboundUnitCostCents: 200,
      }),
    ).toBe(150);
    // newStock <= 0 path: previous negative cancelled by inbound framing → uses inbound
    expect(
      refreshAvgCostCents({
        previousStock: 0,
        previousPmpCents: 100,
        inboundQty: 5,
        inboundUnitCostCents: 250,
      }),
    ).toBe(250);
  });
});

describe('resolveUnitPriceCents', () => {
  it('prioriza sucursal → cliente → default', () => {
    expect(
      resolveUnitPriceCents({
        branchPriceCents: 900,
        customerPriceCents: 800,
        defaultPriceCents: 1000,
      }).source,
    ).toBe('branch');
    expect(
      resolveUnitPriceCents({
        branchPriceCents: null,
        customerPriceCents: 800,
        defaultPriceCents: 1000,
      }).unitPriceCents,
    ).toBe(800);
    expect(
      resolveUnitPriceCents({
        branchPriceCents: null,
        customerPriceCents: null,
        defaultPriceCents: 1000,
      }).unitPriceCents,
    ).toBe(1000);
  });
});

describe('evaluateStockAlerts', () => {
  it('emite stockout y expiry', () => {
    const alerts = evaluateStockAlerts({
      productId: 'p1',
      stock: 0,
      minStock: 2,
      reorderPoint: 5,
      earliestExpiryUtc: '2026-08-10T00:00:00Z',
      nowIsoUtc: '2026-08-05T00:00:00Z',
      expiryWarnDays: 14,
    });
    expect(alerts.some((a) => a.kind === 'STOCKOUT')).toBe(true);
    expect(alerts.some((a) => a.kind === 'EXPIRING')).toBe(true);
  });

  it('ignora expiry inválida y permite shrink>0 sin throw', () => {
    const alerts = evaluateStockAlerts({
      productId: 'p9',
      stock: 10,
      minStock: 1,
      reorderPoint: 1,
      earliestExpiryUtc: 'not-a-date',
      nowIsoUtc: 'also-bad',
      expiryWarnDays: 7,
    });
    expect(alerts.filter((a) => a.kind === 'EXPIRING')).toHaveLength(0);
    expect(() =>
      assertTransferLineConservation({ qtySent: 1, qtyReceived: 0, qtyShrink: 1 }),
    ).not.toThrow();
  });
});

describe('stock transfers', () => {
  it('conserva qty y valida transiciones', () => {
    expect(() =>
      assertTransferLineConservation({ qtySent: 10, qtyReceived: 8, qtyShrink: 2 }),
    ).not.toThrow();
    expect(() =>
      assertTransferLineConservation({ qtySent: 10, qtyReceived: 8, qtyShrink: 1 }),
    ).toThrow('TRANSFER_QTY_MISMATCH');
    assertTransferTransition('DRAFT', 'IN_TRANSIT');
    expect(() => assertTransferTransition('RECEIVED', 'DRAFT')).toThrow(/TRANSFER_INVALID/);
  });
});

describe('edge coverage inventory', () => {
  it('FEFO insuficiente / BOM vacío / PMP inválido / precios / reorder', () => {
    expect(() =>
      allocateFefo(
        [{ batchId: 'a', productId: 'p1', qty: 1, expiresAtUtc: '2026-09-01T00:00:00Z' }],
        'p1',
        5,
        '2026-08-05T00:00:00Z',
      ),
    ).toThrow(/INSUFFICIENT_BATCH_STOCK/);
    expect(() => allocateFefo([], 'p1', 0, '2026-08-05T00:00:00Z')).toThrow('INVALID_QTY');
    expect(() => explodeBom([], 1)).toThrow('BOM_EMPTY');
    expect(() => explodeBom([{ componentProductId: 'c', qtyPerKit: 0 }], 1)).toThrow(
      'INVALID_BOM_COMPONENT',
    );
    expect(() => explodeBom([{ componentProductId: 'c', qtyPerKit: 1 }], 0)).toThrow(
      'INVALID_KIT_QTY',
    );
    expect(() =>
      refreshAvgCostCents({
        previousStock: 1,
        previousPmpCents: 1.5,
        inboundQty: 1,
        inboundUnitCostCents: 100,
      }),
    ).toThrow('INVALID_PMP');
    expect(() =>
      refreshAvgCostCents({
        previousStock: 1,
        previousPmpCents: 100,
        inboundQty: 1,
        inboundUnitCostCents: -1,
      }),
    ).toThrow('INVALID_UNIT_COST');
    expect(() =>
      refreshAvgCostCents({
        previousStock: 1,
        previousPmpCents: 100,
        inboundQty: 0,
        inboundUnitCostCents: 100,
      }),
    ).toThrow('INVALID_INBOUND_QTY');
    expect(
      refreshAvgCostCents({
        previousStock: -5,
        previousPmpCents: 100,
        inboundQty: 2,
        inboundUnitCostCents: 200,
      }),
    ).toBe(200);
    expect(() =>
      resolveUnitPriceCents({
        branchPriceCents: null,
        customerPriceCents: null,
        defaultPriceCents: -1,
      }),
    ).toThrow('INVALID_DEFAULT_PRICE');
    expect(() =>
      resolveUnitPriceCents({
        branchPriceCents: -1,
        customerPriceCents: null,
        defaultPriceCents: 100,
      }),
    ).toThrow('INVALID_BRANCH_PRICE');
    expect(() =>
      resolveUnitPriceCents({
        branchPriceCents: null,
        customerPriceCents: -1,
        defaultPriceCents: 100,
      }),
    ).toThrow('INVALID_CUSTOMER_PRICE');
    const reorder = evaluateStockAlerts({
      productId: 'p2',
      stock: 3,
      minStock: 2,
      reorderPoint: 5,
      earliestExpiryUtc: null,
      nowIsoUtc: '2026-08-05T00:00:00Z',
      expiryWarnDays: 7,
    });
    expect(reorder.some((a) => a.kind === 'REORDER')).toBe(true);
    const minOnly = evaluateStockAlerts({
      productId: 'p3',
      stock: 2,
      minStock: 2,
      reorderPoint: 1,
      earliestExpiryUtc: null,
      nowIsoUtc: '2026-08-05T00:00:00Z',
      expiryWarnDays: 7,
    });
    expect(minOnly.some((a) => a.kind === 'REORDER')).toBe(true);
  });
});

describe('inventory counts', () => {
  it('transiciones y aprobado inmutable', () => {
    assertInventoryCountTransition('COUNTING', 'DIFFERENCE_REVIEW');
    assertInventoryCountTransition('DIFFERENCE_REVIEW', 'APPROVED');
    expect(() => assertInventoryCountTransition('APPROVED', 'COUNTING')).toThrow(/COUNT_INVALID/);
    expect(() => assertCountMutable('APPROVED')).toThrow('COUNT_LOCKED');
    expect(() => assertCountMutable('CANCELLED')).toThrow('COUNT_CANCELLED');
    assertCountMutable('COUNTING');
  });

  it('exige authz si |diff| valorizado > umbral', () => {
    expect(() =>
      assertCountDiffAuthorized({
        lines: [{ productId: 'p1', differenceQty: -3, unitCostCents: 1000 }],
        differenceThresholdCents: 1000,
        authorizedByUserId: null,
      }),
    ).toThrow('AUTH_TOKEN_REQUIRED');
    expect(() =>
      assertCountDiffAuthorized({
        lines: [{ productId: 'p1', differenceQty: -3, unitCostCents: 1000 }],
        differenceThresholdCents: 1000,
        authorizedByUserId: 'supervisor',
      }),
    ).not.toThrow();
  });
});

describe('stock losses', () => {
  it('aprueba con evidencia y plan AJUSTE negativo', () => {
    const plan = planApproveStockLoss({
      status: 'PENDING',
      quantity: 2,
      category: 'DAMAGED',
      evidenceR2Key: 'r2/merma/1.jpg',
      reason: 'roto',
      approvedByUserId: 'u1',
    });
    expect(plan.adjustmentQty).toBe(-2);
    expect(plan.movementType).toBe('AJUSTE');
    expect(() =>
      planApproveStockLoss({
        status: 'PENDING',
        quantity: 1,
        category: 'DAMAGED',
        evidenceR2Key: null,
        reason: 'x',
        approvedByUserId: 'u',
      }),
    ).toThrow('LOSS_EVIDENCE_REQUIRED');
    expect(() =>
      planApproveStockLoss({
        status: 'APPROVED',
        quantity: 1,
        category: 'DAMAGED',
        evidenceR2Key: 'k',
        reason: 'x',
        approvedByUserId: 'u',
      }),
    ).toThrow('LOSS_NOT_PENDING');
    expect(() =>
      planApproveStockLoss({
        status: 'PENDING',
        quantity: 0,
        category: 'DAMAGED',
        evidenceR2Key: 'k',
        reason: 'x',
        approvedByUserId: 'u',
      }),
    ).toThrow('INVALID_LOSS_QTY');
    expect(() =>
      planApproveStockLoss({
        status: 'PENDING',
        quantity: 1,
        category: 'DAMAGED',
        evidenceR2Key: 'k',
        reason: '  ',
        approvedByUserId: 'u',
      }),
    ).toThrow('LOSS_REASON_REQUIRED');
    expect(() =>
      planApproveStockLoss({
        status: 'PENDING',
        quantity: 1,
        category: 'DAMAGED',
        evidenceR2Key: 'k',
        reason: 'ok',
        approvedByUserId: null,
      }),
    ).toThrow('LOSS_APPROVER_REQUIRED');
    expect(() => assertStockLossReject('APPROVED')).toThrow('LOSS_NOT_PENDING');
    assertStockLossReject('PENDING');
  });

  it('sugiere OC en reorder point', () => {
    expect(suggestReorderQty({ stock: 2, reorderPoint: 5, reorderQty: 20 })).toBe(20);
    expect(suggestReorderQty({ stock: 10, reorderPoint: 5, reorderQty: 20 })).toBe(0);
    expect(suggestReorderQty({ stock: 1, reorderPoint: 5, reorderQty: 0 })).toBe(0);
  });

  it('count authz bajo umbral y threshold inválido', () => {
    expect(() =>
      assertCountDiffAuthorized({
        lines: [{ productId: 'p1', differenceQty: 1, unitCostCents: 100 }],
        differenceThresholdCents: 500,
        authorizedByUserId: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertCountDiffAuthorized({
        lines: [{ productId: 'p1', differenceQty: 1, unitCostCents: 100 }],
        differenceThresholdCents: -1,
        authorizedByUserId: null,
      }),
    ).toThrow('INVALID_COUNT_THRESHOLD');
    expect(() =>
      assertCountDiffAuthorized({
        lines: [{ productId: 'p1', differenceQty: 1, unitCostCents: -1 }],
        differenceThresholdCents: 100,
        authorizedByUserId: null,
      }),
    ).toThrow('INVALID_UNIT_COST');
  });
});
