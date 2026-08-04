-- Daily financial rollups (Arquitectura §9) — mínimo para edge D rematerialize (Sprint 6).
-- Reporting UI completo = Sprint 9.

CREATE TABLE daily_financial_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    gross_sales_cents INTEGER NOT NULL DEFAULT 0,
    net_sales_cents INTEGER NOT NULL DEFAULT 0,
    cogs_cents INTEGER NOT NULL DEFAULT 0,
    igv_cents INTEGER NOT NULL DEFAULT 0,
    icbper_cents INTEGER NOT NULL DEFAULT 0,
    discounts_cents INTEGER NOT NULL DEFAULT 0,
    doc_count INTEGER NOT NULL DEFAULT 0,
    cash_expected_cents INTEGER NOT NULL DEFAULT 0,
    cash_counted_cents INTEGER,
    cash_diff_cents INTEGER,
    payments_by_method TEXT NOT NULL DEFAULT '{}',
    overage_docs INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, report_date)
);

CREATE INDEX idx_daily_financial_rollups_tenant_date
  ON daily_financial_rollups(tenant_id, report_date);
