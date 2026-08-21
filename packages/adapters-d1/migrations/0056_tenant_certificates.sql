-- Certificados SUNAT del tenant (Arquitectura §5.4 / SEC-03 / ADR-FISCAL-006).
-- La clave privada NO se persiste: solo private_key_kms_ref (Secrets Store + wrap KMS).
CREATE TABLE tenant_certificates (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    alias TEXT NOT NULL CHECK (alias IN ('SUNAT', 'PSE_PLATFORM')),
    private_key_kms_ref TEXT NOT NULL,
    cert_chain_pem TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    rotated_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, alias),
    CHECK (length(fingerprint_sha256) = 64 AND fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'),
    CHECK (length(private_key_kms_ref) > 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_tenant_certificates_expires ON tenant_certificates(tenant_id, expires_at);

CREATE TRIGGER backup_epoch_tenant_certificates_insert AFTER INSERT ON "tenant_certificates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_certificates_update AFTER UPDATE ON "tenant_certificates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_certificates_delete BEFORE DELETE ON "tenant_certificates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.tenant_certificates.xades', '1');
