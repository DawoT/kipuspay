-- Homologación SUNAT beta — fixture receptor + factura 01 (Rosa Negra).
-- Series AUTHORIZED viven en seed-rosa-negra-staging.sql.
-- No contiene clave SOL ni FEATURE_*=1.

INSERT OR IGNORE INTO customers (
  id, tenant_id, document_type_code, document_number, name, is_active
) VALUES (
  'cust_stg_rn_receptor_001',
  'tenant_stg_rosa_negra_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  1
);

INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, currency,
  total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'sale_stg_rn_beta_01_001',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'session_stg_rn_001',
  'user_stg_rn_owner_001',
  'cust_stg_rn_receptor_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  '01',
  'F001',
  1,
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T12:00:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'PENDING'
);

INSERT OR IGNORE INTO sale_items (
  id, tenant_id, sale_id, product_name, quantity, unit_price_cents,
  subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
  total_amount_cents, is_uncatalogued
) VALUES (
  'item_stg_rn_beta_01_001',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_beta_01_001',
  'Homologacion SUNAT beta',
  1,
  118,
  100,
  '10',
  18,
  0,
  118,
  1
);

INSERT OR IGNORE INTO sale_payments (
  id, tenant_id, sale_id, payment_method_id, amount_cents
) VALUES (
  'pay_stg_rn_beta_01_001',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_beta_01_001',
  'pm-cash',
  118
);

INSERT OR IGNORE INTO fiscal_outbox (
  id, tenant_id, sale_id, status, attempt_count, must_submit_by, r2_xml_key
) VALUES (
  'outbox_stg_rn_beta_01_001',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_beta_01_001',
  'PENDING',
  0,
  '2026-08-25T04:59:59.999Z',
  'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_01_001.xml'
);

UPDATE fiscal_outbox
SET r2_xml_key = 'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_01_001.xml',
    status = 'PENDING'
WHERE id = 'outbox_stg_rn_beta_01_001' AND tenant_id = 'tenant_stg_rosa_negra_001';

UPDATE branch_document_series
SET current_number = CASE WHEN current_number < 1 THEN 1 ELSE current_number END,
    authorization_status = 'AUTHORIZED'
WHERE id = 'series_stg_rn_01' AND tenant_id = 'tenant_stg_rosa_negra_001';
