-- Sprint 34 — purchasing.returns (ADR-0018 / DAT-12 / ADR-0015 / regla 19)
-- Cantidades INTEGER *_microunits; dinero INTEGER *_cents; FKs compuestas.
-- 0 CPE / 0 cupo; stock solo al CLOSED.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_receipts_tenant_id ON purchase_receipts(tenant_id, id);

CREATE TABLE IF NOT EXISTS supplier_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    supplier_invoice_id TEXT,
    purchase_receipt_id TEXT,
    purchase_order_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    total_cents INTEGER NOT NULL,
    reason TEXT NOT NULL,
    supplier_credit_note_ref TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
    CHECK (total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_invoice_id) REFERENCES supplier_invoices(tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_receipt_id) REFERENCES purchase_receipts(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    return_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    sold_uom_id TEXT,
    sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL,
    factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1,
    base_quantity_microunits INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    igv_affectation_code TEXT NOT NULL DEFAULT '10',
    igv_amount_cents INTEGER NOT NULL DEFAULT 0,
    icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    CHECK (entered_quantity_microunits > 0),
    CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (unit_cost_cents >= 0),
    CHECK (line_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, return_id) REFERENCES supplier_returns(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_tenant_status ON supplier_returns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return ON supplier_return_items(tenant_id, return_id);

INSERT INTO schema_meta(key, value) VALUES ('purchasing.returns.sprint34', '1');
