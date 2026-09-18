#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

export const OPERATIONAL_TENANTS = Object.freeze([
  { key: 'retail', name: 'Bodega Horizonte Retail', vertical: 'retail', plan: 'crece', fuel: false,
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'catalog.variants', 'catalog.uom', 'inventory.batches', 'inventory.locations', 'pricing.lists', 'pricing.promotions', 'purchasing.orders', 'ledger.accounts_payable', 'ledger.accounts_receivable', 'sales.returns', 'sales.quick_line'] },
  { key: 'farmacia', name: 'Farmacia Salud Norte', vertical: 'farmacias', plan: 'enterprise', fuel: false,
    scenarios: ['inventory.fefo'],
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'catalog.variants', 'catalog.uom', 'inventory.batches', 'inventory.locations', 'pricing.lists', 'pricing.promotions', 'purchasing.orders', 'ledger.accounts_payable', 'ledger.accounts_receivable', 'sales.returns', 'sales.quick_line', 'inventory.serials'] },
  { key: 'restaurante', name: 'Cocina Barrio Lima', vertical: 'restaurantes', plan: 'enterprise', fuel: false,
    scenarios: ['orders.kds_replay'],
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'pricing.lists', 'pricing.promotions', 'orders.lifecycle', 'orders.kds', 'orders.split_bill', 'sales.quick_line'] },
  { key: 'servicios', name: 'Servicios Andinos', vertical: 'servicios', plan: 'enterprise', fuel: false,
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'pricing.lists', 'sales.quotes', 'sales.recurring', 'orders.lifecycle', 'sales.quick_line'] },
  { key: 'cadena', name: 'Mercados Costa Norte', vertical: 'cadenas', plan: 'enterprise', fuel: false,
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'catalog.variants', 'catalog.uom', 'inventory.batches', 'inventory.locations', 'inventory.serials', 'pricing.lists', 'pricing.promotions', 'purchasing.orders', 'purchasing.partial_receive', 'purchasing.three_way', 'ledger.accounts_payable', 'ledger.accounts_receivable', 'ledger.chart_of_accounts', 'sales.returns', 'sales.layaway', 'sales.installments', 'stock.transfers', 'sales.quick_line'] },
  { key: 'grifos', name: 'Grifo Ruta Sur', vertical: 'grifos', plan: 'enterprise', fuel: true,
    capabilities: ['auth.cashier_login', 'pos.checkout', 'pos.document_selector', 'catalog.sellable', 'pricing.lists', 'cash.blind_z', 'ops.shift_handoff', 'fuel.dispatch', 'fuel.island_shift', 'sales.quick_line'] },
]);

export const TEST_PIN_HASH = '$argon2id$v=19$m=4096,t=1,p=1$UEN1ckQzbnJTdFRJZTdLSFY5cUV0Zz09$dt5HqSiKTd555qrj0ELmtpFKfMOtNGvyCN6nQ5S8oCQ';

export const PHARMACY_FEFO_SCENARIO = Object.freeze({
  asOfDate: '2026-09-16',
  valid: Object.freeze({
    stock: 7,
    stockMicrounits: 7_000_000,
    batches: Object.freeze([
      Object.freeze({ idSuffix: 'fefo_batch_early', batchNumber: 'FEFO-EARLY', expirationDate: '2098-10-01', stock: 2 }),
      Object.freeze({ idSuffix: 'fefo_batch_late', batchNumber: 'FEFO-LATE', expirationDate: '2099-02-01', stock: 5 }),
    ]),
  }),
  expired: Object.freeze({
    stock: 3,
    stockMicrounits: 3_000_000,
    batch: Object.freeze({ idSuffix: 'expired_batch', batchNumber: 'EXPIRED-ONLY', expirationDate: '2000-08-01', stock: 3 }),
  }),
});

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = (parts) => parts.filter(Boolean).join('\n');

