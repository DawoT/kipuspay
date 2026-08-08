-- Sprint 40 — inventory.scale (ADR-0024 / DAT-12 / INTEGER microunits)

-- Existing rows use the original lowercase values; WEIGH is the stock-tracked
-- variable-mass product type added by this migration.
CREATE TRIGGER products_product_type_guard_insert
BEFORE INSERT ON products
WHEN NEW.product_type NOT IN ('physical','service','kit','WEIGH')
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_TYPE_INVALID');
END;

CREATE TRIGGER products_product_type_guard_update
BEFORE UPDATE OF product_type ON products
WHEN NEW.product_type NOT IN ('physical','service','kit','WEIGH')
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_TYPE_INVALID');
END;

-- Parent keys required by tenant-safe composite foreign keys.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_items_tenant_id ON sale_items(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_terminals_tenant_id ON pos_terminals(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_register_sessions_tenant_id
  ON cash_register_sessions(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_id ON users(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_authorization_tokens_tenant_id
  ON authorization_tokens(tenant_id, id);

CREATE TABLE tenant_weight_policies (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    manual_weight_threshold_microunits INTEGER NOT NULL DEFAULT 0
      CHECK (manual_weight_threshold_microunits >= 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE scale_devices (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')),
    device_fingerprint TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','DISCONNECTED','DISABLED')),
    last_heartbeat_at DATETIME,
    last_heartbeat_sequence INTEGER CHECK (
      last_heartbeat_sequence IS NULL OR last_heartbeat_sequence >= 0
    ),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, terminal_id, device_fingerprint),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id)
);

CREATE TABLE pos_terminal_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, cash_register_session_id)
      REFERENCES cash_register_sessions(tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE UNIQUE INDEX uq_pos_terminal_sessions_active_terminal
  ON pos_terminal_sessions(tenant_id, terminal_id)
  WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_pos_terminal_sessions_active_cash_session
  ON pos_terminal_sessions(tenant_id, cash_register_session_id)
  WHERE status = 'ACTIVE';
CREATE INDEX idx_pos_terminal_sessions_actor
  ON pos_terminal_sessions(tenant_id, user_id, branch_id, status);

ALTER TABLE authorization_tokens ADD COLUMN action TEXT;
ALTER TABLE authorization_tokens ADD COLUMN actor_user_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN terminal_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN sale_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN offline_sale_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN sale_item_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN measurement_id TEXT;
ALTER TABLE sale_return_items ADD COLUMN original_weight_measurement_id TEXT;

CREATE INDEX idx_authorization_tokens_weight_scope
  ON authorization_tokens(
    tenant_id, action, actor_user_id, terminal_id, sale_id, offline_sale_id, sale_item_id,
    measurement_id
  )
  WHERE used_at IS NULL;

CREATE TABLE weight_measurements (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    sale_item_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    scale_device_id TEXT,
    operation_type TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    weight_microunits INTEGER NOT NULL CHECK (weight_microunits > 0),
    unit_price_per_base_cents INTEGER NOT NULL CHECK (unit_price_per_base_cents >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    measurement_source TEXT NOT NULL CHECK (measurement_source IN ('DEVICE','MANUAL')),
    scale_protocol TEXT CHECK (scale_protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')),
    heartbeat_sequence INTEGER,
    observed_at DATETIME NOT NULL,
    authorization_token_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sale_item_id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, scale_device_id) REFERENCES scale_devices(tenant_id, id),
    FOREIGN KEY (tenant_id, authorization_token_id) REFERENCES authorization_tokens(tenant_id, id)
);

CREATE INDEX idx_scale_devices_terminal
  ON scale_devices(tenant_id, terminal_id, status);
CREATE INDEX idx_weight_measurements_product
  ON weight_measurements(tenant_id, product_id, created_at);
CREATE INDEX idx_weight_measurements_operation
  ON weight_measurements(tenant_id, operation_type, operation_id);
CREATE INDEX idx_weight_measurements_audit
  ON weight_measurements(tenant_id, authorization_token_id, created_at);
CREATE INDEX idx_sale_return_items_weight_measurement
  ON sale_return_items(tenant_id, original_weight_measurement_id);

CREATE TRIGGER weight_measurements_no_update
BEFORE UPDATE ON weight_measurements
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MEASUREMENTS_APPEND_ONLY');
END;

CREATE TRIGGER weight_measurements_no_delete
BEFORE DELETE ON weight_measurements
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MEASUREMENTS_APPEND_ONLY');
END;

-- The physical quantity for WEIGH lines is the existing integer base quantity.
CREATE TRIGGER sale_items_weigh_quantity_guard_insert
BEFORE INSERT ON sale_items
WHEN NEW.product_type = 'WEIGH'
  AND (NEW.base_quantity_microunits IS NULL OR NEW.base_quantity_microunits <= 0)
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MICROUNITS_REQUIRED');
END;

CREATE TRIGGER sale_items_weigh_quantity_guard_update
BEFORE UPDATE OF product_type, base_quantity_microunits ON sale_items
WHEN NEW.product_type = 'WEIGH'
  AND (NEW.base_quantity_microunits IS NULL OR NEW.base_quantity_microunits <= 0)
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MICROUNITS_REQUIRED');
END;

INSERT INTO schema_meta(key, value) VALUES ('inventory.scale.sprint40', '1');
