-- Staff: D1 honesto tras CDR e-beta NC 07 (FC01-11 → F001-9, FC01-13 → F001-12).
-- INSERT, no UPSERT. Sin outbox PENDING (SOAP ya ocurrió). Sin FEATURE_*=1.
-- No reenviar estos correlativos a e-beta.

INSERT INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, currency,
  total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status, sunat_response_code
) VALUES (
  'sale_stg_rn_staff_01_012',
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
  12,
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T16:30:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'ACCEPTED',
  '0'
);

INSERT INTO sale_items (
  id, tenant_id, sale_id, product_name, quantity, unit_price_cents,
  subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
  total_amount_cents, is_uncatalogued
) VALUES (
  'item_stg_rn_staff_01_012',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_staff_01_012',
  'Piloto e-beta F001-12',
  1,
  118,
  100,
  '10',
  18,
  0,
  118,
  1
);

INSERT INTO sale_payments (
  id, tenant_id, sale_id, payment_method_id, amount_cents
) VALUES (
  'pay_stg_rn_staff_01_012',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_staff_01_012',
  'pm-cash',
  118
);

INSERT INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, referenced_sale_id, credit_note_motive_code,
  currency, total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status, sunat_response_code
) VALUES (
  'sale_stg_rn_staff_07_011',
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
  11,
  'sale_stg_rn_worker_01_009',
  '01',
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T23:50:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'ACCEPTED',
  '0'
);

INSERT INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, referenced_sale_id, credit_note_motive_code,
  currency, total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status, sunat_response_code
) VALUES (
  'sale_stg_rn_staff_07_013',
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
  13,
  'sale_stg_rn_staff_01_012',
  '01',
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T23:56:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'ACCEPTED',
  '0'
);

UPDATE branch_document_series
SET current_number = CASE WHEN current_number < 13 THEN 13 ELSE current_number END
WHERE tenant_id = 'tenant_stg_rosa_negra_001' AND id = 'series_stg_rn_07';
