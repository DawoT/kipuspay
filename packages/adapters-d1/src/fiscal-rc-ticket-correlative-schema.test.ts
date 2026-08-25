import { describe, expect, it } from 'vitest';
import down0063 from '../migrations-down/0063_fiscal_rc_ticket_and_correlative.sql?raw';
import migration0063 from '../migrations/0063_fiscal_rc_ticket_and_correlative.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0063_FISCAL_RC_TICKET_AND_CORRELATIVE } from './migrations-down.js';

describe('Migración 0063 — fiscal RC ticket and correlative schema', () => {
  it('agrega columnas sunat_reception_ticket y correlative, e índices únicos y de procesamiento', () => {
    expect(migration0063).toContain(
      'ALTER TABLE sunat_daily_summaries ADD COLUMN sunat_reception_ticket TEXT;',
    );
    expect(migration0063).toContain(
      'ALTER TABLE sunat_daily_summaries ADD COLUMN correlative INTEGER NOT NULL DEFAULT 1;',
    );
    expect(migration0063).toContain(
      'CREATE UNIQUE INDEX idx_sunat_daily_summaries_correlative ON sunat_daily_summaries(tenant_id, summary_date, correlative);',
    );
    expect(migration0063).toContain(
      "CREATE INDEX idx_sunat_daily_summaries_processing ON sunat_daily_summaries(tenant_id, status) WHERE status = 'PROCESSING';",
    );
    expect(migration0063).toContain(
      "INSERT INTO schema_meta(key, value) VALUES ('fiscal.rc_correlative_unique.v1', '1');",
    );
  });

  it('registra columnas en data_backup_registry para sunat_daily_summaries', () => {
    const entry = D1_BACKUP_TABLES.find((row) => row.name === 'sunat_daily_summaries');
    expect(entry?.columns).toContain('sunat_reception_ticket');
    expect(entry?.columns).toContain('correlative');
  });

  it('down espejo reversa schema_meta, índices y columnas en orden inverso exacto', () => {
    expect(DOWN_0063_FISCAL_RC_TICKET_AND_CORRELATIVE.trim()).toBe(down0063.trim());
    expect(down0063).toContain(
      "DELETE FROM schema_meta WHERE key = 'fiscal.rc_correlative_unique.v1';",
    );
    expect(down0063).toContain('DROP INDEX IF EXISTS idx_sunat_daily_summaries_processing;');
    expect(down0063).toContain('DROP INDEX IF EXISTS idx_sunat_daily_summaries_correlative;');
    expect(down0063).toContain('ALTER TABLE sunat_daily_summaries DROP COLUMN correlative;');
    expect(down0063).toContain(
      'ALTER TABLE sunat_daily_summaries DROP COLUMN sunat_reception_ticket;',
    );
  });
});
