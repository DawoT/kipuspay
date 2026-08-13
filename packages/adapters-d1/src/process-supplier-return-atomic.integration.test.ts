import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  processSupplierReturnCancelAtomic,
  processSupplierReturnCloseAtomic,
  processSupplierReturnCreateAtomic,
} from './process-supplier-return-atomic.js';

async function seedSupplierReturnFixture(tenantId: string): Promise<{
  branchId: string;
  userId: string;
  productId: string;
  supplierId: string;
  receiptId: string;
  invoiceId: string;
  poId: string;
}> {
  const branchId = `b-${tenantId}`;
  const userId = `u-${tenantId}`;
  const productId = `p-${tenantId}`;
  const supplierId = `sup-${tenantId}`;
  const poId = `po-${tenantId}`;
  const receiptId = `rc-${tenantId}`;
  const invoiceId = `inv-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId, 'SupplierReturn SAC'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'cashier'), (?, ?, ?, ?, 'admin')`,
    ).bind(
      userId,
      tenantId,
      branchId,
      `${tenantId}@example.com`,
      `admin-${tenantId}`,
      tenantId,
      branchId,
      `admin-${tenantId}@example.com`,
    ),
    env.DB.prepare(
      `INSERT INTO suppliers (id, tenant_id, ruc, business_name)
       VALUES (?, ?, '20123456789', 'Proveedor SAC')`,
    ).bind(supplierId, tenantId),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, 'SK', 'Producto', 'physical', 'NIU', 1000, 400, 10, 0)`,
    ).bind(productId, tenantId),
    env.DB.prepare(
      `INSERT INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 10000000, 400)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, status, total_amount_cents, created_by_user_id)
       VALUES (?, ?, ?, ?, 'RECEIVED', 4000, ?)`,
    ).bind(poId, tenantId, branchId, supplierId, userId),
    env.DB.prepare(
      `INSERT INTO purchase_receipts (id, tenant_id, purchase_order_id, branch_id, received_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(receiptId, tenantId, poId, branchId, userId),
    env.DB.prepare(
      `INSERT INTO purchase_receipt_lines (id, tenant_id, receipt_id, product_id, quantity, quantity_microunits, unit_cost_cents)
       VALUES (?, ?, ?, ?, 10, 10000000, 400)`,
    ).bind(`rl-${tenantId}`, tenantId, receiptId, productId),
    env.DB.prepare(
      `INSERT INTO supplier_invoices (id, tenant_id, branch_id, supplier_id, purchase_order_id, invoice_number, status, total_cents, igv_cents)
       VALUES (?, ?, ?, ?, ?, 'F001-1', 'CLOSED', 4000, 0)`,
    ).bind(invoiceId, tenantId, branchId, supplierId, poId),
    env.DB.prepare(
      `INSERT INTO supplier_invoice_lines (id, tenant_id, invoice_id, product_id, invoiced_qty, invoiced_qty_microunits, unit_cost_cents)
       VALUES (?, ?, ?, ?, 10, 10000000, 400)`,
    ).bind(`sil-${tenantId}`, tenantId, invoiceId, productId),
    env.DB.prepare(
      `INSERT INTO accounts_payable (id, tenant_id, supplier_id, purchase_order_id, original_amount_cents, balance_due_cents, due_date, status)
       VALUES (?, ?, ?, ?, 4000, 4000, '2026-09-08', 'OPEN')`,
    ).bind(`ap-${tenantId}`, tenantId, supplierId, poId),
  ]);

  return { branchId, userId, productId, supplierId, receiptId, invoiceId, poId };
}

describe('S34-H3: supplier-return motor ACID (D1 real)', () => {
  it('CREATE → CLOSE revierte stock 1:1 y CxP; doble CLOSE aborta sin efecto', async () => {
    const tenantId = 't-s34-acid-1';
    const fx = await seedSupplierReturnFixture(tenantId);

    const created = await processSupplierReturnCreateAtomic(env.DB, tenantId, fx.userId, {
      branchId: fx.branchId,
      purchaseReceiptId: fx.receiptId,
      supplierInvoiceId: fx.invoiceId,
      reason: 'defecto',
      items: [{ productId: fx.productId, enteredQuantityMicrounits: 2000000 }],
    });
    expect(created.movesStock).toBe(false);
    const returnId = created.returnId;

    const closed = await processSupplierReturnCloseAtomic(env.DB, tenantId, fx.userId, {
      returnId,
    });
    expect(closed.status).toBe('CLOSED');

    // La devolución a proveedor SALE del inventario: stock 10 → 8.
    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fx.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(8);

    // CxP 4000 → 3200: la devolución es NC del proveedor, reduce la deuda.
    const ap = await env.DB.prepare(
      `SELECT balance_due_cents FROM accounts_payable WHERE tenant_id = ? AND purchase_order_id = ?`,
    )
      .bind(tenantId, fx.poId ?? '')
      .first<{ balance_due_cents: number }>();
    expect(ap?.balance_due_cents).toBe(3200);

    // S34-H2: CLOSE repetido es idempotente (alreadyClosed) sin doble efecto;
    // la carrera real la aborta el guardState del plan (CHECK ok=0 revierte).
    const again = await processSupplierReturnCloseAtomic(env.DB, tenantId, fx.userId, {
      returnId,
    });
    expect(again.alreadyClosed).toBe(true);
    const stockAfter = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fx.productId)
      .first<{ stock: number }>();
    expect(stockAfter?.stock).toBe(8);
  });

  it('CANCEL de un return OPEN procede; CANCEL de CLOSED rechazado', async () => {
    const tenantId = 't-s34-acid-2';
    const fx = await seedSupplierReturnFixture(tenantId);

    const created = await processSupplierReturnCreateAtomic(env.DB, tenantId, fx.userId, {
      branchId: fx.branchId,
      purchaseReceiptId: fx.receiptId,
      supplierInvoiceId: fx.invoiceId,
      reason: 'ya no aplica',
      items: [{ productId: fx.productId, enteredQuantityMicrounits: 1000000 }],
    });
    const returnId = created.returnId;

    const cancelled = await processSupplierReturnCancelAtomic(env.DB, tenantId, fx.userId, {
      returnId,
    });
    expect(cancelled.status).toBe('CANCELLED');

    await expect(
      processSupplierReturnCloseAtomic(env.DB, tenantId, fx.userId, { returnId }),
    ).rejects.toThrow('SUPPLIER_RETURN_INVALID_STATUS');
  });

  it('S34-H1: CLOSE con override y autorizador cashier → FORBIDDEN_ROLE', async () => {
    const tenantId = 't-s34-acid-3';
    const fx = await seedSupplierReturnFixture(tenantId);
    const created = await processSupplierReturnCreateAtomic(env.DB, tenantId, fx.userId, {
      branchId: fx.branchId,
      purchaseReceiptId: fx.receiptId,
      supplierInvoiceId: fx.invoiceId,
      reason: 'defecto',
      items: [{ productId: fx.productId, enteredQuantityMicrounits: 1000000 }],
    });
    await expect(
      processSupplierReturnCloseAtomic(env.DB, tenantId, fx.userId, {
        returnId: created.returnId,
        priceDiffOverride: true,
        authorizedByUserId: fx.userId, // cashier
      }),
    ).rejects.toThrow('FORBIDDEN_ROLE');
  });
});
