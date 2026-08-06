-- Sprint 22: payment_captures (§5.4 regla 2 / edge 2B)
-- sale_payments permanece; captura = ciclo de vida del adquirente.

CREATE TABLE IF NOT EXISTS payment_captures (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    sale_payment_id TEXT NOT NULL,
    acquirer TEXT NOT NULL,
    acquirer_ref TEXT,
    status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments(tenant_id, id),
    CHECK (status IN ('PENDING','CAPTURED','FAILED','REFUNDED','MANUAL_ELECTRONIC_CAPTURE')),
    CHECK (acquirer IN ('yape','plin','mercadopago','culqi','niubiz'))
);

CREATE INDEX IF NOT EXISTS idx_payment_captures_tenant_status
  ON payment_captures(tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_captures_sale
  ON payment_captures(tenant_id, sale_id);

INSERT INTO schema_meta (key, value)
VALUES (
  'payment_captures.sprint22',
  'Sprint 22 — payment_captures + MANUAL_ELECTRONIC_CAPTURE'
);
