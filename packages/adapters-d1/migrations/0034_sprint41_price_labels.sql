-- Sprint 41 — catalog.price_labels (ADR-0025 / DAT-12 / INTEGER cents)

CREATE TABLE price_label_templates (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    template_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    name TEXT NOT NULL,
    dsl_version TEXT NOT NULL CHECK (dsl_version IN ('PRICE_LABEL_V1')),
    template_json TEXT NOT NULL,
    paper_width_mm INTEGER NOT NULL CHECK (paper_width_mm IN (58, 80)),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, template_key, version),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE price_label_batches (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    terminal_id TEXT,
    template_id TEXT NOT NULL,
    price_list_id TEXT NOT NULL,
    price_list_identity TEXT NOT NULL
      CHECK (price_list_identity IN ('EXPLICIT','BRANCH_DEFAULT','TENANT_DEFAULT')),
    reprint_of_batch_id TEXT,
    idempotency_key TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','PRINTING','PARTIAL','ACKED','FAILED')),
    requested_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, branch_id, idempotency_key),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, template_id) REFERENCES price_label_templates(tenant_id, id),
    FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id),
    FOREIGN KEY (tenant_id, reprint_of_batch_id) REFERENCES price_label_batches(tenant_id, id),
    FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE price_label_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    product_name_snapshot TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    barcode_type TEXT NOT NULL CHECK (barcode_type IN ('EAN8','EAN13','CODE128')),
    barcode_value_snapshot TEXT NOT NULL,
    template_version INTEGER NOT NULL CHECK (template_version > 0),
    effective_price_list_id TEXT NOT NULL,
    price_source TEXT NOT NULL CHECK (price_source IN ('PRICE_LIST','PRODUCT_DEFAULT')),
    price_resolved_at DATETIME NOT NULL,
    price_resolution_version TEXT NOT NULL,
    rendered_payload_hash TEXT NOT NULL,
    rendered_payload_hex TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','ACKED','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    acknowledged_at DATETIME,
    last_error_code TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, batch_id, ordinal),
    FOREIGN KEY (tenant_id, batch_id) REFERENCES price_label_batches(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, effective_price_list_id) REFERENCES price_lists(tenant_id, id)
);

CREATE INDEX idx_price_label_batches_status
  ON price_label_batches(tenant_id, branch_id, status, created_at);
CREATE INDEX idx_price_label_items_pending
  ON price_label_items(tenant_id, batch_id, status, ordinal);

CREATE TRIGGER price_label_batches_snapshot_no_update
BEFORE UPDATE OF branch_id, terminal_id, template_id, price_list_id, price_list_identity,
  reprint_of_batch_id, idempotency_key, snapshot_hash ON price_label_batches
BEGIN
  SELECT RAISE(ABORT, 'PRICE_LABEL_BATCH_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER price_label_items_snapshot_no_update
BEFORE UPDATE OF batch_id, product_id, ordinal, product_name_snapshot, price_cents,
  barcode_type, barcode_value_snapshot, template_version, effective_price_list_id,
  price_source, price_resolved_at, price_resolution_version, rendered_payload_hash,
  rendered_payload_hex
  ON price_label_items
BEGIN
  SELECT RAISE(ABORT, 'PRICE_LABEL_ITEM_SNAPSHOT_IMMUTABLE');
END;

INSERT INTO schema_meta(key, value) VALUES ('catalog.price_labels.sprint41', '1');
