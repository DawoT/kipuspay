DROP INDEX IF EXISTS idx_supplier_return_items_return;
DROP INDEX IF EXISTS idx_supplier_returns_tenant_status;
DROP TABLE IF EXISTS supplier_return_items;
DROP TABLE IF EXISTS supplier_returns;
DROP INDEX IF EXISTS uq_purchase_receipts_tenant_id;
DELETE FROM schema_meta WHERE key = 'purchasing.returns.sprint34';
