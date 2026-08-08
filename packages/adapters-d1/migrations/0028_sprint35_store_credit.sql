-- Sprint 35 — ledger.store_credit (ADR-0019 / DAT-12 / INTEGER cents)
-- Saldo servidor; UNIQUE source_ref; GL 2102 semilla vía journal-post.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_id ON customers(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_id ON sales(tenant_id, id);

CREATE TABLE IF NOT EXISTS store_credit_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PEN',
    expires_at DATETIME,
    CHECK (balance_cents >= 0),
    CHECK (currency = 'PEN'),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, customer_id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS store_credit_transactions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    store_credit_account_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    sale_id TEXT,
    source_ref TEXT NOT NULL,
    adjust_sign TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (type IN ('ISSUE','REDEEM','EXPIRE','ADJUST')),
    CHECK (amount_cents > 0),
    CHECK (adjust_sign IS NULL OR adjust_sign IN ('CREDIT','DEBIT')),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, source_ref),
    FOREIGN KEY (tenant_id, store_credit_account_id) REFERENCES store_credit_accounts(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_store_credit_accounts_tenant ON store_credit_accounts(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_tx_account ON store_credit_transactions(tenant_id, store_credit_account_id);

INSERT INTO schema_meta(key, value) VALUES ('ledger.store_credit.sprint35', '1');
