-- SEC-08: dedup de eventos entrantes Stripe/pasarela (Arquitectura §5.4)
CREATE TABLE webhook_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    processed_at DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, event_id),
    CHECK (status IN ('PROCESSING','PROCESSED','FAILED'))
);
