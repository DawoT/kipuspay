-- Sprint 37 — sales.commissions (ADR-0021 / DAT-12 / INTEGER cents / COM-07)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_id ON users(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_id ON sales(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);

CREATE TABLE IF NOT EXISTS commission_rates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    product_id TEXT,
    category_id TEXT,
    rate_percent REAL NOT NULL,
    rate_amount_cents INTEGER,
    CHECK (rate_amount_cents IS NULL OR rate_amount_cents >= 0),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, seller_id, product_id, category_id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS commission_payouts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (gross_cents > 0),
    CHECK (status IN ('OPEN','PAID','VOID')),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS commission_accruals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    reversed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sale_id, seller_id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commission_rates_seller ON commission_rates(tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_sale ON commission_accruals(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_commission_accruals_seller ON commission_accruals(tenant_id, seller_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_seller ON commission_payouts(tenant_id, seller_id, status);

INSERT INTO schema_meta(key, value) VALUES ('sales.commissions.sprint37', '1');
