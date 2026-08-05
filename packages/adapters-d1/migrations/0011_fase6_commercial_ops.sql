-- FASE 6 Sprint 17–20 — Motor de Operación Comercial (Arquitectura §5.3 / ADR-0012)
-- Núcleo S17 + tablas S18–S20. Edges outbox (S25) y SHIFT_TRANSFER (S51) fuera.

CREATE TABLE IF NOT EXISTS tenant_capabilities (
    tenant_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant_id, capability),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS authorization_tokens (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    approved_by_user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, token_hash),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_authorization_tokens_active
    ON authorization_tokens(tenant_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS cash_count_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    denomination_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

CREATE TABLE IF NOT EXISTS tenant_discount_policies (
    tenant_id TEXT PRIMARY KEY NOT NULL,
    max_percent_without_auth REAL NOT NULL DEFAULT 5.0,
    max_amount_without_auth_cents INTEGER NOT NULL DEFAULT 2000,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS cash_register_cash_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    counterparty_ref TEXT,
    reason TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (movement_type IN (
      'DEPOSIT_VALUES','CHANGE_FUND_IN','CHANGE_FUND_OUT','SUPPLIER_PAYMENT','ADJUSTMENT'
    )),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

CREATE TABLE IF NOT EXISTS sale_reprints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    printed_by_user_id TEXT NOT NULL,
    copied_watermark INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- Extensión blind-Z en sesiones (SQLite: ADD COLUMN idempotente vía IF NOT EXISTS no existe;
-- wrangler aplica una vez; columnas nuevas).
ALTER TABLE cash_register_sessions ADD COLUMN counted_total_cents INTEGER;
ALTER TABLE cash_register_sessions ADD COLUMN expected_total_cents INTEGER;
ALTER TABLE cash_register_sessions ADD COLUMN difference_amount_cents INTEGER;
ALTER TABLE cash_register_sessions ADD COLUMN difference_reason TEXT;
ALTER TABLE cash_register_sessions ADD COLUMN closed_blind INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cash_register_sessions ADD COLUMN authorized_by_user_id TEXT;

-- S18
CREATE TABLE IF NOT EXISTS branch_stock_policies (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    min_stock REAL NOT NULL DEFAULT 0,
    reorder_point REAL NOT NULL DEFAULT 0,
    reorder_qty REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_counts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COUNTING',
    blind INTEGER NOT NULL DEFAULT 1,
    approved_by_user_id TEXT,
    difference_threshold_cents INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    CHECK (status IN ('COUNTING','DIFFERENCE_REVIEW','APPROVED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS inventory_count_lines (
    id TEXT PRIMARY KEY,
    count_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    counted_qty REAL,
    system_qty REAL NOT NULL,
    difference_qty REAL,
    unit_cost_cents INTEGER,
    diff_value_cents INTEGER,
    approved_by_user_id TEXT,
    FOREIGN KEY (count_id) REFERENCES inventory_counts(id)
);

CREATE TABLE IF NOT EXISTS stock_losses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    quantity REAL NOT NULL CHECK (quantity > 0),
    category TEXT NOT NULL,
    evidence_r2_key TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_by_user_id TEXT NOT NULL,
    approved_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    CHECK (category IN ('DAMAGED','EXPIRED','THEFT_SUSPECTED','SHRINK','OTHER')),
    CHECK (status IN ('PENDING','APPROVED','REJECTED'))
);

-- S19
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    table_label TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    opened_by_user_id TEXT NOT NULL,
    customer_id TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    CHECK (status IN ('OPEN','FIRED','READY','PAID','CANCELLED')),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    sale_id TEXT,
    authorized_by_user_id TEXT,
    CHECK (status IN ('PENDING','FIRED','READY','CANCELLED','BILLED')),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- S20
CREATE TABLE IF NOT EXISTS stock_transfers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    from_branch_id TEXT NOT NULL,
    to_branch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_by_user_id TEXT NOT NULL,
    shipped_at DATETIME,
    received_at DATETIME,
    CHECK (status IN ('DRAFT','IN_TRANSIT','RECEIVED','CANCELLED')),
    FOREIGN KEY (from_branch_id) REFERENCES branches(id),
    FOREIGN KEY (to_branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transfer_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty_sent REAL NOT NULL,
    qty_received REAL DEFAULT 0,
    qty_shrink REAL DEFAULT 0,
    shrink_reason TEXT,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id)
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    received_by_user_id TEXT NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_number TEXT,
    expiry_date DATE,
    quantity REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id)
);
