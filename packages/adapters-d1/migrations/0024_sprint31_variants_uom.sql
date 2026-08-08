-- Sprint 31 — catalog.variants + catalog.uom (ADR-0015 / DAT-12)
-- Cutover de cantidad: las columnas *_microunits son la fuente canónica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);

ALTER TABLE products ADD COLUMN parent_product_id TEXT;
ALTER TABLE products ADD COLUMN variant_price_override_cents INTEGER;
ALTER TABLE products ADD COLUMN is_sellable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN stock_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE products SET stock_microunits = CAST(ROUND(stock * 1000000) AS INTEGER);

CREATE INDEX IF NOT EXISTS idx_products_parent
    ON products(tenant_id, parent_product_id) WHERE parent_product_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS products_variant_parent_guard_insert
BEFORE INSERT ON products
WHEN NEW.parent_product_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.parent_product_id = NEW.id THEN RAISE(ABORT, 'VARIANT_SELF_PARENT')
    WHEN NOT EXISTS (
      SELECT 1 FROM products p
      WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.parent_product_id
    ) THEN RAISE(ABORT, 'VARIANT_PARENT_INVALID')
    WHEN EXISTS (
      SELECT 1 FROM products p
      WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.parent_product_id
        AND p.parent_product_id IS NOT NULL
    ) THEN RAISE(ABORT, 'VARIANT_NESTING_FORBIDDEN')
    WHEN EXISTS (
      SELECT 1 FROM products c
      WHERE c.tenant_id = NEW.tenant_id AND c.parent_product_id = NEW.id
    ) THEN RAISE(ABORT, 'VARIANT_NESTING_FORBIDDEN')
  END;
END;

CREATE TRIGGER IF NOT EXISTS products_variant_parent_guard_update
BEFORE UPDATE OF parent_product_id ON products
WHEN NEW.parent_product_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.parent_product_id = NEW.id THEN RAISE(ABORT, 'VARIANT_SELF_PARENT')
    WHEN NOT EXISTS (
      SELECT 1 FROM products p
      WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.parent_product_id
    ) THEN RAISE(ABORT, 'VARIANT_PARENT_INVALID')
    WHEN EXISTS (
      SELECT 1 FROM products p
      WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.parent_product_id
        AND p.parent_product_id IS NOT NULL
    ) THEN RAISE(ABORT, 'VARIANT_NESTING_FORBIDDEN')
    WHEN EXISTS (
      SELECT 1 FROM products c
      WHERE c.tenant_id = NEW.tenant_id AND c.parent_product_id = NEW.id
    ) THEN RAISE(ABORT, 'VARIANT_NESTING_FORBIDDEN')
  END;
END;

CREATE TABLE IF NOT EXISTS product_uoms (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    uom_code TEXT NOT NULL,
    factor_numerator INTEGER NOT NULL,
    factor_denominator INTEGER NOT NULL,
    is_base INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (is_base IN (0,1)),
    CHECK (is_base = 0 OR (factor_numerator = 1 AND factor_denominator = 1)),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, product_id, uom_code),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_uoms_base
    ON product_uoms(tenant_id, product_id) WHERE is_base = 1;
CREATE INDEX IF NOT EXISTS idx_product_uoms_lookup
    ON product_uoms(tenant_id, product_id, uom_code);

INSERT INTO product_uoms (
  id, tenant_id, product_id, uom_code,
  factor_numerator, factor_denominator, is_base
)
SELECT 'base-' || id, tenant_id, id, UPPER(unit_code), 1, 1, 1
FROM products;

-- Snapshot histórico de venta y cantidad base canónica.
ALTER TABLE sale_items ADD COLUMN sold_uom_id TEXT;
ALTER TABLE sale_items ADD COLUMN sold_uom_code TEXT;
ALTER TABLE sale_items ADD COLUMN entered_quantity_microunits INTEGER;
ALTER TABLE sale_items ADD COLUMN factor_numerator INTEGER;
ALTER TABLE sale_items ADD COLUMN factor_denominator INTEGER;
ALTER TABLE sale_items ADD COLUMN base_quantity_microunits INTEGER;
UPDATE sale_items
SET sold_uom_code = 'UND',
    entered_quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER),
    factor_numerator = 1,
    factor_denominator = 1,
    base_quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER);

