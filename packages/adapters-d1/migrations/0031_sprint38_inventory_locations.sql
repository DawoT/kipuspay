-- Sprint 38 — inventory.locations (ADR-0022 / DAT-12 / INTEGER microunits)
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_batches_tenant_id
    ON inventory_batches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_counts_tenant_id
    ON inventory_counts(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_counts_tenant_branch_id
    ON inventory_counts(tenant_id, branch_id, id);

CREATE TABLE IF NOT EXISTS inventory_locations (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, branch_id, id),
    UNIQUE (tenant_id, branch_id, code),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_location_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, location_id, product_id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_location_batch_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 0 CHECK (quantity_microunits >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, location_id, product_id, batch_id),
    FOREIGN KEY (tenant_id, branch_id, location_id, product_id)
      REFERENCES inventory_location_stock(tenant_id, branch_id, location_id, product_id),
    FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_location_transfers (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    source_location_id TEXT NOT NULL,
    destination_location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
    idempotency_key TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (source_location_id <> destination_location_id),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, branch_id, source_location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, branch_id, destination_location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_branch
    ON inventory_locations(tenant_id, branch_id, is_active, code);
CREATE INDEX IF NOT EXISTS idx_inventory_location_stock_product
    ON inventory_location_stock(tenant_id, branch_id, product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_batch_fefo
    ON inventory_location_batch_stock(tenant_id, branch_id, product_id, batch_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_transfers_branch
    ON inventory_location_transfers(tenant_id, branch_id, created_at);

-- Ubicación determinista por sucursal y backfill exacto del agregado legado.
INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
SELECT 'loc-default:' || tenant_id || ':' || id, tenant_id, id, 'DEFAULT', 'Ubicación por defecto'
FROM branches;

INSERT INTO inventory_location_stock (
    tenant_id, branch_id, location_id, product_id, quantity_microunits
)
SELECT tenant_id, branch_id, 'loc-default:' || tenant_id || ':' || branch_id,
       product_id, stock_microunits
FROM branch_product_stock;

INSERT INTO inventory_location_batch_stock (
    tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
)
SELECT b.tenant_id, b.branch_id, 'loc-default:' || b.tenant_id || ':' || b.branch_id,
       b.product_id, b.id, b.stock_microunits
FROM inventory_batches b
JOIN inventory_location_stock s
  ON s.tenant_id = b.tenant_id AND s.branch_id = b.branch_id
 AND s.product_id = b.product_id
 AND s.location_id = 'loc-default:' || b.tenant_id || ':' || b.branch_id;

-- Trazabilidad de origen/destino en writers existentes.
ALTER TABLE inventory_movements ADD COLUMN location_id TEXT;
ALTER TABLE inventory_movements ADD COLUMN counter_location_id TEXT;
ALTER TABLE sale_items ADD COLUMN inventory_location_id TEXT;
ALTER TABLE purchase_receipt_lines ADD COLUMN location_id TEXT;
ALTER TABLE stock_losses ADD COLUMN location_id TEXT;

-- Conteo S18 reconstruido con tenant/sucursal/ubicación DAT-12.
CREATE TABLE inventory_count_lines_s38 (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    count_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    counted_qty REAL,
    system_qty REAL NOT NULL,
    difference_qty REAL,
    counted_qty_microunits INTEGER,
    system_qty_microunits INTEGER NOT NULL,
    difference_qty_microunits INTEGER,
    unit_cost_cents INTEGER,
    diff_value_cents INTEGER,
    approved_by_user_id TEXT,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, count_id)
      REFERENCES inventory_counts(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, batch_id) REFERENCES inventory_batches(tenant_id, id)
);

INSERT INTO inventory_count_lines_s38 (
    id, tenant_id, branch_id, count_id, location_id, product_id, batch_id,
    counted_qty, system_qty, difference_qty, counted_qty_microunits,
    system_qty_microunits, difference_qty_microunits, unit_cost_cents,
    diff_value_cents, approved_by_user_id
)
SELECT l.id, c.tenant_id, c.branch_id, l.count_id,
       'loc-default:' || c.tenant_id || ':' || c.branch_id,
       l.product_id, l.batch_id, l.counted_qty, l.system_qty, l.difference_qty,
       l.counted_qty_microunits, l.system_qty_microunits,
       l.difference_qty_microunits, l.unit_cost_cents, l.diff_value_cents,
       l.approved_by_user_id
FROM inventory_count_lines l
JOIN inventory_counts c ON c.id = l.count_id;

DROP TABLE inventory_count_lines;
ALTER TABLE inventory_count_lines_s38 RENAME TO inventory_count_lines;
CREATE INDEX idx_inventory_count_lines_location
    ON inventory_count_lines(tenant_id, branch_id, location_id, product_id);

INSERT INTO schema_meta(key, value) VALUES ('inventory.locations.sprint38', '1');
