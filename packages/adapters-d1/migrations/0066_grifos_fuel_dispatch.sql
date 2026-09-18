-- Grifos — catálogo de precios y despachos server-authoritative.
-- Los importes son INTEGER cents; el volumen se expresa en microunits.
CREATE TABLE fuel_catalog (
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    price_cents_per_gallon INTEGER NOT NULL CHECK (price_cents_per_gallon > 0),
    igv_rate_bps INTEGER NOT NULL DEFAULT 1800 CHECK (igv_rate_bps >= 0 AND igv_rate_bps <= 10000),
    detraction_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (detraction_rate_bps >= 0 AND detraction_rate_bps <= 10000),
    stock_microunits INTEGER NOT NULL DEFAULT 0 CHECK (stock_microunits >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE fuel_dispatches (
    dispatch_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    fuel_code TEXT NOT NULL,
    island_id TEXT NOT NULL,
    nozzle_id TEXT NOT NULL,
    plate TEXT,
    fleet_id TEXT,
    meter_reading_microunits INTEGER CHECK (meter_reading_microunits IS NULL OR meter_reading_microunits >= 0),
    volume_microunits INTEGER NOT NULL CHECK (volume_microunits > 0),
    price_cents_per_gallon INTEGER NOT NULL CHECK (price_cents_per_gallon > 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    igv_cents INTEGER NOT NULL CHECK (igv_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    detraction_cents INTEGER NOT NULL DEFAULT 0 CHECK (detraction_cents >= 0),
    document_type TEXT NOT NULL,
    business_invoice INTEGER NOT NULL CHECK (business_invoice IN (0, 1)),
    payment_method TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, dispatch_id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, fuel_code) REFERENCES fuel_catalog(tenant_id, code),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE INDEX idx_fuel_dispatches_tenant_created
    ON fuel_dispatches (tenant_id, created_at DESC);

CREATE TRIGGER fuel_catalog_stock_nonnegative
BEFORE UPDATE OF stock_microunits ON fuel_catalog
WHEN NEW.stock_microunits < 0
BEGIN
  SELECT RAISE(ABORT, 'FUEL_STOCK_INSUFFICIENT');
END;

CREATE TRIGGER backup_epoch_fuel_catalog_insert AFTER INSERT ON fuel_catalog
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id; END;
CREATE TRIGGER backup_epoch_fuel_catalog_update AFTER UPDATE ON fuel_catalog
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id; END;
CREATE TRIGGER backup_epoch_fuel_catalog_delete BEFORE DELETE ON fuel_catalog
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id; END;

CREATE TRIGGER backup_epoch_fuel_dispatches_insert AFTER INSERT ON fuel_dispatches
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id; END;
CREATE TRIGGER backup_epoch_fuel_dispatches_update AFTER UPDATE ON fuel_dispatches
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id; END;
CREATE TRIGGER backup_epoch_fuel_dispatches_delete BEFORE DELETE ON fuel_dispatches
BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id; END;

INSERT INTO schema_meta(key, value) VALUES ('fuel.dispatch.sprint6h', '1');
