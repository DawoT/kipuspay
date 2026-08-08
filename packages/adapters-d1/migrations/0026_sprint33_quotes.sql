-- Sprint 33 — sales.quotes (ADR-0017 / DAT-12 / ADR-0015 / COM-05)
-- Cantidades INTEGER *_microunits; dinero INTEGER *_cents; FKs compuestas.
-- 0 reserva de stock; 0 CPE hasta convertir.
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    valid_until DATE,
    total_cents INTEGER NOT NULL DEFAULT 0,
    sale_id TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('DRAFT','SENT','APPROVED','CONVERTED','EXPIRED','CANCELLED')),
    CHECK (total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS quote_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    quote_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    sold_uom_id TEXT,
    sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL,
    factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1,
    base_quantity_microunits INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    line_total_cents INTEGER NOT NULL,
    promotion_ids_json TEXT NOT NULL DEFAULT '[]',
    CHECK (entered_quantity_microunits > 0),
    CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (unit_price_cents >= 0),
    CHECK (line_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, quote_id) REFERENCES quotes(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status ON quotes(tenant_id, status, valid_until);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(tenant_id, quote_id);

INSERT INTO schema_meta(key, value) VALUES ('sales.quotes.sprint33', '1');
