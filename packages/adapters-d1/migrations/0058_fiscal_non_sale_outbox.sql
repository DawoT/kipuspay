-- FASE FL-5: cola de emisión GRE/percepción/retención (no son sales).
-- EPHEMERAL como fiscal_outbox: puntero + must_submit_by; XML en R2.
CREATE TABLE fiscal_non_sale_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('31','02','20')),
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    must_submit_by DATETIME,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    r2_xml_key TEXT,
    quarantine_reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, document_type, entity_id),
    CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','QUARANTINED'))
);
CREATE INDEX idx_fiscal_non_sale_outbox_poll
  ON fiscal_non_sale_outbox(status, next_attempt_at)
  WHERE status IN ('PENDING','FAILED');

CREATE TRIGGER backup_epoch_fiscal_non_sale_outbox_insert AFTER INSERT ON "fiscal_non_sale_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_non_sale_outbox_update AFTER UPDATE ON "fiscal_non_sale_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_non_sale_outbox_delete BEFORE DELETE ON "fiscal_non_sale_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.non_sale_outbox.fl5', '1');
