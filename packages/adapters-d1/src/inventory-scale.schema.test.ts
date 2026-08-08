/* eslint-disable no-secrets/no-secrets -- canonical schema identifiers are the contract under test */
import { describe, expect, it } from 'vitest';
import scaleSql from '../migrations/0033_sprint40_inventory_scale.sql?raw';
import { DOWN_0033_SPRINT40_INVENTORY_SCALE } from './migrations-down.js';

describe('Sprint 40 inventory.scale migration contract', () => {
  it('stores tenant policy and physical weight only as INTEGER microunits', () => {
    expect(scaleSql).toContain('CREATE TABLE tenant_weight_policies');
    expect(scaleSql).toContain('manual_weight_threshold_microunits INTEGER NOT NULL DEFAULT 0');
    expect(scaleSql).not.toContain(
      'ALTER TABLE tenants ADD COLUMN manual_weight_threshold_microunits',
    );
    expect(scaleSql).toContain('weight_microunits INTEGER NOT NULL');
    expect(scaleSql).toContain('base_quantity_microunits');
    expect(scaleSql).not.toMatch(/\bweight\s+REAL\b/i);
    expect(scaleSql).not.toMatch(/\bweight_microunits\s+REAL\b/i);
  });

  it('registers scale devices by tenant and terminal with canonical transport metadata', () => {
    expect(scaleSql).toContain('CREATE TABLE scale_devices');
    expect(scaleSql).toContain("protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')");
    expect(scaleSql).toContain('device_fingerprint TEXT NOT NULL');
    expect(scaleSql).toContain("config_json TEXT NOT NULL DEFAULT '{}'");
    expect(scaleSql).toContain("status IN ('ACTIVE','DISCONNECTED','DISABLED')");
    expect(scaleSql).toContain('UNIQUE (tenant_id, terminal_id, device_fingerprint)');
  });

  it('models WEIGH as stock-tracked and one measurement per weighted line', () => {
    expect(scaleSql).toContain("'WEIGH'");
    expect(scaleSql).toContain('UNIQUE (tenant_id, sale_item_id)');
    expect(scaleSql).toContain(
      'FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items(tenant_id, id)',
    );
    expect(scaleSql).toContain(
      'FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)',
    );
  });

  it('keeps measurement identity independent for repeated lines of the same product', () => {
    expect(scaleSql).toContain('UNIQUE (tenant_id, id)');
    expect(scaleSql).not.toContain('UNIQUE (tenant_id, product_id)');
    expect(scaleSql).toContain("measurement_source IN ('DEVICE','MANUAL')");
    expect(scaleSql).toContain("scale_protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')");
  });

  it('uses DAT-12 composite keys for every tenant-owned parent reference', () => {
    expect(scaleSql.match(/UNIQUE \(tenant_id, id\)/g)).toHaveLength(3);
    expect(scaleSql).toContain(
      'FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id)',
    );
    expect(scaleSql).toContain(
      'FOREIGN KEY (tenant_id, scale_device_id) REFERENCES scale_devices(tenant_id, id)',
    );
    expect(scaleSql).toContain(
      'FOREIGN KEY (tenant_id, authorization_token_id) REFERENCES authorization_tokens(tenant_id, id)',
    );
  });

  it('makes measurements append-only and replay-safe by operation', () => {
    expect(scaleSql).toContain('idempotency_key TEXT NOT NULL');
    expect(scaleSql).toContain('UNIQUE (tenant_id, idempotency_key)');
    expect(scaleSql).toContain('CREATE INDEX idx_weight_measurements_operation');
    expect(scaleSql).toContain('ON weight_measurements(tenant_id, operation_type, operation_id)');
    expect(scaleSql).toContain('CREATE TRIGGER weight_measurements_no_update');
    expect(scaleSql).toContain('CREATE TRIGGER weight_measurements_no_delete');
    expect(scaleSql.match(/WEIGHT_MEASUREMENTS_APPEND_ONLY/g)).toHaveLength(2);
  });

  it('extends one-shot authorization with the complete WEIGHT_OVERRIDE action scope', () => {
    expect(scaleSql).toContain('ALTER TABLE authorization_tokens ADD COLUMN action TEXT');
    expect(scaleSql).toContain('ADD COLUMN terminal_id TEXT');
    expect(scaleSql).toContain('ADD COLUMN sale_id TEXT');
    expect(scaleSql).toContain('ADD COLUMN offline_sale_id TEXT');
    expect(scaleSql).toContain('ADD COLUMN sale_item_id TEXT');
    expect(scaleSql).toContain('ADD COLUMN measurement_id TEXT');
  });

  it('defines a fail-closed down migration contract', () => {
    expect(DOWN_0033_SPRINT40_INVENTORY_SCALE).toContain('weight_measurements');
    expect(DOWN_0033_SPRINT40_INVENTORY_SCALE).toContain('scale_devices');
    expect(DOWN_0033_SPRINT40_INVENTORY_SCALE).toContain('tenant_weight_policies');
    expect(DOWN_0033_SPRINT40_INVENTORY_SCALE).toMatch(/RAISE\(ABORT/);
  });
});
