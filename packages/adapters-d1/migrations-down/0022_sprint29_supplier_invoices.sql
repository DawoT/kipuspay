DROP INDEX IF EXISTS idx_supplier_invoices_po;
DROP TABLE IF EXISTS supplier_invoice_lines;
DROP TABLE IF EXISTS supplier_invoices;
DROP INDEX IF EXISTS uq_suppliers_tenant_id;
DROP INDEX IF EXISTS uq_purchase_orders_tenant_id;
DROP INDEX IF EXISTS uq_branches_tenant_id;
DELETE FROM schema_meta WHERE key = 'purchasing.three_way.sprint29';
