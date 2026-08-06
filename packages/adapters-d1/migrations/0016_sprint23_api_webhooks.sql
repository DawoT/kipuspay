-- Sprint 23: api_keys + webhook_endpoints + webhook_deliveries (§5.4 reglas 3–4 / SEC-04)

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    last_used_at DATETIME,
    created_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE (tenant_id, key_prefix),
    CHECK (status IN ('active','revoked')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_status
  ON api_keys(tenant_id, status);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    url TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    secret_kms_ref TEXT NOT NULL,
    secret_salt BLOB NOT NULL,
    events_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at DATETIME,
    CHECK (status IN ('active','disabled')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_endpoints_tenant_id
  ON webhook_endpoints(tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_status
  ON webhook_endpoints(tenant_id, status);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    delivered_at DATETIME,
    UNIQUE (endpoint_id, event_id),
    CHECK (status IN ('PENDING','PROCESSING','DELIVERED','FAILED','DISABLED')),
    FOREIGN KEY (tenant_id, endpoint_id) REFERENCES webhook_endpoints(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_poll
  ON webhook_deliveries(status, next_attempt_at);

INSERT INTO schema_meta (key, value)
VALUES (
  'api_webhooks.sprint23',
  'Sprint 23 — api_keys + outbound webhooks Contasis/API'
);
