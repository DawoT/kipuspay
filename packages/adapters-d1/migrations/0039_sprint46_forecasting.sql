-- Sprint 46 — analytics.forecasting (Arquitectura §5.3 regla 31 / ADR-0030 / DAT-12).
CREATE TABLE forecast_outputs (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_qty REAL NOT NULL,
    predicted_gross_cents INTEGER NOT NULL,
    confidence_low_qty REAL,
    confidence_high_qty REAL,
    model_version TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, branch_id, product_id, forecast_date),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE INDEX idx_forecast_outputs_tenant_date
    ON forecast_outputs(tenant_id, forecast_date);
CREATE INDEX idx_forecast_outputs_tenant_branch_product
    ON forecast_outputs(tenant_id, branch_id, product_id, forecast_date);

CREATE TRIGGER backup_epoch_forecast_outputs_insert AFTER INSERT ON "forecast_outputs" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_forecast_outputs_update AFTER UPDATE ON "forecast_outputs" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_forecast_outputs_delete BEFORE DELETE ON "forecast_outputs" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('analytics.forecasting.sprint46', '1');
