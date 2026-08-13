-- Backlog v10 P1c — Percepciones / Retenciones / Detracciones (Arquitectura
-- §5.2c, ADR-FISCAL-005). Tablas propias (patrón GRE 0046): NO se recrea sales.
CREATE TABLE withholding_parameters (
    tenant_id TEXT NOT NULL,
    scheme TEXT NOT NULL CHECK (scheme IN ('PERCEPTION','RETENTION','DETRACTION')),
    category_code TEXT NOT NULL,
    rate_percentage INTEGER NOT NULL CHECK (rate_percentage BETWEEN 1 AND 1200),
    PRIMARY KEY (tenant_id, scheme, category_code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE perceptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    series TEXT NOT NULL,
    number INTEGER NOT NULL,
    origin_sale_id TEXT NOT NULL,
    base_amount_cents INTEGER NOT NULL CHECK (base_amount_cents > 0),
    rate_percentage INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    sunat_status TEXT NOT NULL DEFAULT 'PENDING',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, series, number),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, origin_sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_perceptions_sale ON perceptions(tenant_id, origin_sale_id);

CREATE TABLE retentions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    series TEXT NOT NULL,
    number INTEGER NOT NULL,
    origin_supplier_invoice_id TEXT NOT NULL,
    base_amount_cents INTEGER NOT NULL CHECK (base_amount_cents > 0),
    rate_percentage INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    sunat_status TEXT NOT NULL DEFAULT 'PENDING',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, series, number),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_retentions_invoice ON retentions(tenant_id, origin_supplier_invoice_id);

-- Backups: BUSINESS, triggers de epoch propios (patrón sprint).
CREATE TRIGGER backup_epoch_perceptions_insert AFTER INSERT ON "perceptions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_perceptions_update AFTER UPDATE ON "perceptions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_perceptions_delete BEFORE DELETE ON "perceptions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_retentions_insert AFTER INSERT ON "retentions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_retentions_update AFTER UPDATE ON "retentions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_retentions_delete BEFORE DELETE ON "retentions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.withholdings.p1c', '1');

CREATE TRIGGER backup_epoch_withholding_parameters_insert AFTER INSERT ON "withholding_parameters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_withholding_parameters_update AFTER UPDATE ON "withholding_parameters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_withholding_parameters_delete BEFORE DELETE ON "withholding_parameters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
