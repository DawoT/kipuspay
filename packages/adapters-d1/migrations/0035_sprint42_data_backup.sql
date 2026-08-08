-- Generated canonical Sprint 42 backup schema (ADR-0026 / DAT-12).
CREATE TABLE data_backups (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  format_version TEXT NOT NULL, registry_version TEXT NOT NULL, schema_version TEXT NOT NULL,
  snapshot_epoch INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', global_hash TEXT,
  plaintext_size_bytes INTEGER, ciphertext_size_bytes INTEGER, chunk_count INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0, wrapped_dek BLOB, kek_version TEXT, manifest_r2_key TEXT,
  multipart_upload_ref TEXT, error_code TEXT, error_ref TEXT, created_by_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ready_at DATETIME, expires_at DATETIME,
  deleted_at DATETIME, UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  CHECK (format_version = 'KPBK1'),
  CHECK (status IN ('PENDING','SNAPSHOTTING','UPLOADING','READY','FAILED','DELETING','DELETED')),
  CHECK (snapshot_epoch >= 0), CHECK (chunk_count >= 0 AND object_count >= 0),
  CHECK (plaintext_size_bytes IS NULL OR plaintext_size_bytes >= 0),
  CHECK (ciphertext_size_bytes IS NULL OR ciphertext_size_bytes >= 0),
  CHECK (global_hash IS NULL OR (length(global_hash) = 64 AND global_hash NOT GLOB '*[^0-9a-f]*')),
  CHECK ((status = 'READY' AND global_hash IS NOT NULL AND wrapped_dek IS NOT NULL AND kek_version IS NOT NULL AND manifest_r2_key IS NOT NULL AND ready_at IS NOT NULL) OR status <> 'READY'),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE data_backup_chunks (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  table_name TEXT NOT NULL, ordinal INTEGER NOT NULL, row_count INTEGER NOT NULL,
  plaintext_size_bytes INTEGER NOT NULL, ciphertext_size_bytes INTEGER NOT NULL,
  plaintext_hash TEXT NOT NULL, ciphertext_hash TEXT NOT NULL, nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL, r2_key TEXT NOT NULL, multipart_part_ref TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, backup_id, table_name, ordinal), UNIQUE (tenant_id, backup_id, nonce),
  CHECK (ordinal >= 0 AND row_count >= 0), CHECK (plaintext_size_bytes BETWEEN 0 AND 4194304),
  CHECK (ciphertext_size_bytes >= 0),
  CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
  CHECK (length(nonce) = 12), CHECK (length(auth_tag) = 16),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE data_backup_objects (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL, source_r2_key TEXT NOT NULL, backup_r2_key TEXT NOT NULL,
  source_etag TEXT, plaintext_size_bytes INTEGER NOT NULL, ciphertext_size_bytes INTEGER NOT NULL,
  plaintext_hash TEXT NOT NULL, ciphertext_hash TEXT NOT NULL, nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, backup_id, ordinal),
  UNIQUE (tenant_id, backup_id, source_r2_key), UNIQUE (tenant_id, backup_id, nonce),
  CHECK (ordinal >= 0 AND plaintext_size_bytes >= 0 AND ciphertext_size_bytes >= 0),
  CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
  CHECK (length(nonce) = 12), CHECK (length(auth_tag) = 16),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE data_backup_table_manifests (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  table_name TEXT NOT NULL, classification TEXT NOT NULL, pk_json TEXT NOT NULL,
  columns_json TEXT NOT NULL, row_count INTEGER NOT NULL, plaintext_size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL, table_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, backup_id, table_name), CHECK (classification = 'BUSINESS'),
  CHECK (row_count >= 0 AND plaintext_size_bytes >= 0 AND chunk_count >= 0),
  CHECK (length(table_hash) = 64),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE restore_dry_runs (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  source_global_hash TEXT, diff_hash TEXT, diff_r2_key TEXT,
  insert_count INTEGER NOT NULL DEFAULT 0, update_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0, missing_object_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT, error_ref TEXT, requested_by_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  CHECK (status IN ('PENDING','RUNNING','PASSED','FAILED')),
  CHECK (insert_count >= 0 AND update_count >= 0 AND conflict_count >= 0 AND missing_object_count >= 0),
  CHECK (source_global_hash IS NULL OR length(source_global_hash) = 64),
  CHECK (diff_hash IS NULL OR length(diff_hash) = 64),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id),
  FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE tenant_data_epochs (
  tenant_id TEXT PRIMARY KEY NOT NULL, epoch INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (epoch >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
ALTER TABLE authorization_tokens ADD COLUMN backup_id TEXT;
CREATE INDEX idx_authorization_tokens_backup_scope
  ON authorization_tokens(tenant_id, backup_id, token_hash, expires_at)
  WHERE used_at IS NULL;
CREATE INDEX idx_data_backups_lifecycle ON data_backups(tenant_id, status, created_at);
CREATE INDEX idx_data_backups_expiry ON data_backups(status, expires_at);
CREATE INDEX idx_backup_chunks_backup ON data_backup_chunks(tenant_id, backup_id, table_name, ordinal);
CREATE INDEX idx_backup_objects_backup ON data_backup_objects(tenant_id, backup_id, ordinal);
CREATE INDEX idx_restore_dry_runs_backup ON restore_dry_runs(tenant_id, backup_id, created_at);
CREATE TRIGGER backup_epoch_tenants_insert AFTER INSERT ON tenants BEGIN
  INSERT OR IGNORE INTO tenant_data_epochs(tenant_id, epoch) VALUES (NEW.id, 0);
END;
CREATE TRIGGER backup_manifests_ready_no_update BEFORE UPDATE ON data_backup_table_manifests
WHEN EXISTS (SELECT 1 FROM data_backups b WHERE b.tenant_id = OLD.tenant_id AND b.id = OLD.backup_id AND b.status = 'READY')
BEGIN SELECT RAISE(ABORT, 'BACKUP_READY_MANIFEST_IMMUTABLE'); END;
CREATE TRIGGER backup_manifests_ready_no_delete BEFORE DELETE ON data_backup_table_manifests
WHEN EXISTS (SELECT 1 FROM data_backups b WHERE b.tenant_id = OLD.tenant_id AND b.id = OLD.backup_id AND b.status = 'READY')
BEGIN SELECT RAISE(ABORT, 'BACKUP_READY_MANIFEST_IMMUTABLE'); END;
CREATE TRIGGER backup_epoch_accounts_payable_insert AFTER INSERT ON "accounts_payable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_payable_update AFTER UPDATE ON "accounts_payable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_payable_delete BEFORE DELETE ON "accounts_payable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_payable_payments_insert AFTER INSERT ON "accounts_payable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_payable_payments" AS t0 JOIN "accounts_payable" AS t1 ON t0."accounts_payable_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_accounts_payable_payments_update AFTER UPDATE ON "accounts_payable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_payable_payments" AS t0 JOIN "accounts_payable" AS t1 ON t0."accounts_payable_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_accounts_payable_payments_delete BEFORE DELETE ON "accounts_payable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_payable_payments" AS t0 JOIN "accounts_payable" AS t1 ON t0."accounts_payable_id" = t1."id" WHERE t0."id" = OLD."id"); END;
CREATE TRIGGER backup_epoch_accounts_receivable_insert AFTER INSERT ON "accounts_receivable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_receivable_update AFTER UPDATE ON "accounts_receivable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_receivable_delete BEFORE DELETE ON "accounts_receivable" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_accounts_receivable_payments_insert AFTER INSERT ON "accounts_receivable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_receivable_payments" AS t0 JOIN "accounts_receivable" AS t1 ON t0."accounts_receivable_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_accounts_receivable_payments_update AFTER UPDATE ON "accounts_receivable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_receivable_payments" AS t0 JOIN "accounts_receivable" AS t1 ON t0."accounts_receivable_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_accounts_receivable_payments_delete BEFORE DELETE ON "accounts_receivable_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "accounts_receivable_payments" AS t0 JOIN "accounts_receivable" AS t1 ON t0."accounts_receivable_id" = t1."id" WHERE t0."id" = OLD."id"); END;
CREATE TRIGGER backup_epoch_audit_events_insert AFTER INSERT ON "audit_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_audit_events_update AFTER UPDATE ON "audit_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_audit_events_delete BEFORE DELETE ON "audit_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_document_series_insert AFTER INSERT ON "branch_document_series" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_document_series_update AFTER UPDATE ON "branch_document_series" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_document_series_delete BEFORE DELETE ON "branch_document_series" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_product_stock_insert AFTER INSERT ON "branch_product_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_product_stock_update AFTER UPDATE ON "branch_product_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_product_stock_delete BEFORE DELETE ON "branch_product_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_stock_policies_insert AFTER INSERT ON "branch_stock_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_stock_policies_update AFTER UPDATE ON "branch_stock_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branch_stock_policies_delete BEFORE DELETE ON "branch_stock_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_branches_insert AFTER INSERT ON "branches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branches_update AFTER UPDATE ON "branches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_branches_delete BEFORE DELETE ON "branches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_count_lines_insert AFTER INSERT ON "cash_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_count_lines_update AFTER UPDATE ON "cash_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_count_lines_delete BEFORE DELETE ON "cash_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_cash_movements_insert AFTER INSERT ON "cash_register_cash_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_cash_movements_update AFTER UPDATE ON "cash_register_cash_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_cash_movements_delete BEFORE DELETE ON "cash_register_cash_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_expenses_insert AFTER INSERT ON "cash_register_expenses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_expenses_update AFTER UPDATE ON "cash_register_expenses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_expenses_delete BEFORE DELETE ON "cash_register_expenses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_sessions_insert AFTER INSERT ON "cash_register_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_sessions_update AFTER UPDATE ON "cash_register_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_sessions_delete BEFORE DELETE ON "cash_register_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_registers_insert AFTER INSERT ON "cash_registers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_registers_update AFTER UPDATE ON "cash_registers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_registers_delete BEFORE DELETE ON "cash_registers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_chart_of_accounts_insert AFTER INSERT ON "chart_of_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_chart_of_accounts_update AFTER UPDATE ON "chart_of_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_chart_of_accounts_delete BEFORE DELETE ON "chart_of_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_accruals_insert AFTER INSERT ON "commission_accruals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_accruals_update AFTER UPDATE ON "commission_accruals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_accruals_delete BEFORE DELETE ON "commission_accruals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_payouts_insert AFTER INSERT ON "commission_payouts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_payouts_update AFTER UPDATE ON "commission_payouts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_payouts_delete BEFORE DELETE ON "commission_payouts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_rates_insert AFTER INSERT ON "commission_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_rates_update AFTER UPDATE ON "commission_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_commission_rates_delete BEFORE DELETE ON "commission_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_customers_insert AFTER INSERT ON "customers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_customers_update AFTER UPDATE ON "customers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_customers_delete BEFORE DELETE ON "customers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_financial_rollups_insert AFTER INSERT ON "daily_financial_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_financial_rollups_update AFTER UPDATE ON "daily_financial_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_financial_rollups_delete BEFORE DELETE ON "daily_financial_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_product_rollups_insert AFTER INSERT ON "daily_product_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_product_rollups_update AFTER UPDATE ON "daily_product_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_daily_product_rollups_delete BEFORE DELETE ON "daily_product_rollups" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_exchange_rates_insert AFTER INSERT ON "exchange_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_exchange_rates_update AFTER UPDATE ON "exchange_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_exchange_rates_delete BEFORE DELETE ON "exchange_rates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_external_entity_map_insert AFTER INSERT ON "external_entity_map" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_external_entity_map_update AFTER UPDATE ON "external_entity_map" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_external_entity_map_delete BEFORE DELETE ON "external_entity_map" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_batches_insert AFTER INSERT ON "inventory_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_batches_update AFTER UPDATE ON "inventory_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_batches_delete BEFORE DELETE ON "inventory_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_count_lines_insert AFTER INSERT ON "inventory_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_count_lines_update AFTER UPDATE ON "inventory_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_count_lines_delete BEFORE DELETE ON "inventory_count_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_counts_insert AFTER INSERT ON "inventory_counts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_counts_update AFTER UPDATE ON "inventory_counts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_counts_delete BEFORE DELETE ON "inventory_counts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_batch_stock_insert AFTER INSERT ON "inventory_location_batch_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_batch_stock_update AFTER UPDATE ON "inventory_location_batch_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_batch_stock_delete BEFORE DELETE ON "inventory_location_batch_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_stock_insert AFTER INSERT ON "inventory_location_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_stock_update AFTER UPDATE ON "inventory_location_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_stock_delete BEFORE DELETE ON "inventory_location_stock" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_transfers_insert AFTER INSERT ON "inventory_location_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_transfers_update AFTER UPDATE ON "inventory_location_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_location_transfers_delete BEFORE DELETE ON "inventory_location_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_locations_insert AFTER INSERT ON "inventory_locations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_locations_update AFTER UPDATE ON "inventory_locations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_locations_delete BEFORE DELETE ON "inventory_locations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_movements_insert AFTER INSERT ON "inventory_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_movements_update AFTER UPDATE ON "inventory_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_movements_delete BEFORE DELETE ON "inventory_movements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_entries_insert AFTER INSERT ON "journal_entries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_entries_update AFTER UPDATE ON "journal_entries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_entries_delete BEFORE DELETE ON "journal_entries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_lines_insert AFTER INSERT ON "journal_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_lines_update AFTER UPDATE ON "journal_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_journal_lines_delete BEFORE DELETE ON "journal_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_accounts_insert AFTER INSERT ON "loyalty_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_accounts_update AFTER UPDATE ON "loyalty_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_accounts_delete BEFORE DELETE ON "loyalty_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_messaging_opt_ins_insert AFTER INSERT ON "messaging_opt_ins" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_messaging_opt_ins_update AFTER UPDATE ON "messaging_opt_ins" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_messaging_opt_ins_delete BEFORE DELETE ON "messaging_opt_ins" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_order_items_insert AFTER INSERT ON "order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_order_items_update AFTER UPDATE ON "order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_order_items_delete BEFORE DELETE ON "order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_orders_insert AFTER INSERT ON "orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_orders_update AFTER UPDATE ON "orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_orders_delete BEFORE DELETE ON "orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_captures_insert AFTER INSERT ON "payment_captures" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_captures_update AFTER UPDATE ON "payment_captures" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_captures_delete BEFORE DELETE ON "payment_captures" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_insert AFTER INSERT ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_update AFTER UPDATE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_delete BEFORE DELETE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminals_insert AFTER INSERT ON "pos_terminals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminals_update AFTER UPDATE ON "pos_terminals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminals_delete BEFORE DELETE ON "pos_terminals" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_batches_insert AFTER INSERT ON "price_label_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_batches_update AFTER UPDATE ON "price_label_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_batches_delete BEFORE DELETE ON "price_label_batches" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_items_insert AFTER INSERT ON "price_label_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_items_update AFTER UPDATE ON "price_label_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_items_delete BEFORE DELETE ON "price_label_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_templates_insert AFTER INSERT ON "price_label_templates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_templates_update AFTER UPDATE ON "price_label_templates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_label_templates_delete BEFORE DELETE ON "price_label_templates" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_lists_insert AFTER INSERT ON "price_lists" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_lists_update AFTER UPDATE ON "price_lists" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_price_lists_delete BEFORE DELETE ON "price_lists" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_prices_insert AFTER INSERT ON "product_prices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_prices_update AFTER UPDATE ON "product_prices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_prices_delete BEFORE DELETE ON "product_prices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_promotions_insert AFTER INSERT ON "product_promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_promotions_update AFTER UPDATE ON "product_promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_promotions_delete BEFORE DELETE ON "product_promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_recipes_insert AFTER INSERT ON "product_recipes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_recipes_update AFTER UPDATE ON "product_recipes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_recipes_delete BEFORE DELETE ON "product_recipes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_taxes_insert AFTER INSERT ON "product_taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_taxes_update AFTER UPDATE ON "product_taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_taxes_delete BEFORE DELETE ON "product_taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_uoms_insert AFTER INSERT ON "product_uoms" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_uoms_update AFTER UPDATE ON "product_uoms" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_product_uoms_delete BEFORE DELETE ON "product_uoms" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_products_insert AFTER INSERT ON "products" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_products_update AFTER UPDATE ON "products" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_products_delete BEFORE DELETE ON "products" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_promotions_insert AFTER INSERT ON "promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_promotions_update AFTER UPDATE ON "promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_promotions_delete BEFORE DELETE ON "promotions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_order_items_insert AFTER INSERT ON "purchase_order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "purchase_order_items" AS t0 JOIN "purchase_orders" AS t1 ON t0."purchase_order_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_purchase_order_items_update AFTER UPDATE ON "purchase_order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "purchase_order_items" AS t0 JOIN "purchase_orders" AS t1 ON t0."purchase_order_id" = t1."id" WHERE t0."id" = NEW."id"); END;
CREATE TRIGGER backup_epoch_purchase_order_items_delete BEFORE DELETE ON "purchase_order_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = (SELECT t1."tenant_id" FROM "purchase_order_items" AS t0 JOIN "purchase_orders" AS t1 ON t0."purchase_order_id" = t1."id" WHERE t0."id" = OLD."id"); END;
CREATE TRIGGER backup_epoch_purchase_orders_insert AFTER INSERT ON "purchase_orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_orders_update AFTER UPDATE ON "purchase_orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_orders_delete BEFORE DELETE ON "purchase_orders" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipt_lines_insert AFTER INSERT ON "purchase_receipt_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipt_lines_update AFTER UPDATE ON "purchase_receipt_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipt_lines_delete BEFORE DELETE ON "purchase_receipt_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipts_insert AFTER INSERT ON "purchase_receipts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipts_update AFTER UPDATE ON "purchase_receipts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_purchase_receipts_delete BEFORE DELETE ON "purchase_receipts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_quote_items_insert AFTER INSERT ON "quote_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_quote_items_update AFTER UPDATE ON "quote_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_quote_items_delete BEFORE DELETE ON "quote_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_quotes_insert AFTER INSERT ON "quotes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_quotes_update AFTER UPDATE ON "quotes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_quotes_delete BEFORE DELETE ON "quotes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_attributions_insert AFTER INSERT ON "referral_attributions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_attributions_update AFTER UPDATE ON "referral_attributions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_attributions_delete BEFORE DELETE ON "referral_attributions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_codes_insert AFTER INSERT ON "referral_codes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_codes_update AFTER UPDATE ON "referral_codes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_referral_codes_delete BEFORE DELETE ON "referral_codes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_return_policies_insert AFTER INSERT ON "return_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_return_policies_update AFTER UPDATE ON "return_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_return_policies_delete BEFORE DELETE ON "return_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_items_insert AFTER INSERT ON "sale_deposit_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_items_update AFTER UPDATE ON "sale_deposit_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_items_delete BEFORE DELETE ON "sale_deposit_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_payments_insert AFTER INSERT ON "sale_deposit_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_payments_update AFTER UPDATE ON "sale_deposit_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposit_payments_delete BEFORE DELETE ON "sale_deposit_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposits_insert AFTER INSERT ON "sale_deposits" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposits_update AFTER UPDATE ON "sale_deposits" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_deposits_delete BEFORE DELETE ON "sale_deposits" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installment_payments_insert AFTER INSERT ON "sale_installment_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installment_payments_update AFTER UPDATE ON "sale_installment_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installment_payments_delete BEFORE DELETE ON "sale_installment_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installments_insert AFTER INSERT ON "sale_installments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installments_update AFTER UPDATE ON "sale_installments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_installments_delete BEFORE DELETE ON "sale_installments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_items_insert AFTER INSERT ON "sale_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_items_update AFTER UPDATE ON "sale_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_items_delete BEFORE DELETE ON "sale_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_payments_insert AFTER INSERT ON "sale_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_payments_update AFTER UPDATE ON "sale_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_payments_delete BEFORE DELETE ON "sale_payments" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_reprints_insert AFTER INSERT ON "sale_reprints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_reprints_update AFTER UPDATE ON "sale_reprints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_reprints_delete BEFORE DELETE ON "sale_reprints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_return_items_insert AFTER INSERT ON "sale_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_return_items_update AFTER UPDATE ON "sale_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sale_return_items_delete BEFORE DELETE ON "sale_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_insert AFTER INSERT ON "sales" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_update AFTER UPDATE ON "sales" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_delete BEFORE DELETE ON "sales" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_returns_insert AFTER INSERT ON "sales_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_returns_update AFTER UPDATE ON "sales_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sales_returns_delete BEFORE DELETE ON "sales_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_scale_devices_insert AFTER INSERT ON "scale_devices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_scale_devices_update AFTER UPDATE ON "scale_devices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_scale_devices_delete BEFORE DELETE ON "scale_devices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifest_items_insert AFTER INSERT ON "serial_manifest_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifest_items_update AFTER UPDATE ON "serial_manifest_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifest_items_delete BEFORE DELETE ON "serial_manifest_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifests_insert AFTER INSERT ON "serial_manifests" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifests_update AFTER UPDATE ON "serial_manifests" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_manifests_delete BEFORE DELETE ON "serial_manifests" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_number_events_insert AFTER INSERT ON "serial_number_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_number_events_update AFTER UPDATE ON "serial_number_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_number_events_delete BEFORE DELETE ON "serial_number_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_numbers_insert AFTER INSERT ON "serial_numbers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_numbers_update AFTER UPDATE ON "serial_numbers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_numbers_delete BEFORE DELETE ON "serial_numbers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_losses_insert AFTER INSERT ON "stock_losses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_losses_update AFTER UPDATE ON "stock_losses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_losses_delete BEFORE DELETE ON "stock_losses" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfer_lines_insert AFTER INSERT ON "stock_transfer_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfer_lines_update AFTER UPDATE ON "stock_transfer_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfer_lines_delete BEFORE DELETE ON "stock_transfer_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfers_insert AFTER INSERT ON "stock_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfers_update AFTER UPDATE ON "stock_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_stock_transfers_delete BEFORE DELETE ON "stock_transfers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_accounts_insert AFTER INSERT ON "store_credit_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_accounts_update AFTER UPDATE ON "store_credit_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_accounts_delete BEFORE DELETE ON "store_credit_accounts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_transactions_insert AFTER INSERT ON "store_credit_transactions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_transactions_update AFTER UPDATE ON "store_credit_transactions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_store_credit_transactions_delete BEFORE DELETE ON "store_credit_transactions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_sunat_daily_summaries_insert AFTER INSERT ON "sunat_daily_summaries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sunat_daily_summaries_update AFTER UPDATE ON "sunat_daily_summaries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_sunat_daily_summaries_delete BEFORE DELETE ON "sunat_daily_summaries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoice_lines_insert AFTER INSERT ON "supplier_invoice_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoice_lines_update AFTER UPDATE ON "supplier_invoice_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoice_lines_delete BEFORE DELETE ON "supplier_invoice_lines" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoices_insert AFTER INSERT ON "supplier_invoices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoices_update AFTER UPDATE ON "supplier_invoices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_invoices_delete BEFORE DELETE ON "supplier_invoices" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_return_items_insert AFTER INSERT ON "supplier_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_return_items_update AFTER UPDATE ON "supplier_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_return_items_delete BEFORE DELETE ON "supplier_return_items" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_returns_insert AFTER INSERT ON "supplier_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_returns_update AFTER UPDATE ON "supplier_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_supplier_returns_delete BEFORE DELETE ON "supplier_returns" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_suppliers_insert AFTER INSERT ON "suppliers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_suppliers_update AFTER UPDATE ON "suppliers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_suppliers_delete BEFORE DELETE ON "suppliers" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_taxes_insert AFTER INSERT ON "taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_taxes_update AFTER UPDATE ON "taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_taxes_delete BEFORE DELETE ON "taxes" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_capabilities_insert AFTER INSERT ON "tenant_capabilities" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_capabilities_update AFTER UPDATE ON "tenant_capabilities" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_capabilities_delete BEFORE DELETE ON "tenant_capabilities" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_discount_policies_insert AFTER INSERT ON "tenant_discount_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_discount_policies_update AFTER UPDATE ON "tenant_discount_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_discount_policies_delete BEFORE DELETE ON "tenant_discount_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_weight_policies_insert AFTER INSERT ON "tenant_weight_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_weight_policies_update AFTER UPDATE ON "tenant_weight_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_tenant_weight_policies_delete BEFORE DELETE ON "tenant_weight_policies" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_weight_measurements_insert AFTER INSERT ON "weight_measurements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_weight_measurements_update AFTER UPDATE ON "weight_measurements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_weight_measurements_delete BEFORE DELETE ON "weight_measurements" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
INSERT INTO schema_meta(key, value) VALUES ('data.backup.sprint42', '1');
