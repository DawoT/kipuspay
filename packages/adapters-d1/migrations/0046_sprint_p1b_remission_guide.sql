-- Backlog v10 P1b — GRE (Arquitectura §5.2b, ADR-FISCAL-004).
-- La guía de remisión declara un traslado; NO es comprobante de pago y NO toca
-- stock ni saldos. Serie T administrada en branch_document_series ('31').
CREATE TABLE remission_guides (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    series TEXT NOT NULL,
    number INTEGER NOT NULL,
    transfer_reason_code TEXT NOT NULL CHECK (transfer_reason_code IN ('01','02','04','08','13','14','16')),
    transport_mode_code TEXT NOT NULL CHECK (transport_mode_code IN ('01','02')),
    vehicle_plate TEXT NOT NULL,
    carrier_document_type TEXT NOT NULL,
    carrier_document_number TEXT NOT NULL,
    carrier_name TEXT NOT NULL,
    origin_ubigeo TEXT NOT NULL,
    origin_address TEXT NOT NULL,
    destination_ubigeo TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    transfer_started_at TEXT NOT NULL,
    related_document_type TEXT,
    related_document_series TEXT,
    related_document_number INTEGER,
    sunat_status TEXT NOT NULL DEFAULT 'PENDING',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, series, number),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_remission_guides_series ON remission_guides(tenant_id, branch_id, series, number);
CREATE INDEX idx_remission_guides_status ON remission_guides(tenant_id, sunat_status, transfer_started_at);

CREATE TABLE remission_guide_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    remission_guide_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
    uom_code TEXT NOT NULL,
    batch_id TEXT,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, remission_guide_id) REFERENCES remission_guides(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

-- Backups: BUSINESS, triggers de epoch propios (patrón sprint).
CREATE TRIGGER backup_epoch_remission_guides_insert AFTER INSERT ON "remission_guides" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_remission_guides_update AFTER UPDATE ON "remission_guides" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_remission_guides_delete BEFORE DELETE ON "remission_guides" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_remission_guide_items_insert AFTER INSERT ON "remission_guide_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_remission_guide_items_update AFTER UPDATE ON "remission_guide_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_remission_guide_items_delete BEFORE DELETE ON "remission_guide_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.gre.p1b', '1');
