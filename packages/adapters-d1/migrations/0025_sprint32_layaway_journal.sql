-- Sprint 32 — sales.layaway + ledger.chart_of_accounts (ADR-0016 / DAT-12 / ADR-0015)
-- Cantidades físicas INTEGER *_microunits; dinero INTEGER *_cents; FKs compuestas.
CREATE TABLE IF NOT EXISTS sale_deposits (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    deposit_date DATE NOT NULL,
    due_date DATE,
    sale_id TEXT,
    snapshot_total_cents INTEGER NOT NULL DEFAULT 0,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','OVERDUE','CONVERTED','CANCELLED')),
    CHECK (snapshot_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS sale_deposit_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, sale_deposit_id) REFERENCES sale_deposits(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS sale_deposit_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    sold_uom_id TEXT,
    sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL,
    factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1,
    base_quantity_microunits INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    CHECK (entered_quantity_microunits > 0),
    CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (unit_price_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, sale_deposit_id) REFERENCES sale_deposits(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    post_date DATE NOT NULL,
    balanced_cents INTEGER NOT NULL DEFAULT 0,
    posted_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (balanced_cents = 0),
    CHECK (source_type IN (
      'SALE','PAYMENT','SUPPLIER_INVOICE','AR_AP','CASH_COUNT',
      'LAYAWAY','SALES_RETURN','COMMISSION','SUPPLIER_RETURN','STORE_CREDIT','INSTALLMENT'
    )),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, source_type, source_id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    journal_entry_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_cents INTEGER NOT NULL DEFAULT 0,
    credit_cents INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    CHECK (debit_cents >= 0),
    CHECK (credit_cents >= 0),
    CHECK ((debit_cents = 0 AND credit_cents > 0) OR (credit_cents = 0 AND debit_cents > 0)),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES journal_entries(tenant_id, id),
    FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(tenant_id, journal_entry_id);

INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-1011', t.id, '1011', 'Caja y bancos', 'ASSET' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '1011');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-1212', t.id, '1212', 'Cuentas por cobrar', 'ASSET' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '1212');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-2011', t.id, '2011', 'Cuentas por pagar', 'LIABILITY' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '2011');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-2101', t.id, '2101', 'Anticipos de clientes', 'LIABILITY' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '2101');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-4011', t.id, '4011', 'IGV por pagar', 'LIABILITY' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '4011');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-6011', t.id, '6011', 'Compras', 'EXPENSE' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '6011');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-6591', t.id, '6591', 'Faltantes y sobrantes de caja', 'EXPENSE' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '6591');
INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
SELECT 'coa-' || t.id || '-7011', t.id, '7011', 'Ventas', 'REVENUE' FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '7011');

-- Arqueo S17/S28/S32: SALE_REFUND ya se escribe; LAYAWAY_* son inflows/outflows de apartado.
CREATE TABLE cash_register_cash_movements_s32 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    counterparty_ref TEXT,
    reason TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (movement_type IN (
      'DEPOSIT_VALUES','CHANGE_FUND_IN','CHANGE_FUND_OUT','SUPPLIER_PAYMENT','ADJUSTMENT',
      'SALE_REFUND','LAYAWAY_DEPOSIT','LAYAWAY_REFUND'
    )),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);
INSERT INTO cash_register_cash_movements_s32
SELECT id, tenant_id, branch_id, cash_register_session_id, movement_type, amount_cents,
       counterparty_ref, reason, created_by_user_id, authorized_by_user_id, created_at
FROM cash_register_cash_movements;
DROP TABLE cash_register_cash_movements;
ALTER TABLE cash_register_cash_movements_s32 RENAME TO cash_register_cash_movements;

INSERT INTO schema_meta(key, value) VALUES ('sales.layaway_journal.sprint32', '1');
