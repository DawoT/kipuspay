-- daily_product_rollups (Arquitectura §9) — SoT top productos / margen (Sprint 9).
-- DAT-12: tenant_id en PK. Escritura: DELETE+INSERT / ON CONFLICT (nunca UPSERT INTO).

CREATE TABLE daily_product_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    product_id TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    gross_cents INTEGER NOT NULL DEFAULT 0,
    cogs_cents INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, branch_id, report_date, product_id)
);

CREATE INDEX idx_daily_product_rollups_tenant_date
  ON daily_product_rollups(tenant_id, report_date);
