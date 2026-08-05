-- DOWN 0011_fase6_commercial_ops
DROP TABLE IF EXISTS purchase_receipt_lines;
DROP TABLE IF EXISTS purchase_receipts;
DROP TABLE IF EXISTS stock_transfer_lines;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS stock_losses;
DROP TABLE IF EXISTS inventory_count_lines;
DROP TABLE IF EXISTS inventory_counts;
DROP TABLE IF EXISTS branch_stock_policies;
DROP TABLE IF EXISTS sale_reprints;
DROP TABLE IF EXISTS cash_register_cash_movements;
DROP TABLE IF EXISTS tenant_discount_policies;
DROP TABLE IF EXISTS cash_count_lines;
DROP TABLE IF EXISTS authorization_tokens;
DROP TABLE IF EXISTS tenant_capabilities;
-- ALTER COLUMN drops not supported safely; leave session blind cols.
