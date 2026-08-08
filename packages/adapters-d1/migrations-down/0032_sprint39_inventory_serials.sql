-- Fail closed: no identity is collapsed while leased, non-AVAILABLE, or drifted.
INSERT INTO atomic_guards(id, ok) SELECT 'inventory.serials.sprint39.down', CASE WHEN EXISTS (SELECT 1 FROM serial_terminal_leases WHERE status = 'ACTIVE') OR EXISTS (SELECT 1 FROM serial_numbers WHERE status <> 'AVAILABLE' OR current_sale_item_id IS NOT NULL) OR EXISTS (SELECT 1 FROM inventory_location_stock stock JOIN products product ON product.tenant_id = stock.tenant_id AND product.id = stock.product_id AND product.serial_tracking_mode = 'REQUIRED' LEFT JOIN serial_numbers serial ON serial.tenant_id = stock.tenant_id AND serial.branch_id = stock.branch_id AND serial.location_id = stock.location_id AND serial.product_id = stock.product_id GROUP BY stock.tenant_id, stock.branch_id, stock.location_id, stock.product_id, stock.quantity_microunits HAVING stock.quantity_microunits <> COUNT(serial.id) * 1000000) OR EXISTS (SELECT 1 FROM serial_numbers serial LEFT JOIN inventory_location_stock stock ON stock.tenant_id = serial.tenant_id AND stock.branch_id = serial.branch_id AND stock.location_id = serial.location_id AND stock.product_id = serial.product_id WHERE stock.product_id IS NULL) THEN 0 ELSE 1 END;

DROP TRIGGER IF EXISTS serial_number_events_no_delete;
DROP TRIGGER IF EXISTS serial_number_events_no_update;
DROP INDEX IF EXISTS idx_serial_manifest_items_serial;
DROP INDEX IF EXISTS idx_serial_manifest_operation;
DROP INDEX IF EXISTS idx_serial_leases_terminal;
DROP INDEX IF EXISTS idx_serial_events_history;
DROP INDEX IF EXISTS idx_serial_numbers_stock;
DROP INDEX IF EXISTS idx_serial_numbers_lookup;
DROP TABLE IF EXISTS serial_manifest_items;
DROP TABLE IF EXISTS serial_manifests;
DROP TABLE IF EXISTS serial_terminal_leases;
DROP TABLE IF EXISTS serial_number_events;
DROP TABLE IF EXISTS serial_numbers;
DROP INDEX IF EXISTS uq_pos_terminals_tenant_id;
DROP INDEX IF EXISTS uq_purchase_receipt_lines_tenant_id;
DROP INDEX IF EXISTS uq_sale_items_tenant_id;
ALTER TABLE products DROP COLUMN serial_tracking_mode;
DELETE FROM schema_meta WHERE key = 'inventory.serials.sprint39';
DELETE FROM atomic_guards WHERE id = 'inventory.serials.sprint39.down';
