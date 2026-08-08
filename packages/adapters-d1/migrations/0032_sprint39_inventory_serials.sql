-- Sprint 39 — inventory.serials (ADR-0023 / DAT-12 / INTEGER microunits)
ALTER TABLE products ADD COLUMN serial_tracking_mode TEXT NOT NULL DEFAULT 'NONE'
    CHECK (serial_tracking_mode IN ('NONE','REQUIRED'));

-- Parent keys required by tenant-safe composite foreign keys.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_items_tenant_id ON sale_items(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_receipt_lines_tenant_id
    ON purchase_receipt_lines(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_terminals_tenant_id ON pos_terminals(tenant_id, id);

CREATE TABLE IF NOT EXISTS serial_numbers (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    serial_number_normalized TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 1000000
      CHECK (quantity_microunits = 1000000),
    status TEXT NOT NULL DEFAULT 'AVAILABLE'
      CHECK (status IN ('AVAILABLE','RESERVED','SOLD','IN_TRANSIT','RETURNED_INSPECTION','LOST','DAMAGED','RETURNED_SUPPLIER')),
    purchase_receipt_line_id TEXT,
    current_sale_item_id TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, serial_number_normalized),
    UNIQUE (tenant_id, branch_id, location_id, product_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_receipt_line_id)
      REFERENCES purchase_receipt_lines(tenant_id, id),
    FOREIGN KEY (tenant_id, current_sale_item_id) REFERENCES sale_items(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS serial_number_events (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT,
    actor_user_id TEXT,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id)
);

CREATE TRIGGER serial_number_events_no_update
BEFORE UPDATE ON serial_number_events
BEGIN
  SELECT RAISE(ABORT, 'SERIAL_EVENTS_APPEND_ONLY');
END;

CREATE TRIGGER serial_number_events_no_delete
BEFORE DELETE ON serial_number_events
BEGIN
  SELECT RAISE(ABORT, 'SERIAL_EVENTS_APPEND_ONLY');
END;

CREATE TABLE IF NOT EXISTS serial_terminal_leases (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','CONSUMED','RELEASED','REVOKED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at DATETIME,
    released_at DATETIME,
    revoked_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, serial_id),
    UNIQUE (tenant_id, token_hash),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS serial_manifests (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    operation_line_id TEXT,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, operation_type, operation_id, operation_line_id)
);

CREATE TABLE IF NOT EXISTS serial_manifest_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    manifest_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 1000000
      CHECK (quantity_microunits = 1000000),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, manifest_id, serial_id),
    FOREIGN KEY (tenant_id, manifest_id) REFERENCES serial_manifests(tenant_id, id),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_serial_numbers_lookup
    ON serial_numbers(tenant_id, serial_number_normalized);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_stock
    ON serial_numbers(tenant_id, branch_id, location_id, product_id, status);
CREATE INDEX IF NOT EXISTS idx_serial_events_history
    ON serial_number_events(tenant_id, serial_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_serial_leases_terminal
    ON serial_terminal_leases(tenant_id, terminal_id, status);
CREATE INDEX IF NOT EXISTS idx_serial_manifest_operation
    ON serial_manifests(tenant_id, operation_type, operation_id);
CREATE INDEX IF NOT EXISTS idx_serial_manifest_items_serial
    ON serial_manifest_items(tenant_id, serial_id, manifest_id);

INSERT INTO schema_meta(key, value) VALUES ('inventory.serials.sprint39', '1');
