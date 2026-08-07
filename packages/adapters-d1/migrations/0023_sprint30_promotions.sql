-- Sprint 30 — pricing.promotions (§5.3 regla 15 / ADR-0014)
-- FKs compuestas (DAT-12): UNIQUE (tenant_id, id) habilita la referencia multi-tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id ON products(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_lists_tenant_id ON price_lists(tenant_id, id);

CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    starts_at DATETIME,
    ends_at DATETIME,
    applies_to TEXT NOT NULL,
    rule_json TEXT NOT NULL,
    max_stack_json TEXT NOT NULL DEFAULT '{}',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (applies_to IN ('PRODUCT','CATEGORY','LIST','CART')),
    CHECK (active IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotions_tenant_id ON promotions(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_promotions_tenant_active ON promotions(tenant_id, active);

CREATE TABLE IF NOT EXISTS product_promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    promotion_id TEXT NOT NULL,
    product_id TEXT,
    category_id TEXT,
    price_list_id TEXT,
    UNIQUE (tenant_id, promotion_id, product_id, category_id, price_list_id),
    FOREIGN KEY (tenant_id, promotion_id) REFERENCES promotions(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_product_promotions_promo ON product_promotions(tenant_id, promotion_id);

INSERT INTO schema_meta(key, value) VALUES ('pricing.promotions.sprint30', '1');
