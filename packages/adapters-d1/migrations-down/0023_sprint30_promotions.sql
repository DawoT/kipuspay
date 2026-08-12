DROP INDEX IF EXISTS idx_product_promotions_promo;
DROP TABLE IF EXISTS product_promotions;
DROP INDEX IF EXISTS idx_promotions_tenant_active;
DROP INDEX IF EXISTS uq_promotions_tenant_id;
DROP TABLE IF EXISTS promotions;
DROP INDEX IF EXISTS uq_price_lists_tenant_id;
DROP INDEX IF EXISTS uq_products_tenant_id;
DELETE FROM schema_meta WHERE key = 'pricing.promotions.sprint30';
