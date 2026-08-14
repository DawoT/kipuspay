import { describe, expect, it } from 'vitest';
import down0038 from '../migrations-down/0038_sprint45_mobile_push.sql?raw';
import migration0038 from '../migrations/0038_sprint45_mobile_push.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0038_SPRINT45_MOBILE_PUSH } from './migrations-down.js';

const tables = ['push_consents', 'push_subscriptions', 'push_events', 'push_deliveries'] as const;

describe('Sprint 45 mobile push DDL 0038 contract (RED)', () => {
  it('creates four DAT-12 tables with closed provider, status, TTL, retry, and ACK fields', () => {
    for (const table of tables) {
      expect(migration0038).toContain(`CREATE TABLE ${table}`);
      expect(migration0038).toContain('tenant_id TEXT NOT NULL');
      expect(migration0038).toContain('UNIQUE (tenant_id, id)');
    }
    expect(migration0038).toContain('CREATE TABLE push_privacy_settings');
    expect(migration0038).toContain('amounts_enabled INTEGER NOT NULL DEFAULT 0');
    expect(migration0038).toContain('UNIQUE (tenant_id)');
    expect(migration0038).toContain("('WEB_PUSH','FCM_HTTP_V1')");
    expect(migration0038).toContain("'ACCEPTED','DISPLAYED'");
    expect(migration0038).toContain('ttl_seconds INTEGER NOT NULL');
    expect(migration0038).toContain('collapse_key TEXT NOT NULL');
    expect(migration0038).toContain('attempt_count INTEGER NOT NULL');
    expect(migration0038).toContain('ack_receipt_hash TEXT');
    expect(migration0038).toContain('ack_expires_at DATETIME');
    expect(migration0038).toContain('ack_consumed_at DATETIME');
    expect(migration0038).toContain('deep_link_kind TEXT NOT NULL');
    expect(migration0038).toContain('deep_link_entity_id TEXT NOT NULL');
    expect(migration0038).toContain('target_user_id TEXT');
    expect(migration0038).toContain('target_branch_id TEXT');
    expect(migration0038).toContain(
      "(target_scope = 'OPERATIONAL_MOBILE' AND target_user_id IS NOT NULL AND target_branch_id IS NOT NULL)",
    );
    expect(migration0038).toContain(
      'FOREIGN KEY (tenant_id, target_user_id) REFERENCES users(tenant_id, id)',
    );
    expect(migration0038).toContain(
      'FOREIGN KEY (tenant_id, target_branch_id) REFERENCES branches(tenant_id, id)',
    );
  });

  it('stores only encrypted endpoint/token credentials with key versions and fingerprints', () => {
    expect(migration0038).toContain('endpoint_token_ciphertext TEXT NOT NULL');
    expect(migration0038).toContain('endpoint_token_fingerprint TEXT NOT NULL');
    expect(migration0038).toContain('credential_ciphertext TEXT');
    expect(migration0038).toContain('credential_fingerprint TEXT');
    expect(migration0038).toContain('encryption_key_version TEXT NOT NULL');
    expect(migration0038).not.toMatch(/\b(endpoint|auth|p256dh|fcm_token)\s+TEXT\b/);
    expect(migration0038).not.toContain('vapid_private');
    expect(migration0038).not.toContain('service_account_json');
  });

  it('adds due/SLO indexes, epoch triggers, and backup classifications', () => {
    expect(migration0038).toContain('idx_push_events_due');
    expect(migration0038).toContain('idx_push_deliveries_due');
    expect(migration0038).toContain('idx_push_deliveries_slo');
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('push_consents')).toMatchObject({ classification: 'SENSITIVE' });
    expect(registry.get('push_privacy_settings')).toMatchObject({ classification: 'SENSITIVE' });
    expect(registry.get('push_subscriptions')).toMatchObject({ classification: 'SENSITIVE' });
    expect(registry.get('push_events')).toMatchObject({ classification: 'BUSINESS' });
    expect(registry.get('push_deliveries')).toMatchObject({ classification: 'BUSINESS' });
    for (const table of tables) {
      expect(migration0038).toContain(`epoch_${table}_insert`);
      expect(migration0038).toContain(`epoch_${table}_update`);
      expect(migration0038).toContain(`epoch_${table}_delete`);
    }
  });

  it('exports an exact protected child-first down requiring backup registry epoch', () => {
    expect(DOWN_0038_SPRINT45_MOBILE_PUSH.trim()).toBe(down0038.trim());
    expect(down0038).toContain('MOBILE_PUSH_DOWN_PROTECTED');
    expect(down0038).toContain('backup');
    expect(down0038).toContain('registry');
    expect(down0038).toContain('epoch');
    expect(down0038.indexOf('DROP TABLE push_deliveries')).toBeLessThan(
      down0038.indexOf('DROP TABLE push_events'),
    );
    expect(down0038.indexOf('DROP TABLE push_subscriptions')).toBeLessThan(
      down0038.indexOf('DROP TABLE push_consents'),
    );
  });
});
