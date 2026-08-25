-- Credenciales SOL SUNAT por tenant (emisión directa por negocio, Arquitectura §5.4 / SEC-03).
-- Patrón tenant_certificates (0056): el secreto NUNCA en claro — sol_credentials_envelope
-- guarda 'envelope-v1:{json}' AES-GCM cuyo plaintext es {"solUser","solPassword"} y cuya DEK
-- (32B) se envuelve con KMS (backupId 'tenant-sol:SUNAT'). Una credencial vigente por tenant.
CREATE TABLE tenant_sol_credentials (
    tenant_id TEXT NOT NULL,
    alias TEXT NOT NULL CHECK (alias = 'SUNAT'),
    sol_credentials_envelope TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, alias),
    CHECK (length(sol_credentials_envelope) > 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TRIGGER backup_epoch_tenant_sol_credentials_insert AFTER INSERT ON "tenant_sol_credentials" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_sol_credentials_update AFTER UPDATE ON "tenant_sol_credentials" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_sol_credentials_delete BEFORE DELETE ON "tenant_sol_credentials" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.tenant_sol_credentials.direct', '1');
