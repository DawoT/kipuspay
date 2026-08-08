import { describe, expect, it } from 'vitest';
import priceLabelsSql from '../migrations/0034_sprint41_price_labels.sql?raw';
import { DOWN_0034_SPRINT41_PRICE_LABELS } from './migrations-down.js';

describe('Sprint 41 catalog.price_labels migration contract', () => {
  it('creates template, batch and item tables with integer authoritative prices', () => {
    expect(priceLabelsSql).toContain('CREATE TABLE price_label_templates');
    expect(priceLabelsSql).toContain('CREATE TABLE price_label_batches');
    expect(priceLabelsSql).toContain('CREATE TABLE price_label_items');
    expect(priceLabelsSql).toContain('price_cents INTEGER NOT NULL');
    expect(priceLabelsSql).not.toMatch(/\bprice(?:_cents)?\s+REAL\b/i);
  });

  it('enforces DAT-12 on every tenant-owned reference', () => {
    expect(priceLabelsSql.match(/tenant_id TEXT NOT NULL/g)?.length).toBeGreaterThanOrEqual(3);
    expect(priceLabelsSql).toContain(
      'FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)',
    );
    expect(priceLabelsSql).toContain(
      'FOREIGN KEY (tenant_id, template_id) REFERENCES price_label_templates(tenant_id, id)',
    );
    expect(priceLabelsSql).toContain(
      'FOREIGN KEY (tenant_id, batch_id) REFERENCES price_label_batches(tenant_id, id)',
    );
    expect(priceLabelsSql).toContain(
      'FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)',
    );
    expect(priceLabelsSql).toContain(
      'FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id)',
    );
  });

  it('makes batch creation idempotent and snapshots immutable', () => {
    expect(priceLabelsSql).toContain('UNIQUE (tenant_id, branch_id, idempotency_key)');
    expect(priceLabelsSql).toContain('snapshot_hash TEXT NOT NULL');
    expect(priceLabelsSql).toContain('PRICE_LABEL_BATCH_SNAPSHOT_IMMUTABLE');
    expect(priceLabelsSql).toContain('PRICE_LABEL_ITEM_SNAPSHOT_IMMUTABLE');
  });

  it('supports partial ACK and only the canonical state machines', () => {
    expect(priceLabelsSql).toContain("('PENDING','PRINTING','PARTIAL','ACKED','FAILED')");
    expect(priceLabelsSql).toContain("('PENDING','ACKED','FAILED')");
    expect(priceLabelsSql).toContain('acknowledged_at DATETIME');
    expect(priceLabelsSql).toContain('attempt_count INTEGER NOT NULL DEFAULT 0');
  });

  it('defines a protected down contract that refuses snapshot loss', () => {
    expect(DOWN_0034_SPRINT41_PRICE_LABELS).toContain('price_label_items');
    expect(DOWN_0034_SPRINT41_PRICE_LABELS).toContain('price_label_batches');
    expect(DOWN_0034_SPRINT41_PRICE_LABELS).toContain('price_label_templates');
    expect(DOWN_0034_SPRINT41_PRICE_LABELS).toMatch(/RAISE\(ABORT/);
    expect(DOWN_0034_SPRINT41_PRICE_LABELS).toContain('schema_meta');
  });
});
