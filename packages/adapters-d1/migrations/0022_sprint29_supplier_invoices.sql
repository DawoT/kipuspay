-- Sprint 29 — purchasing.three_way (§5.3 regla 14)
-- FKs compuestas (DAT-12): los UNIQUE (tenant_id, id) habilitan la referencia multi-tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_tenant_id ON purchase_orders(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id ON branches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_tenant_id ON suppliers(tenant_id, id);

CREATE TABLE IF NOT EXISTS supplier_invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    total_cents INTEGER NOT NULL,
    igv_cents INTEGER NOT NULL,
    matched_qty REAL NOT NULL DEFAULT 0,
    matched_amount_cents INTEGER NOT NULL DEFAULT 0,
    price_diff_override INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','MATCHED','PARTIAL','CLOSED')),
    CHECK (total_cents >= 0),
    CHECK (igv_cents >= 0),
    CHECK (price_diff_override IN (0,1)),
    UNIQUE (tenant_id, supplier_id, invoice_number),
    FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_tenant_id ON supplier_invoices(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po ON supplier_invoices(tenant_id, purchase_order_id);

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    invoiced_qty REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    UNIQUE (tenant_id, invoice_id, product_id),
    FOREIGN KEY (tenant_id, invoice_id) REFERENCES supplier_invoices(tenant_id, id)
);

INSERT INTO schema_meta(key, value) VALUES ('purchasing.three_way.sprint29', '1');
