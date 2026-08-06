-- Sprint 24: loyalty_accounts + loyalty_reservations + messaging_opt_ins (§5.4 reglas 5–6 / edge A)

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    points_balance INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, customer_id),
    CHECK (points_balance >= 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS loyalty_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    sale_idempotency_key TEXT NOT NULL,
    points INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'RESERVED',
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_idempotency_key),
    CHECK (points >= 0),
    CHECK (status IN ('RESERVED','REDEEMED','EXPIRED','CANCELLED')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_res_expiry
  ON loyalty_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_loyalty_res_customer
  ON loyalty_reservations(tenant_id, customer_id, status);

CREATE TABLE IF NOT EXISTS messaging_opt_ins (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    opted_in INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, customer_id, channel),
    CHECK (channel IN ('whatsapp')),
    CHECK (opted_in IN (0, 1)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_messaging_opt_ins_tenant
  ON messaging_opt_ins(tenant_id, channel, opted_in);

INSERT INTO schema_meta (key, value)
VALUES (
  'loyalty_messaging.sprint24',
  'Sprint 24 — loyalty.points + messaging.whatsapp_receipt opt-in'
);
