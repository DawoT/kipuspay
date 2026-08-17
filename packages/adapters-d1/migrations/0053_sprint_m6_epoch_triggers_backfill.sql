-- Sprint M6 — backfill de triggers de epoch (fe de errata de integración).
-- El contrato 0035 exige que toda tabla del registry D1_BACKUP_TABLES
-- incremente tenant_data_epochs al mutar (el backup incremental salta la
-- captura si epochStart === epochEnd). Tablas creadas en sprints 38-52
-- (users, tokens, telemetría, webhooks, fiscal, terminales, lealtad) se
-- quedaron sin triggers y sus cambios se perdían del snapshot si eran los
-- únicos. Excluidas por diseño (infraestructura del propio backup): 
-- tenant_data_epochs (tabla de control, recursión), data_backup_* y
-- restore_dry_runs (escriben durante el snapshot).
CREATE TRIGGER backup_epoch_ai_usage_counters_insert AFTER INSERT ON "ai_usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_ai_usage_counters_update AFTER UPDATE ON "ai_usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_ai_usage_counters_delete BEFORE DELETE ON "ai_usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_api_keys_insert AFTER INSERT ON "api_keys" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_api_keys_update AFTER UPDATE ON "api_keys" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_api_keys_delete BEFORE DELETE ON "api_keys" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_authorization_tokens_insert AFTER INSERT ON "authorization_tokens" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_authorization_tokens_update AFTER UPDATE ON "authorization_tokens" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_authorization_tokens_delete BEFORE DELETE ON "authorization_tokens" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_billing_overages_insert AFTER INSERT ON "billing_overages" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_billing_overages_update AFTER UPDATE ON "billing_overages" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_billing_overages_delete BEFORE DELETE ON "billing_overages" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_outbox_insert AFTER INSERT ON "fiscal_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_outbox_update AFTER UPDATE ON "fiscal_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_outbox_delete BEFORE DELETE ON "fiscal_outbox" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_owner_alerts_insert AFTER INSERT ON "fiscal_owner_alerts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_owner_alerts_update AFTER UPDATE ON "fiscal_owner_alerts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_fiscal_owner_alerts_delete BEFORE DELETE ON "fiscal_owner_alerts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_reservations_insert AFTER INSERT ON "loyalty_reservations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_reservations_update AFTER UPDATE ON "loyalty_reservations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_loyalty_reservations_delete BEFORE DELETE ON "loyalty_reservations" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminal_sessions_insert AFTER INSERT ON "pos_terminal_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminal_sessions_update AFTER UPDATE ON "pos_terminal_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_pos_terminal_sessions_delete BEFORE DELETE ON "pos_terminal_sessions" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_terminal_leases_insert AFTER INSERT ON "serial_terminal_leases" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_terminal_leases_update AFTER UPDATE ON "serial_terminal_leases" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_serial_terminal_leases_delete BEFORE DELETE ON "serial_terminal_leases" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_counters_insert AFTER INSERT ON "usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_counters_update AFTER UPDATE ON "usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_counters_delete BEFORE DELETE ON "usage_counters" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_events_insert AFTER INSERT ON "usage_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_events_update AFTER UPDATE ON "usage_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_usage_events_delete BEFORE DELETE ON "usage_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_users_insert AFTER INSERT ON "users" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_users_update AFTER UPDATE ON "users" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_users_delete BEFORE DELETE ON "users" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_deliveries_insert AFTER INSERT ON "webhook_deliveries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_deliveries_update AFTER UPDATE ON "webhook_deliveries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_deliveries_delete BEFORE DELETE ON "webhook_deliveries" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_endpoints_insert AFTER INSERT ON "webhook_endpoints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_endpoints_update AFTER UPDATE ON "webhook_endpoints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_endpoints_delete BEFORE DELETE ON "webhook_endpoints" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_events_insert AFTER INSERT ON "webhook_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_events_update AFTER UPDATE ON "webhook_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_webhook_events_delete BEFORE DELETE ON "webhook_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('sprint_m6.epoch_triggers_backfill', '1');
