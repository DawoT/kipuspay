DROP INDEX IF EXISTS idx_commission_payouts_seller;
DROP INDEX IF EXISTS idx_commission_accruals_seller;
DROP INDEX IF EXISTS idx_commission_accruals_sale;
DROP INDEX IF EXISTS idx_commission_rates_seller;
DROP TABLE IF EXISTS commission_accruals;
DROP TABLE IF EXISTS commission_payouts;
DROP TABLE IF EXISTS commission_rates;
DELETE FROM schema_meta WHERE key = 'sales.commissions.sprint37';
