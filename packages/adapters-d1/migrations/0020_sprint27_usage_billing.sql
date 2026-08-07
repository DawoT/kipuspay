-- Sprint 27 — usage metering + billing overages (Arquitectura §4.1)
ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS usage_counters (
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,
    doc_count INTEGER NOT NULL DEFAULT 0,
    overage_reported_thru INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, period_ym),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    usage_key TEXT NOT NULL,
    period_ym TEXT NOT NULL,
    document_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, usage_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS billing_overages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    period_ym TEXT NOT NULL,
    units INTEGER NOT NULL,
    stripe_idempotency_key TEXT NOT NULL UNIQUE,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_period
  ON usage_events(tenant_id, period_ym);

CREATE INDEX IF NOT EXISTS idx_billing_overages_tenant_period
  ON billing_overages(tenant_id, period_ym);

INSERT INTO schema_meta(key, value) VALUES ('billing.usage_overage.sprint27', '1');
