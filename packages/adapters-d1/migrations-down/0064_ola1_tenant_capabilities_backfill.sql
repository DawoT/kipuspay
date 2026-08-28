-- DOWN 0064 ola1 tenant_capabilities backfill — espejo V-25
-- Borra solo filas marcadas como plan_default, preservando overrides platform (config_json distinto) y filas manuales.
-- Espejo idempotente de up: DELETE WHERE config_json='{"source":"plan_default"}' y capability en la lista backfillada.
-- No toca tenant_data_epochs; los triggers 0035:362-364 siguen vigentes (no se dropean).

DELETE FROM tenant_capabilities
WHERE config_json = '{"source":"plan_default"}'
  AND capability IN (
    'pos.checkout','pos.document_selector','hardware.print_templates','pos.offline_correlative_reserve','display.vitrina',
    'ledger.accounts_receivable','ledger.accounts_payable','purchasing.orders','cash.register_expenses','audit.sensitive_actions','catalog.sellable','auth.cashier_login',
    'owner.mode','owner.offline_rollup','owner.push_alerts',
    'reporting.daily_rollups','reporting.product_rollups','reporting.catalog','reporting.export','reporting.shard_aggregator',
    'cash.blind_z','cash.discount_authz','ledger.credit_limit_cents',
    'inventory.batches','inventory.bom','pricing.lists',
    'pricing.promotions','catalog.variants','catalog.uom','sales.layaway',
    'stock.transfers','purchasing.partial_receive',
    'integrations.catalog_import','payments.qr_wallets','payments.card_acquirer','integrations.accounting_export','integrations.api',
    'messaging.whatsapp_receipt','loyalty.points',
    'sales.returns','purchasing.three_way','ledger.chart_of_accounts',
    'sales.quotes','purchasing.returns','ledger.store_credit','sales.installments','sales.commissions',
    'inventory.locations','inventory.serials','inventory.scale','catalog.price_labels','data.backup',
    'orders.lifecycle','orders.kds','orders.split_bill',
    'orders.customer_orders','sales.recurring','mobile.push','client.mobile_pos',
    'analytics.forecasting','compliance.lpdp','platform.dr','analytics.agentic_insights',
    'catalog.quick_add','sales.quick_line','ops.shift_handoff','ops.team_invite','onboarding.tour','hardware.diagnostics',
    'marketing.site','marketing.vertical_landing','marketing.compare','marketing.claim_gate','marketing.referrals','marketing.content','pos.brand_qr','analytics.growth_metrics'
  );
