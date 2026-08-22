import { describe, expect, it } from 'vitest';
import down0058 from '../migrations-down/0058_fiscal_non_sale_outbox.sql?raw';
import migration0058 from '../migrations/0058_fiscal_non_sale_outbox.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0058_FISCAL_NON_SALE_OUTBOX } from './migrations-down.js';

describe('FL-5 fiscal_non_sale_outbox schema', () => {
  it('crea cola 31/02/20 con tenant_id NOT NULL y status cerrado', () => {
    expect(migration0058).toContain('CREATE TABLE fiscal_non_sale_outbox');
    expect(migration0058).toContain('tenant_id TEXT NOT NULL');
    expect(migration0058).toContain("document_type IN ('31','02','20')");
    expect(migration0058).toContain(
      "CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','QUARANTINED'))",
    );
    expect(migration0058).toContain('UNIQUE (tenant_id, document_type, entity_id)');
  });

  it('triggers epoch insert/update/delete (V-29)', () => {
    for (const op of ['insert', 'update', 'delete']) {
      expect(migration0058).toContain(`backup_epoch_fiscal_non_sale_outbox_${op}`);
    }
  });

  it('EPHEMERAL en el registry de backups', () => {
    const entry = D1_BACKUP_TABLES.find((row) => row.name === 'fiscal_non_sale_outbox');
    expect(entry?.classification).toBe('EPHEMERAL');
    expect(entry?.columns).toContain('r2_xml_key');
  });

  it('down espejo dropea tabla y triggers', () => {
    expect(DOWN_0058_FISCAL_NON_SALE_OUTBOX).toBe(down0058);
    expect(down0058).toContain('DROP TABLE IF EXISTS fiscal_non_sale_outbox');
  });
});
