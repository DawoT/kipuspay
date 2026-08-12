-- Sprint 50 — catalog.quick_add + sales.quick_line (Arquitectura §5.3 regla 34).
-- Infra del lector compartido (regla 34/36): badge del vendedor (EMP- reservado)
-- y upsert de producto por barcode sin duplicar.
ALTER TABLE users ADD COLUMN badge_barcode TEXT;
CREATE UNIQUE INDEX uq_users_badge_barcode
  ON users(tenant_id, badge_barcode) WHERE badge_barcode IS NOT NULL;

-- El espacio EAN-13/UPC de productos jamás puede contener badges EMP- (edge 1A):
-- índice único por tenant que excluye el prefijo reservado del namespace vendedor.
CREATE UNIQUE INDEX uq_products_barcode_tenant
  ON products(tenant_id, barcode) WHERE barcode IS NOT NULL AND barcode NOT LIKE 'EMP-%';

INSERT INTO schema_meta(key, value)
VALUES ('catalog.quick_add.sprint50', '1');
