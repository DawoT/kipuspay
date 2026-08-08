-- Sprint 36 — sales.installments (ADR-0020 / DAT-12 / INTEGER cents / COM-06)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_id ON sales(tenant_id, id);

CREATE TABLE IF NOT EXISTS sale_installments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    principal_cents INTEGER NOT NULL,
    interest_cents INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    paid_at DATETIME,
    CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED')),
    CHECK (principal_cents >= 0),
    CHECK (interest_cents >= 0),
    CHECK (amount_cents > 0),
    CHECK (amount_cents = principal_cents + interest_cents),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sale_id, installment_number),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS sale_installment_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_installment_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    cash_register_session_id TEXT,
    collected_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_installment_id) REFERENCES sale_installments(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_sale_installments_sale ON sale_installments(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_installments_status ON sale_installments(tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_sale_installment_payments_inst ON sale_installment_payments(tenant_id, sale_installment_id);

INSERT INTO schema_meta(key, value) VALUES ('sales.installments.sprint36', '1');
