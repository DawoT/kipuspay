-- Fiscal RC: alertas Dueño + flags T-24h/T-6h en sales (DAT-12 tenant_id).
-- Alerts are append-mostly; sale flags prevent duplicate T-24/T-6.

ALTER TABLE sales ADD COLUMN alert_t24_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN alert_t6_sent INTEGER NOT NULL DEFAULT 0;

CREATE TABLE fiscal_owner_alerts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT,
    daily_summary_id TEXT,
    alert_kind TEXT NOT NULL,
    suggest_credit_note_ea INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME,
    CHECK (alert_kind IN ('T24H','T6H','DEADLINE_EXCEEDED'))
);

CREATE INDEX idx_fiscal_owner_alerts_tenant
  ON fiscal_owner_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_fiscal_owner_alerts_sale
  ON fiscal_owner_alerts(tenant_id, sale_id)
  WHERE sale_id IS NOT NULL;
