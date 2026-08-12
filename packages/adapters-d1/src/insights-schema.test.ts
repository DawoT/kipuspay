import { describe, expect, it } from 'vitest';
import down0041 from '../migrations-down/0041_sprint49_insights.sql?raw';
import migration0041 from '../migrations/0041_sprint49_insights.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0041_SPRINT49_INSIGHTS } from './migrations-down.js';

describe('Sprint 49 insights schema', () => {
  it('defines insight_log append-only with tenant scoping and idempotency', () => {
    expect(migration0041).toContain('CREATE TABLE insight_log');
    expect(migration0041).toContain('UNIQUE (tenant_id, id)');
    expect(migration0041).toContain('UNIQUE INDEX uq_insight_log_tenant_idem');
    expect(migration0041).toContain('FOREIGN KEY (tenant_id) REFERENCES tenants(id)');
    expect(migration0041).toMatch(/interaction_type TEXT NOT NULL/);
    expect(migration0041).toMatch(/sql_executed TEXT NOT NULL/);
    expect(migration0041).toMatch(/facts_json TEXT NOT NULL/);
    expect(migration0041).toMatch(/response_text TEXT NOT NULL/);
    expect(migration0041).toMatch(/model_version TEXT NOT NULL/);
    expect(migration0041).toMatch(/status TEXT NOT NULL DEFAULT 'OK'/);
    expect(migration0041).toContain('CHECK (status IN');
    expect(migration0041).toContain('CHECK (interaction_type IN');
  });

  it('defines ai_usage_counters metering by tenant/day with quota', () => {
    expect(migration0041).toContain('CREATE TABLE ai_usage_counters');
    expect(migration0041).toContain('PRIMARY KEY (tenant_id, usage_date)');
    expect(migration0041).toMatch(/quota_queries INTEGER NOT NULL/);
    expect(migration0041).toContain('CHECK (queries >= 0)');
    expect(migration0041).toContain('CHECK (quota_queries >= 0)');
  });

  it('registers both tables in the backup registry with correct classification', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    expect(registry.get('insight_log')).toMatchObject({ classification: 'BUSINESS' });
    expect(registry.get('ai_usage_counters')).toMatchObject({ classification: 'EPHEMERAL' });
  });

  it('down espejo: protege datos vivos con backup READY y limpia schema_meta', () => {
    expect(DOWN_0041_SPRINT49_INSIGHTS).toBe(down0041);
    expect(down0041).toContain('INSIGHTS_DOWN_PROTECTED');
    expect(down0041).toContain('DROP TABLE insight_log');
    expect(down0041).toContain('DROP TABLE ai_usage_counters');
    expect(down0041).toContain(
      "DELETE FROM schema_meta WHERE key = 'analytics.agentic_insights.sprint49'",
    );
  });
});
