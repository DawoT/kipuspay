import { describe, expect, it, vi } from 'vitest';
import {
  isPurchasingThreeWayEnabled,
  runMatchSupplierInvoiceHttp,
  runOwnerThreeWayReportHttp,
} from './purchasing-three-way-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

describe('purchasing-three-way-routes', () => {
  it('flag off → FEATURE_OFF', async () => {
    expect(isPurchasingThreeWayEnabled({ FEATURE_PURCHASING_THREE_WAY: '0' } as WorkerEnv)).toBe(
      false,
    );
    const res = await runMatchSupplierInvoiceHttp(
      { FEATURE_PURCHASING_THREE_WAY: '0' } as WorkerEnv,
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        invoiceNumber: 'F1',
        totalCents: 100,
        lines: [{ productId: 'p1', invoicedQty: 1, invoiceUnitCostCents: 100 }],
      },
    );
    expect(res).toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('flag on sin DB → 503', async () => {
    const res = await runMatchSupplierInvoiceHttp(
      { FEATURE_PURCHASING_THREE_WAY: '1' } as WorkerEnv,
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        invoiceNumber: 'F1',
        totalCents: 100,
        lines: [{ productId: 'p1', invoicedQty: 1, invoiceUnitCostCents: 100 }],
      },
    );
    expect(res.status).toBe(503);
  });

  it('body incompleto → 400', async () => {
    const res = await runMatchSupplierInvoiceHttp(
      { FEATURE_PURCHASING_THREE_WAY: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      'u1',
      {},
    );
    expect(res.status).toBe(400);
  });

  it('owner report flag on → 200 listas', async () => {
    const all = vi.fn<() => Promise<{ results: unknown[] }>>().mockResolvedValue({ results: [] });
    const env = {
      FEATURE_PURCHASING_THREE_WAY: '1',
      DB: {
        prepare: () => ({
          bind: () => ({ all }),
        }),
      },
    } as unknown as WorkerEnv;
    const res = await runOwnerThreeWayReportHttp(env, 't1', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openPurchaseOrders');
    expect(res.body).toHaveProperty('uninvoicedReceipts');
  });

  it('owner report sin tenant → 401', async () => {
    const res = await runOwnerThreeWayReportHttp(
      { FEATURE_PURCHASING_THREE_WAY: '1', DB: {} as D1Database } as WorkerEnv,
      '',
      'owner',
    );
    expect(res.status).toBe(401);
  });

  it('S29-H2: reporte Dueño con rol cashier → 403 FORBIDDEN_ROLE', async () => {
    const all = vi.fn<() => Promise<{ results: unknown[] }>>().mockResolvedValue({ results: [] });
    const env = {
      FEATURE_PURCHASING_THREE_WAY: '1',
      DB: {
        prepare: () => ({
          bind: () => ({ all }),
        }),
      },
    } as unknown as WorkerEnv;
    const res = await runOwnerThreeWayReportHttp(env, 't1', 'cashier');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('owner report excluye OCs con factura CLOSED', async () => {
    const sqls: string[] = [];
    const env = {
      FEATURE_PURCHASING_THREE_WAY: '1',
      DB: {
        prepare: (sql?: string) => ({
          bind: () => ({
            all: vi
              .fn()
              .mockResolvedValue({ results: [] })
              .mockImplementation(() => {
                sqls.push(sql ?? '');
                return Promise.resolve({ results: [] });
              }),
          }),
        }),
      },
    } as unknown as WorkerEnv;
    await runOwnerThreeWayReportHttp(env, 't1', 'owner');
    const openPoSql = sqls[0];
    expect(openPoSql).toContain("si.status = 'CLOSED'");
    expect(openPoSql).toContain('NOT EXISTS');
  });

  it('match sobre PO no recibido → 400 PO_NOT_RECEIVED', async () => {
    const all = vi.fn<() => Promise<{ results: unknown[] }>>().mockResolvedValue({ results: [] });
    const first = vi.fn().mockResolvedValue({ id: 'po1', status: 'SENT', supplier_id: 's1' });
    const env = {
      FEATURE_PURCHASING_THREE_WAY: '1',
      DB: {
        prepare: () => ({
          bind: () => ({ first, all }),
        }),
      },
    } as unknown as WorkerEnv;
    const res = await runMatchSupplierInvoiceHttp(env, 't1', 'u1', {
      purchaseOrderId: 'po1',
      invoiceNumber: 'F1',
      totalCents: 100,
      lines: [{ productId: 'p1', invoicedQty: 1, invoiceUnitCostCents: 100 }],
    });
    expect(res).toMatchObject({ status: 400, body: { code: 'PO_NOT_RECEIVED' } });
  });

  it('match sin user → 401', async () => {
    const res = await runMatchSupplierInvoiceHttp(
      { FEATURE_PURCHASING_THREE_WAY: '1', DB: {} as D1Database } as WorkerEnv,
      't1',
      '',
      {
        purchaseOrderId: 'po1',
        invoiceNumber: 'F1',
        totalCents: 100,
        lines: [{ productId: 'p1', invoicedQty: 1, invoiceUnitCostCents: 100 }],
      },
    );
    expect(res.status).toBe(401);
  });
});
