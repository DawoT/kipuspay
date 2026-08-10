-- Sprint 47 — compliance.lpdp (Arquitectura §5.3 regla 32a LPDP-01 / ADR-0031 / DAT-12).
-- Consentimiento explícito por propósito; reusa y migra el opt-in de mensajería
-- del Sprint 24 (messaging_opt_ins) como única fuente de verdad de consentimiento.
CREATE TABLE consent_records (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    purpose TEXT NOT NULL,                 -- 'messaging_whatsapp' | 'marketing' | ...
    granted INTEGER NOT NULL DEFAULT 0,
    granted_at DATETIME,
    revoked_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, customer_id, purpose),
    CHECK (granted IN (0, 1)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE INDEX idx_consent_records_tenant_purpose
    ON consent_records(tenant_id, purpose, granted);
CREATE INDEX idx_consent_records_tenant_customer
    ON consent_records(tenant_id, customer_id);

-- Backfill: el opt-in de WhatsApp del Sprint 24 se migra como consentimiento
-- vigente por propósito 'messaging_whatsapp' (LPDP-01); messaging_opt_ins queda
-- como lectura de compatibilidad, jamás como segunda fuente de verdad.
INSERT INTO consent_records (id, tenant_id, customer_id, purpose, granted, granted_at, created_at)
SELECT
    'consent_' || lower(hex(randomblob(16))),
    tenant_id,
    customer_id,
    'messaging_whatsapp',
    1,
    updated_at,
    updated_at
FROM messaging_opt_ins
WHERE opted_in = 1
ON CONFLICT(tenant_id, customer_id, purpose) DO NOTHING;

CREATE TRIGGER backup_epoch_consent_records_insert AFTER INSERT ON "consent_records" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_consent_records_update AFTER UPDATE ON "consent_records" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_consent_records_delete BEFORE DELETE ON "consent_records" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('compliance.lpdp.sprint47', '1');
