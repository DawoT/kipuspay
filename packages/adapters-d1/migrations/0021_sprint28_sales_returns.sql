-- Sprint 28 — sales.returns (§5.3 regla 13)
CREATE TABLE IF NOT EXISTS return_policies (
    tenant_id TEXT PRIMARY KEY NOT NULL,
    window_days INTEGER NOT NULL DEFAULT 7,
    by_payment_method_json TEXT NOT NULL DEFAULT '{}',
    refund_to_original_method INTEGER NOT NULL DEFAULT 1,
    allow_turn_closed_with_auth INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS sales_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    doc_series TEXT,
    doc_number TEXT,
    refund_amount_cents INTEGER NOT NULL,
    refund_payment_method TEXT NOT NULL,
    refund_movement_id TEXT,
    reason TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON sales_returns(tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    return_id TEXT NOT NULL,
    original_sale_item_id TEXT NOT NULL,
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    igv_affectation_code TEXT NOT NULL DEFAULT '10',
    igv_amount_cents INTEGER NOT NULL DEFAULT 0,
    icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    unit_price_without_tax_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (return_id) REFERENCES sales_returns(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

INSERT INTO schema_meta(key, value) VALUES ('sales.returns.sprint28', '1');
