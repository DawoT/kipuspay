-- Homologación — NC 07 y ND 08 sobre factura sale_stg_rn_beta_01_001.
-- Aplicar SOLO si esa factura tiene sunat_status=ACCEPTED (CDR). Nunca antes.

INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, referenced_sale_id, credit_note_motive_code,
  currency, total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'sale_stg_rn_beta_07_001',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'session_stg_rn_001',
  'user_stg_rn_owner_001',
  'cust_stg_rn_receptor_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  '07',
  'FC01',
  1,
  'sale_stg_rn_beta_01_001',
  '01',
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T13:00:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'PENDING'
);

INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, referenced_sale_id, credit_note_motive_code,
  currency, total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'sale_stg_rn_beta_08_001',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'session_stg_rn_001',
  'user_stg_rn_owner_001',
  'cust_stg_rn_receptor_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  '08',
  'FD01',
  1,
  'sale_stg_rn_beta_01_001',
  '01',
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T13:10:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'PENDING'
);

INSERT OR IGNORE INTO fiscal_outbox (
  id, tenant_id, sale_id, status, attempt_count, must_submit_by, r2_xml_key
) VALUES
  ('outbox_stg_rn_beta_07_001', 'tenant_stg_rosa_negra_001', 'sale_stg_rn_beta_07_001', 'PENDING', 0, '2026-08-25T04:59:59.999Z', 'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_07_001.xml'),
  ('outbox_stg_rn_beta_08_001', 'tenant_stg_rosa_negra_001', 'sale_stg_rn_beta_08_001', 'PENDING', 0, '2026-08-24T00:00:00.000Z', 'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_08_001.xml');

UPDATE fiscal_outbox
SET r2_xml_key = 'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_07_001.xml',
    status = 'PENDING', last_error = NULL, attempt_count = 0
WHERE id = 'outbox_stg_rn_beta_07_001' AND tenant_id = 'tenant_stg_rosa_negra_001';

UPDATE fiscal_outbox
SET r2_xml_key = 'fiscal-xml/tenant_stg_rosa_negra_001/sale_stg_rn_beta_08_001.xml',
    status = 'PENDING', last_error = NULL, attempt_count = 0,
    must_submit_by = '2026-08-24T00:00:00.000Z'
WHERE id = 'outbox_stg_rn_beta_08_001' AND tenant_id = 'tenant_stg_rosa_negra_001';

UPDATE branch_document_series
SET current_number = CASE WHEN current_number < 1 THEN 1 ELSE current_number END,
    authorization_status = 'AUTHORIZED'
WHERE tenant_id = 'tenant_stg_rosa_negra_001'
  AND id IN ('series_stg_rn_07', 'series_stg_rn_08');
