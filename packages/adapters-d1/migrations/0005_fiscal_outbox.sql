-- fiscal_outbox — cola de envío CPE (Arquitectura §5.3 / Sprint 5)
CREATE TABLE fiscal_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    must_submit_by DATETIME,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_id),
    CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','QUARANTINED')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);
CREATE INDEX idx_fiscal_outbox_poll
  ON fiscal_outbox(status, next_attempt_at)
  WHERE status IN ('PENDING','FAILED');
