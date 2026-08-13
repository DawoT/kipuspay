import { describe, expect, it } from 'vitest';
import { processSupplierInvoiceMatchAtomic } from './process-supplier-invoice-match-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

type Row = Record<string, unknown>;

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(state: {
  po?: Row | null;
  items?: Row[];
  stock?: Row | null;
  audit?: Row | null;
  invoicedByProduct?: Row[];
  lineInserts?: string[];
  approverRole?: string | null;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      if (sql.includes('INSERT INTO supplier_invoice_lines') && state.lineInserts) {
        state.lineInserts.push(sql);
      }
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM purchase_orders')) {
            return Promise.resolve((state.po ?? null) as T | null);
          }
          if (sql.includes('FROM users')) {
            return Promise.resolve(
              (state.approverRole ? { role: state.approverRole } : null) as T | null,
            );
          }
          if (sql.includes('FROM branch_product_stock')) {
            return Promise.resolve((state.stock ?? null) as T | null);
          }
          if (sql.includes('FROM audit_events')) {
            return Promise.resolve((state.audit ?? null) as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => {
          if (sql.includes('FROM purchase_order_items')) {
            return Promise.resolve(okResult((state.items ?? []) as T[]));
          }
          if (sql.includes('FROM supplier_invoice_lines')) {
            return Promise.resolve(okResult((state.invoicedByProduct ?? []) as T[]));
          }
          return Promise.resolve(okResult([] as T[]));
        },
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('supplier invoice match atomic', () => {
  it('match perfecto crea AP y factura CLOSED', async () => {
    const res = await processSupplierInvoiceMatchAtomic(
      mockDb({
        po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
        items: [
          {
            product_id: 'p1',
            quantity_ordered: 10,
            quantity_received: 10,
            unit_cost_cents: 100,
          },
        ],
        stock: { stock: 10, pmp_unit_cost_cents: 100 },
      }),
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        branchId: 'b1',
        invoiceNumber: 'F001-1',
        totalCents: 1000,
        igvCents: 152,
        lines: [{ productId: 'p1', invoicedQty: 10, invoiceUnitCostCents: 100 }],
      },
    );
    expect(res.apAmountCents).toBe(1000);
    expect(res.invoiceStatus).toBe('CLOSED');
    expect(res.requiresPriceDiffAudit).toBe(false);
  });

  it('precio distinto sin override → THREE_WAY_MISMATCH', async () => {
    await expect(
      processSupplierInvoiceMatchAtomic(
        mockDb({
          po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
          items: [
            {
              product_id: 'p1',
              quantity_ordered: 10,
              quantity_received: 10,
              unit_cost_cents: 100,
            },
          ],
        }),
        't1',
        'u1',
        {
          purchaseOrderId: 'po1',
          branchId: 'b1',
          invoiceNumber: 'F001-2',
          totalCents: 1200,
          igvCents: 0,
          lines: [{ productId: 'p1', invoicedQty: 10, invoiceUnitCostCents: 120 }],
        },
      ),
    ).rejects.toThrow('THREE_WAY_MISMATCH');
  });

  it('override precio → SUPPLIER_PRICE_DIFF', async () => {
    const res = await processSupplierInvoiceMatchAtomic(
      mockDb({
        po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
        items: [
          {
            product_id: 'p1',
            quantity_ordered: 10,
            quantity_received: 10,
            unit_cost_cents: 100,
          },
        ],
        stock: { stock: 10, pmp_unit_cost_cents: 100 },
        approverRole: 'admin',
      }),
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        branchId: 'b1',
        invoiceNumber: 'F001-3',
        totalCents: 1200,
        igvCents: 0,
        lines: [{ productId: 'p1', invoicedQty: 10, invoiceUnitCostCents: 120 }],
        priceDiffOverride: true,
        authorizedByUserId: 'sup-1',
        overrideReason: 'proveedor subió precio',
      },
    );
    expect(res.requiresPriceDiffAudit).toBe(true);
    expect(res.apAmountCents).toBe(1200);
  });

  it('S29-H1: override con autorizador sin rol admin/owner → FORBIDDEN_ROLE', async () => {
    await expect(
      processSupplierInvoiceMatchAtomic(
        mockDb({
          po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
          items: [
            {
              product_id: 'p1',
              quantity_ordered: 10,
              quantity_received: 10,
              unit_cost_cents: 100,
            },
          ],
          stock: { stock: 10, pmp_unit_cost_cents: 100 },
          approverRole: 'cashier',
        }),
        't1',
        'u1',
        {
          purchaseOrderId: 'po1',
          branchId: 'b1',
          invoiceNumber: 'F001-3',
          totalCents: 1200,
          igvCents: 0,
          lines: [{ productId: 'p1', invoicedQty: 10, invoiceUnitCostCents: 120 }],
          priceDiffOverride: true,
          authorizedByUserId: 'sup-1',
          overrideReason: 'proveedor subió precio',
        },
      ),
    ).rejects.toThrow('FORBIDDEN_ROLE');
  });

  it('ya facturado acumulado → segunda parcial excede recibido (THREE_WAY_QTY_MISMATCH)', async () => {
    await expect(
      processSupplierInvoiceMatchAtomic(
        mockDb({
          po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
          items: [
            {
              product_id: 'p1',
              quantity_ordered: 10,
              quantity_received: 10,
              unit_cost_cents: 100,
            },
          ],
          // Ya se facturaron 6 de los 10 recibidos (factura anterior PARTIAL).
          invoicedByProduct: [{ product_id: 'p1', qty: 6 }],
        }),
        't1',
        'u1',
        {
          purchaseOrderId: 'po1',
          branchId: 'b1',
          invoiceNumber: 'F001-2',
          totalCents: 500,
          igvCents: 0,
          lines: [{ productId: 'p1', invoicedQty: 5, invoiceUnitCostCents: 100 }],
        },
      ),
    ).rejects.toThrow('THREE_WAY_QTY_MISMATCH');
  });

  it('ya facturado parcial + nueva parcial exacta al remanente → PARTIAL', async () => {
    const lineInserts: string[] = [];
    const res = await processSupplierInvoiceMatchAtomic(
      mockDb({
        po: { id: 'po1', status: 'RECEIVED', supplier_id: 'sup1', branch_id: 'b1' },
        items: [
          {
            product_id: 'p1',
            quantity_ordered: 10,
            quantity_received: 10,
            unit_cost_cents: 100,
          },
        ],
        stock: { stock: 10, pmp_unit_cost_cents: 100 },
        invoicedByProduct: [{ product_id: 'p1', qty: 6 }],
        lineInserts,
      }),
      't1',
      'u1',
      {
        purchaseOrderId: 'po1',
        branchId: 'b1',
        invoiceNumber: 'F001-4',
        totalCents: 400,
        igvCents: 0,
        lines: [{ productId: 'p1', invoicedQty: 4, invoiceUnitCostCents: 100 }],
      },
    );
    expect(res.invoiceStatus).toBe('PARTIAL');
    expect(res.apAmountCents).toBe(400);
    expect(lineInserts).toHaveLength(1);
  });

  it('match sobre PO no recibido → PO_NOT_RECEIVED', async () => {
    await expect(
      processSupplierInvoiceMatchAtomic(
        mockDb({
          po: { id: 'po1', status: 'SENT', supplier_id: 'sup1', branch_id: 'b1' },
          items: [
            {
              product_id: 'p1',
              quantity_ordered: 10,
              quantity_received: 0,
              unit_cost_cents: 100,
            },
          ],
        }),
        't1',
        'u1',
        {
          purchaseOrderId: 'po1',
          branchId: 'b1',
          invoiceNumber: 'F001-5',
          totalCents: 1000,
          igvCents: 0,
          lines: [{ productId: 'p1', invoicedQty: 10, invoiceUnitCostCents: 100 }],
        },
      ),
    ).rejects.toThrow('PO_NOT_RECEIVED');
  });
});
