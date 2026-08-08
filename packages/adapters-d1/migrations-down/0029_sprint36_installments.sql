DROP INDEX IF EXISTS idx_sale_installment_payments_inst;
DROP INDEX IF EXISTS idx_sale_installments_status;
DROP INDEX IF EXISTS idx_sale_installments_sale;
DROP TABLE IF EXISTS sale_installment_payments;
DROP TABLE IF EXISTS sale_installments;
DELETE FROM schema_meta WHERE key = 'sales.installments.sprint36';
