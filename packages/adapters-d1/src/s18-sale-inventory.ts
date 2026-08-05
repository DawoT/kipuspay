/**
 * Sprint 18 helpers — FEFO / BOM / price lists / PMP (puro + queries D1).
 */
import {
  allocateFefo,
  explodeBom,
  resolveUnitPriceCents,
  type BomComponent,
  type FefoAllocation,
  type StockBatch,
} from '@kipuspay/domain-inventory';
import type { D1DatabaseLike } from './index.js';

export interface S18SaleCaps {
  readonly inventoryBatches: boolean;
  readonly inventoryBom: boolean;
  readonly pricingLists: boolean;
}

export async function resolveServerUnitPriceCents(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  customerId: string | null,
  productId: string,
  defaultPriceCents: number,
  enabled: boolean,
): Promise<number> {
  if (!enabled) return defaultPriceCents;

  let branchPrice: number | null = null;
  let customerPrice: number | null = null;

  const branch = await db
    .prepare(`SELECT price_list_id FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(branchId, tenantId)
    .first<{ price_list_id: string | null }>();
  if (branch?.price_list_id) {
    const row = await db
      .prepare(
        `SELECT price_cents FROM product_prices
         WHERE tenant_id = ? AND price_list_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, branch.price_list_id, productId)
      .first<{ price_cents: number }>();
    if (row) branchPrice = row.price_cents;
  }

  if (customerId) {
    const cust = await db
      .prepare(`SELECT price_list_id FROM customers WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(customerId, tenantId)
      .first<{ price_list_id: string | null }>();
    if (cust?.price_list_id) {
      const row = await db
        .prepare(
          `SELECT price_cents FROM product_prices
           WHERE tenant_id = ? AND price_list_id = ? AND product_id = ? LIMIT 1`,
        )
        .bind(tenantId, cust.price_list_id, productId)
        .first<{ price_cents: number }>();
      if (row) customerPrice = row.price_cents;
    }
  }

  if (branchPrice === null && customerPrice === null) {
    const def = await db
      .prepare(
        `SELECT pp.price_cents FROM price_lists pl
         INNER JOIN product_prices pp ON pp.price_list_id = pl.id AND pp.tenant_id = pl.tenant_id
         WHERE pl.tenant_id = ? AND pl.is_default = 1 AND pl.is_active = 1
           AND pl.deleted_at IS NULL AND pp.product_id = ?
         LIMIT 1`,
      )
      .bind(tenantId, productId)
      .first<{ price_cents: number }>();
    if (def) {
      return resolveUnitPriceCents({
        branchPriceCents: null,
        customerPriceCents: null,
        defaultPriceCents: def.price_cents,
      }).unitPriceCents;
    }
  }

  return resolveUnitPriceCents({
    branchPriceCents: branchPrice,
    customerPriceCents: customerPrice,
    defaultPriceCents,
  }).unitPriceCents;
}

export async function loadBatchesForProduct(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  productId: string,
): Promise<StockBatch[]> {
  const rows = await db
    .prepare(
      `SELECT id, product_id, stock, expiration_date
       FROM inventory_batches
       WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
         AND is_active = 1 AND deleted_at IS NULL AND stock > 0`,
    )
    .bind(tenantId, branchId, productId)
    .all<{
      id: string;
      product_id: string;
      stock: number;
      expiration_date: string | null;
    }>();
  return (rows.results ?? []).map((r) => ({
    batchId: r.id,
    productId: r.product_id,
    qty: r.stock,
    expiresAtUtc: r.expiration_date
      ? `${r.expiration_date}T00:00:00.000Z`
      : '9999-12-31T00:00:00.000Z',
  }));
}

export async function loadBomComponents(
  db: D1DatabaseLike,
  tenantId: string,
  kitProductId: string,
): Promise<BomComponent[]> {
  const rows = await db
    .prepare(
      `SELECT child_product_id, quantity FROM product_recipes
       WHERE tenant_id = ? AND parent_product_id = ? AND deleted_at IS NULL`,
    )
    .bind(tenantId, kitProductId)
    .all<{ child_product_id: string; quantity: number }>();
  return (rows.results ?? []).map((r) => ({
    componentProductId: r.child_product_id,
    qtyPerKit: r.quantity,
  }));
}

export function planFefoForQty(
  batches: readonly StockBatch[],
  productId: string,
  qty: number,
  nowIsoUtc: string,
): FefoAllocation[] {
  return allocateFefo(batches, productId, qty, nowIsoUtc);
}

export function planBomExplosion(components: readonly BomComponent[], kitQty: number) {
  return explodeBom(components, kitQty);
}