-- Inventario/S18.
ALTER TABLE product_recipes ADD COLUMN quantity_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE product_recipes
SET quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER);

ALTER TABLE inventory_batches ADD COLUMN stock_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE inventory_batches SET stock_microunits = CAST(ROUND(stock * 1000000) AS INTEGER);

ALTER TABLE branch_product_stock ADD COLUMN stock_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE branch_product_stock SET stock_microunits = CAST(ROUND(stock * 1000000) AS INTEGER);

ALTER TABLE inventory_movements ADD COLUMN quantity_delta_microunits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_movements ADD COLUMN stock_after_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE inventory_movements
SET quantity_delta_microunits = CAST(ROUND(quantity_delta * 1000000) AS INTEGER),
    stock_after_microunits = CAST(ROUND(stock_after * 1000000) AS INTEGER);

ALTER TABLE branch_stock_policies ADD COLUMN min_stock_microunits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE branch_stock_policies ADD COLUMN reorder_point_microunits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE branch_stock_policies ADD COLUMN reorder_qty_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE branch_stock_policies
SET min_stock_microunits = CAST(ROUND(min_stock * 1000000) AS INTEGER),
    reorder_point_microunits = CAST(ROUND(reorder_point * 1000000) AS INTEGER),
    reorder_qty_microunits = CAST(ROUND(reorder_qty * 1000000) AS INTEGER);

ALTER TABLE inventory_count_lines ADD COLUMN counted_qty_microunits INTEGER;
ALTER TABLE inventory_count_lines ADD COLUMN system_qty_microunits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_count_lines ADD COLUMN difference_qty_microunits INTEGER;
UPDATE inventory_count_lines
SET counted_qty_microunits = CASE WHEN counted_qty IS NULL THEN NULL
      ELSE CAST(ROUND(counted_qty * 1000000) AS INTEGER) END,
    system_qty_microunits = CAST(ROUND(system_qty * 1000000) AS INTEGER),
    difference_qty_microunits = CASE WHEN difference_qty IS NULL THEN NULL
      ELSE CAST(ROUND(difference_qty * 1000000) AS INTEGER) END;

ALTER TABLE stock_losses ADD COLUMN quantity_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE stock_losses SET quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER);

-- Órdenes, compras, devoluciones y reportes.
ALTER TABLE order_items ADD COLUMN quantity_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE order_items SET quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER);

ALTER TABLE purchase_receipt_lines ADD COLUMN quantity_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE purchase_receipt_lines
SET quantity_microunits = CAST(ROUND(quantity * 1000000) AS INTEGER);

ALTER TABLE purchase_order_items ADD COLUMN quantity_ordered_microunits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_order_items ADD COLUMN quantity_received_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE purchase_order_items
SET quantity_ordered_microunits = CAST(ROUND(quantity_ordered * 1000000) AS INTEGER),
    quantity_received_microunits = CAST(ROUND(quantity_received * 1000000) AS INTEGER);

ALTER TABLE sale_return_items ADD COLUMN qty_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE sale_return_items SET qty_microunits = CAST(ROUND(qty * 1000000) AS INTEGER);

ALTER TABLE supplier_invoices ADD COLUMN matched_qty_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE supplier_invoices
SET matched_qty_microunits = CAST(ROUND(matched_qty * 1000000) AS INTEGER);

ALTER TABLE supplier_invoice_lines ADD COLUMN invoiced_qty_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE supplier_invoice_lines
SET invoiced_qty_microunits = CAST(ROUND(invoiced_qty * 1000000) AS INTEGER);

ALTER TABLE daily_product_rollups ADD COLUMN qty_microunits INTEGER NOT NULL DEFAULT 0;
UPDATE daily_product_rollups SET qty_microunits = CAST(ROUND(qty * 1000000) AS INTEGER);

INSERT INTO schema_meta(key, value) VALUES ('catalog.variants_uom.sprint31', '1');