function tenantSql(t, index) {
  const id = `seed_${t.key}`;
  const branch = `${id}_branch`;
  const register = `${id}_register`;
  const owner = `${id}_owner`;
  const cashier = `${id}_cashier`;
  const session = `${id}_cashier_session`;
  const product = `${id}_product`;
  const variant = `${id}_variant`;
  const batch = `${id}_batch`;
  const location = `loc-default:${id}:${branch}`;
  const customer = `${id}_customer`;
  const supplier = `${id}_supplier`;
  const po = `${id}_po`;
  const sale = `${id}_sale`;
  const tax = `${id}_igv`;
  const priceList = `${id}_prices`;
  const promo = `${id}_promo`;
  const ownerPermissions = t.key === 'servicios' ? '["sales.recurring.manage"]' : '[]';
  const chainDestination = t.key === 'cadena' ? sql([
    `INSERT OR IGNORE INTO branches (id, tenant_id, code, name, address, is_active) VALUES (${q(`${id}_branch_2`)}, ${q(id)}, '0002', 'Local destino', 'Av. Prueba 456, Lima', 1);`,
    `INSERT OR IGNORE INTO inventory_locations (id, tenant_id, branch_id, code, name, is_active) VALUES (${q(`loc-default:${id}:${id}_branch_2`)}, ${q(id)}, ${q(`${id}_branch_2`)}, 'DEFAULT', 'Almacén principal', 1);`,
  ]) : '';
  const recurring = t.key === 'servicios' ? sql([
    `INSERT OR IGNORE INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, stock_microunits, is_sellable, allow_negative_stock, igv_affectation_code_default, serial_tracking_mode) VALUES (${q(`${id}_service`)}, ${q(id)}, 'SKU-${t.key}-SVC', 'Mantenimiento mensual', 'service', 'ZZ', 5000, 0, 0, 0, 1, 0, '10', 'NONE');`,
    `INSERT OR IGNORE INTO product_uoms (id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base) VALUES (${q(`${id}_service_uom`)}, ${q(id)}, ${q(`${id}_service`)}, 'ZZ', 1, 1, 1);`,
    `INSERT OR IGNORE INTO recurring_plans (id, tenant_id, plan_key, plan_version, customer_id, branch_id, created_by_user_id, document_type, pricing_policy, frequency, anchor_day, anchor_time, next_run_at, effective_from) VALUES (${q(`${id}_recurring`)}, ${q(id)}, 'mantenimiento-mensual', 1, ${q(customer)}, ${q(branch)}, ${q(owner)}, 'NV', 'FIXED', 'MONTHLY', 1, '09:00:00', '2099-01-01T09:00:00-05:00', '2026-09-16T00:00:00-05:00');`,
    `INSERT OR IGNORE INTO recurring_plan_items (id, tenant_id, plan_id, line_number, product_id, product_uom_id, entered_quantity_microunits, factor_numerator, factor_denominator, base_quantity_microunits, fixed_unit_price_cents) VALUES (${q(`${id}_recurring_item`)}, ${q(id)}, ${q(`${id}_recurring`)}, 1, ${q(`${id}_service`)}, ${q(`${id}_service_uom`)}, 1000000, 1, 1, 1000000, 5000);`,
  ]) : '';
  const capRows = t.capabilities.map((cap) => {
    const config = cap === 'inventory.batches' ? { mode: 'fefo', source: 'operational_seed' }
      : cap === 'fuel.dispatch' ? { priceCentsPerGallon: 1450, igvRateBps: 1800, detractionRateBps: 0, stockMicrounits: 250000000, source: 'operational_seed' }
      : { source: 'operational_seed' };
    return `INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (${q(id)}, ${q(cap)}, 1, ${q(JSON.stringify(config))});`;
  }).join('\n');
  const fuel = t.fuel ? sql([
    `INSERT OR IGNORE INTO fuel_catalog (tenant_id, code, name, price_cents_per_gallon, igv_rate_bps, detraction_rate_bps, stock_microunits, active) VALUES (${q(id)}, 'GAS95', 'Gasohol Regular 95', 1450, 1800, 0, 249000000, 1);`,
    `INSERT OR IGNORE INTO fuel_dispatches (dispatch_id, tenant_id, idempotency_key, fuel_code, island_id, nozzle_id, plate, fleet_id, meter_reading_microunits, volume_microunits, price_cents_per_gallon, subtotal_cents, igv_cents, total_cents, detraction_cents, document_type, business_invoice, payment_method, sale_id, actor_user_id) VALUES (${q(`${id}_dispatch`)}, ${q(id)}, ${q(`${id}_dispatch_once`)}, 'GAS95', 'island-01', 'nozzle-01', 'ABC-123', 'fleet-demo', 100000000, 1000000, 1450, 1450, 261, 1711, 0, 'NV', 0, 'cash', ${q(sale)}, ${q(owner)});`,
  ]) : '';
  const fefo = t.scenarios?.includes('inventory.fefo') ? sql([
    `INSERT OR IGNORE INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, stock_microunits, is_sellable, allow_negative_stock, igv_affectation_code_default, serial_tracking_mode) VALUES (${q(`${id}_fefo_product`)}, ${q(id)}, 'SKU-${t.key}-FEFO', 'Medicamento FEFO', 'physical', 'NIU', 2360, 1400, ${PHARMACY_FEFO_SCENARIO.valid.stock}, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits}, 1, 0, '10', 'NONE');`,
    `INSERT OR IGNORE INTO product_taxes (id, tenant_id, product_id, tax_id) VALUES (${q(`${id}_fefo_product_tax`)}, ${q(id)}, ${q(`${id}_fefo_product`)}, ${q(tax)});`,
    `INSERT OR IGNORE INTO product_prices (id, tenant_id, price_list_id, product_id, price_cents) VALUES (${q(`${id}_fefo_price`)}, ${q(id)}, ${q(priceList)}, ${q(`${id}_fefo_product`)}, 2360);`,
    `INSERT OR IGNORE INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents) VALUES (${q(id)}, ${q(branch)}, ${q(`${id}_fefo_product`)}, ${PHARMACY_FEFO_SCENARIO.valid.stock}, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits}, 1400);`,
    `INSERT OR IGNORE INTO inventory_location_stock (tenant_id, branch_id, location_id, product_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(`${id}_fefo_product`)}, ${PHARMACY_FEFO_SCENARIO.valid.stockMicrounits});`,
    ...PHARMACY_FEFO_SCENARIO.valid.batches.map((batchRow) => `INSERT OR IGNORE INTO inventory_batches (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits, is_active) VALUES (${q(`${id}_${batchRow.idSuffix}`)}, ${q(id)}, ${q(branch)}, ${q(`${id}_fefo_product`)}, ${q(batchRow.batchNumber)}, ${q(batchRow.expirationDate)}, ${batchRow.stock}, ${batchRow.stock * 1000000}, 1);`),
    ...PHARMACY_FEFO_SCENARIO.valid.batches.map((batchRow) => `INSERT OR IGNORE INTO inventory_location_batch_stock (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(`${id}_fefo_product`)}, ${q(`${id}_${batchRow.idSuffix}`)}, ${batchRow.stock * 1000000});`),
    `INSERT OR IGNORE INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, stock_microunits, is_sellable, allow_negative_stock, igv_affectation_code_default, serial_tracking_mode) VALUES (${q(`${id}_expired_product`)}, ${q(id)}, 'SKU-${t.key}-EXPIRED', 'Medicamento vencido para bloqueo de prueba', 'physical', 'NIU', 1180, 700, ${PHARMACY_FEFO_SCENARIO.expired.stock}, ${PHARMACY_FEFO_SCENARIO.expired.stockMicrounits}, 1, 0, '10', 'NONE');`,
    `INSERT OR IGNORE INTO product_taxes (id, tenant_id, product_id, tax_id) VALUES (${q(`${id}_expired_product_tax`)}, ${q(id)}, ${q(`${id}_expired_product`)}, ${q(tax)});`,
    `INSERT OR IGNORE INTO product_prices (id, tenant_id, price_list_id, product_id, price_cents) VALUES (${q(`${id}_expired_price`)}, ${q(id)}, ${q(priceList)}, ${q(`${id}_expired_product`)}, 1180);`,
    `INSERT OR IGNORE INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents) VALUES (${q(id)}, ${q(branch)}, ${q(`${id}_expired_product`)}, ${PHARMACY_FEFO_SCENARIO.expired.stock}, ${PHARMACY_FEFO_SCENARIO.expired.stockMicrounits}, 700);`,
    `INSERT OR IGNORE INTO inventory_location_stock (tenant_id, branch_id, location_id, product_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(`${id}_expired_product`)}, ${PHARMACY_FEFO_SCENARIO.expired.stockMicrounits});`,
    `INSERT OR IGNORE INTO inventory_batches (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits, is_active) VALUES (${q(`${id}_${PHARMACY_FEFO_SCENARIO.expired.batch.idSuffix}`)}, ${q(id)}, ${q(branch)}, ${q(`${id}_expired_product`)}, ${q(PHARMACY_FEFO_SCENARIO.expired.batch.batchNumber)}, ${q(PHARMACY_FEFO_SCENARIO.expired.batch.expirationDate)}, ${PHARMACY_FEFO_SCENARIO.expired.batch.stock}, ${PHARMACY_FEFO_SCENARIO.expired.batch.stock * 1000000}, 1);`,
    `INSERT OR IGNORE INTO inventory_location_batch_stock (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(`${id}_expired_product`)}, ${q(`${id}_${PHARMACY_FEFO_SCENARIO.expired.batch.idSuffix}`)}, ${PHARMACY_FEFO_SCENARIO.expired.batch.stock * 1000000});`,
  ]) : '';
  const kdsReplay = t.scenarios?.includes('orders.kds_replay') ? sql([
    `INSERT OR IGNORE INTO orders (id, tenant_id, branch_id, table_label, status, opened_by_user_id) VALUES (${q(`${id}_kds_order`)}, ${q(id)}, ${q(branch)}, '4', 'FIRED', ${q(owner)});`,
    `INSERT OR IGNORE INTO order_items (id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status) VALUES (${q(`${id}_kds_item`)}, ${q(id)}, ${q(`${id}_kds_order`)}, ${q(product)}, ${q(`Producto ${t.key}`)}, 1, 1000000, 1180, 'FIRED');`,
  ]) : '';
  return sql([
    `-- Operational seed: ${id} (${t.vertical}); synthetic local data only.`,
    `INSERT OR IGNORE INTO tenants (id, ruc, business_name, trade_name, address, vertical_type, tax_regime, formalization_mode, pse_mode, enabled_document_types, plan_id, subscription_status, is_active) VALUES (${q(id)}, ${q(`20${String(index + 1).padStart(2, '0')}1234567`)}, ${q(t.name)}, ${q(t.name)}, 'Av. Prueba 123, Lima', ${q(t.vertical)}, 'RG', 'INTERNAL_CONTROL', 'KIPUSPAY_PSE', '["NV","01","03","07","08"]', ${q(t.plan)}, 'active', 1);`,
    `INSERT OR IGNORE INTO tenant_data_epochs (tenant_id, epoch) VALUES (${q(id)}, 0);`,
    `INSERT OR IGNORE INTO branches (id, tenant_id, code, name, address, is_active) VALUES (${q(branch)}, ${q(id)}, '0001', 'Local principal', 'Av. Prueba 123, Lima', 1);`,
    chainDestination,
    `INSERT OR IGNORE INTO cash_registers (id, tenant_id, branch_id, name, is_active) VALUES (${q(register)}, ${q(id)}, ${q(branch)}, 'Caja principal', 1);`,
    `INSERT OR IGNORE INTO users (id, tenant_id, branch_id, email, role, permissions, pin_hash, is_active) VALUES (${q(owner)}, ${q(id)}, ${q(branch)}, ${q(`${id}.owner@example.invalid`)}, 'owner', ${q(ownerPermissions)}, ${q(TEST_PIN_HASH)}, 1);`,
    `INSERT OR IGNORE INTO users (id, tenant_id, branch_id, email, role, permissions, pin_hash, is_active) VALUES (${q(cashier)}, ${q(id)}, ${q(branch)}, ${q(`${id}.cashier@example.invalid`)}, 'cashier', '[]', ${q(TEST_PIN_HASH)}, 1);`,
    `INSERT OR IGNORE INTO cash_register_sessions (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status) VALUES (${q(`${id}_owner_session`)}, ${q(id)}, ${q(branch)}, ${q(register)}, ${q(owner)}, 50000, 'OPEN');`,
    `INSERT OR IGNORE INTO cash_register_sessions (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status) VALUES (${q(session)}, ${q(id)}, ${q(branch)}, ${q(register)}, ${q(cashier)}, 50000, 'OPEN');`,
    `INSERT OR IGNORE INTO branch_document_series (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status, is_active) VALUES (${q(`${id}_nv`)}, ${q(id)}, ${q(branch)}, 'NV', 'NV01', 1, 'INTERNAL', 1);`,
    `INSERT OR IGNORE INTO payment_methods (id, tenant_id, code, name, is_active) VALUES ('pm-cash', ${q(id)}, 'cash', 'Efectivo', 1);`,
    `INSERT OR IGNORE INTO payment_methods (id, tenant_id, code, name, is_active) VALUES (${q(`${id}_cash`)}, ${q(id)}, 'cash', 'Efectivo', 1);`,
    `INSERT OR IGNORE INTO payment_methods (id, tenant_id, code, name, is_active) VALUES (${q(`${id}_qr`)}, ${q(id)}, 'qr', 'QR prueba', 1);`,
    `INSERT OR IGNORE INTO taxes (id, tenant_id, code, name, rate_percentage, is_flat_fee, flat_fee_amount_cents, is_active) VALUES (${q(tax)}, ${q(id)}, '1000', 'IGV', 18, 0, 0, 1);`,
    `INSERT OR IGNORE INTO products (id, tenant_id, sku, barcode, name, product_type, unit_code, price_cents, cost_cents, stock, stock_microunits, is_sellable, allow_negative_stock, igv_affectation_code_default, serial_tracking_mode) VALUES (${q(product)}, ${q(id)}, ${q(`SKU-${t.key}-001`)}, ${q(`775000000${String(t.key.length).padStart(2, '0')}`)}, ${q(`Producto ${t.key}`)}, 'physical', 'NIU', 1180, 700, 23, 23000000, 1, 0, '10', 'NONE');`,
    `INSERT OR IGNORE INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, stock_microunits, is_sellable, allow_negative_stock, igv_affectation_code_default, parent_product_id, serial_tracking_mode) VALUES (${q(variant)}, ${q(id)}, ${q(`SKU-${t.key}-002`)}, ${q(`Variante ${t.key}`)}, 'physical', 'NIU', 1590, 900, 6, 6000000, 1, 0, '10', ${q(product)}, 'NONE');`,
    `INSERT OR IGNORE INTO product_taxes (id, tenant_id, product_id, tax_id) VALUES (${q(`${id}_product_tax`)}, ${q(id)}, ${q(product)}, ${q(tax)});`,
    `INSERT OR IGNORE INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents) VALUES (${q(id)}, ${q(branch)}, ${q(product)}, 23, 23000000, 700);`,
    `INSERT OR IGNORE INTO branch_product_stock (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents) VALUES (${q(id)}, ${q(branch)}, ${q(variant)}, 6, 6000000, 900);`,
    `INSERT OR IGNORE INTO inventory_locations (id, tenant_id, branch_id, code, name, is_active) VALUES (${q(location)}, ${q(id)}, ${q(branch)}, 'DEFAULT', 'Almacén principal', 1);`,
    `INSERT OR IGNORE INTO inventory_location_stock (tenant_id, branch_id, location_id, product_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(product)}, 23000000);`,
    `INSERT OR IGNORE INTO inventory_batches (id, tenant_id, branch_id, product_id, batch_number, expiration_date, stock, stock_microunits, is_active) VALUES (${q(batch)}, ${q(id)}, ${q(branch)}, ${q(product)}, 'LOT-${t.key}-001', '2027-12-31', 23, 23000000, 1);`,
    `INSERT OR IGNORE INTO inventory_location_batch_stock (tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits) VALUES (${q(id)}, ${q(branch)}, ${q(location)}, ${q(product)}, ${q(batch)}, 23000000);`,
    `INSERT OR IGNORE INTO inventory_movements (id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta, unit_cost_cents, stock_after, user_id, reference_id, location_id) VALUES (${q(`${id}_in`)}, ${q(id)}, ${q(branch)}, ${q(product)}, ${q(batch)}, 'COMPRA', 24, 700, 24, ${q(owner)}, ${q(`${id}_opening`)}, ${q(location)});`,
    `INSERT OR IGNORE INTO inventory_movements (id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta, unit_cost_cents, stock_after, user_id, reference_id, location_id) VALUES (${q(`${id}_sale_out`)}, ${q(id)}, ${q(branch)}, ${q(product)}, ${q(batch)}, 'VENTA', -1, 700, 23, ${q(owner)}, ${q(`${id}_sale`)}, ${q(location)});`,
    `INSERT OR IGNORE INTO customers (id, tenant_id, document_type_code, document_number, name, email, credit_limit_cents, is_active) VALUES (${q(customer)}, ${q(id)}, '1', '70000001', 'Cliente prueba ${t.key}', ${q(`${id}.customer@example.invalid`)}, 100000, 1);`,
    `INSERT OR IGNORE INTO suppliers (id, tenant_id, ruc, business_name, payment_terms_days, is_active) VALUES (${q(supplier)}, ${q(id)}, '20123456789', 'Proveedor Prueba SAC', 30, 1);`,
    `INSERT OR IGNORE INTO purchase_orders (id, tenant_id, branch_id, supplier_id, status, total_amount_cents, currency_code, created_by_user_id) VALUES (${q(po)}, ${q(id)}, ${q(branch)}, ${q(supplier)}, 'RECEIVED', 8400, 'PEN', ${q(owner)});`,
    `INSERT OR IGNORE INTO purchase_order_items (id, purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost_cents) VALUES (${q(`${id}_po_item`)}, ${q(po)}, ${q(product)}, 12, 12, 700);`,
    `INSERT OR IGNORE INTO accounts_payable (id, tenant_id, supplier_id, purchase_order_id, original_amount_cents, balance_due_cents, due_date, status) VALUES (${q(`${id}_ap`)}, ${q(id)}, ${q(supplier)}, ${q(po)}, 8400, 8400, '2026-10-15T00:00:00Z', 'OPEN');`,
    `INSERT OR IGNORE INTO price_lists (id, tenant_id, name, is_default, is_active) VALUES (${q(priceList)}, ${q(id)}, 'Precio público', 1, 1);`,
    `INSERT OR IGNORE INTO product_prices (id, tenant_id, price_list_id, product_id, price_cents) VALUES (${q(`${id}_price`)}, ${q(id)}, ${q(priceList)}, ${q(product)}, 1180);`,
    `INSERT OR IGNORE INTO promotions (id, tenant_id, name, active, starts_at, ends_at, applies_to, rule_json, created_by_user_id) VALUES (${q(promo)}, ${q(id)}, 'Promo prueba 10%', 1, '2026-01-01', '2027-12-31', 'PRODUCT', '{"type":"PERCENT","value":10}', ${q(owner)});`,
    `INSERT OR IGNORE INTO product_promotions (id, tenant_id, promotion_id, product_id) VALUES (${q(`${id}_product_promo`)}, ${q(id)}, ${q(promo)}, ${q(product)});`,
    capRows,
    `INSERT OR IGNORE INTO sales (id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id, client_document_type, client_document_number, client_name, document_type, series, number, currency, total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents, issued_at_lima, void_status, sunat_status, offline_client_sale_id) VALUES (${q(sale)}, ${q(id)}, ${q(branch)}, ${q(session)}, ${q(owner)}, ${q(customer)}, '1', '70000001', 'Cliente prueba ${t.key}', 'NV', 'NV01', 1, 'PEN', 1000, 180, 0, 1180, '2026-09-16T10:00:00', 'NONE', 'NOT_APPLICABLE', ${q(`${id}_offline_001`)});`,
    `INSERT OR IGNORE INTO sale_items (id, tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price_cents, unit_cost_cents, subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id, is_uncatalogued) VALUES (${q(`${id}_sale_item`)}, ${q(id)}, ${q(sale)}, ${q(product)}, ${q(`Producto ${t.key}`)}, 'physical', 1, 1180, 700, 1000, '10', 180, 0, 1180, ${q(batch)}, 0);`,
    `INSERT OR IGNORE INTO sale_payments (id, tenant_id, sale_id, payment_method_id, amount_cents) VALUES (${q(`${id}_sale_payment`)}, ${q(id)}, ${q(sale)}, ${q(`${id}_cash`)}, 1180);`,
    fefo,
    kdsReplay,
    fuel,
    recurring,
  ]);
}

export function buildOperationalSeedSql() {
  return `${OPERATIONAL_TENANTS.map(tenantSql).join('\n\n')}\n`;
}

export function buildTenantCapabilitySnapshots() {
  return OPERATIONAL_TENANTS.map((tenant) => {
    const id = `seed_${tenant.key}`;
    const payload = {
      id,
      status: 'active',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      pastGracePeriod: false,
      plan_id: tenant.plan,
      planId: tenant.plan,
      business_name: tenant.name,
      trade_name: tenant.name,
      vertical_type: tenant.vertical,
    };
    return {
      tenant: tenant.key,
      key: `tenant:${id}`,
      value: JSON.stringify(payload),
      capabilities: [...tenant.capabilities],
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = process.argv[2] ?? 'tmp-staff/operational-seed.sql';
  await writeFile(output, buildOperationalSeedSql(), 'utf8');
  console.log(`generated ${output}`);
}
