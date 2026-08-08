import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import downSql from '../migrations-down/0034_sprint41_price_labels.sql?raw';
import { DOWN_0034_SPRINT41_PRICE_LABELS } from './migrations-down.js';

async function seedPriceLabelScope(tenantId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Labels SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, 'Labels', 'Lima')`,
    ).bind(`branch-${tenantId}`, tenantId, `C-${tenantId}`),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'supervisor')`,
    ).bind(`user-${tenantId}`, tenantId, `branch-${tenantId}`, `${tenantId}@example.com`),
    env.DB.prepare(
      `INSERT INTO price_lists (id, tenant_id, name, is_default)
       VALUES (?, ?, 'Lista', 1)`,
    ).bind(`list-${tenantId}`, tenantId),
    env.DB.prepare(
      `INSERT INTO products (
         id, tenant_id, sku, barcode, name, product_type, unit_code, price_cents
       ) VALUES (?, ?, ?, '4006381333931', 'Café', 'physical', 'NIU', 1290)`,
    ).bind(`product-${tenantId}`, tenantId, `SKU-${tenantId}`),
  ]);
}

describe('Sprint 41 price-label migration on D1', () => {
  it('enforces tenant scope, immutable snapshots, states, idempotency and protected down', async () => {
    expect(downSql.trim()).toBe(DOWN_0034_SPRINT41_PRICE_LABELS.trim());
    const meta = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'catalog.price_labels.sprint41'`,
    ).first<{ value: string }>();
    expect(meta?.value).toBe('1');

    await seedPriceLabelScope('label-a');
    await seedPriceLabelScope('label-b');
    await env.DB.prepare(
      `INSERT INTO price_label_templates (
         id, tenant_id, template_key, version, name, dsl_version, template_json,
         paper_width_mm, created_by_user_id
       ) VALUES ('template-a', 'label-a', 'shelf', 1, 'Anaquel', 'PRICE_LABEL_V1',
                 '{"dslVersion":"PRICE_LABEL_V1","blocks":[]}', 58, 'user-label-a')`,
    ).run();

    const insertBatch = (id: string, status = 'PENDING', idempotencyKey = 'idem-1') =>
      env.DB.prepare(
        `INSERT INTO price_label_batches (
           id, tenant_id, branch_id, template_id, price_list_id, price_list_identity, idempotency_key,
           snapshot_hash, status, requested_by_user_id
         ) VALUES (?, 'label-a', ?, 'template-a', ?, 'EXPLICIT', ?, ?, ?, ?)`,
      ).bind(
        id,
        'branch-label-a',
        'list-label-a',
        idempotencyKey,
        'a'.repeat(64),
        status,
        'user-label-a',
      );

    await expect(
      env.DB.prepare(
        `INSERT INTO price_label_batches (
           id, tenant_id, branch_id, template_id, price_list_id, price_list_identity, idempotency_key,
           snapshot_hash, requested_by_user_id
         ) VALUES ('batch-cross', 'label-a', 'branch-label-b', 'template-a',
                   'list-label-a', 'EXPLICIT', 'cross', ?, 'user-label-a')`,
      )
        .bind('b'.repeat(64))
        .run(),
    ).rejects.toThrow();
    await expect(insertBatch('batch-bad-state', 'BOGUS', 'bad-state').run()).rejects.toThrow();

    await insertBatch('batch-a').run();
    await expect(insertBatch('batch-duplicate', 'PENDING', 'idem-1').run()).rejects.toThrow();

    const insertItem = (id: string, status = 'PENDING', ordinal = 0) =>
      env.DB.prepare(
        `INSERT INTO price_label_items (
           id, tenant_id, batch_id, product_id, ordinal, product_name_snapshot,
           price_cents, barcode_type, barcode_value_snapshot, template_version,
           effective_price_list_id, price_source, price_resolved_at, price_resolution_version,
           rendered_payload_hash, rendered_payload_hex, status
         ) VALUES (?, 'label-a', 'batch-a', 'product-label-a', ?, 'Café', 1290,
                   'EAN13', '4006381333931', 1, 'list-label-a', 'PRICE_LIST',
                   CURRENT_TIMESTAMP, '1:1:1', ?, '00', ?)`,
      ).bind(id, ordinal, 'c'.repeat(64), status);
    await expect(insertItem('item-bad-state', 'BOGUS').run()).rejects.toThrow();
    await insertItem('item-a').run();

    await expect(
      env.DB.prepare(
        `INSERT INTO price_label_items (
           id, tenant_id, batch_id, product_id, ordinal, product_name_snapshot,
           price_cents, barcode_type, barcode_value_snapshot, template_version,
           effective_price_list_id, price_source, price_resolved_at, price_resolution_version,
           rendered_payload_hash, rendered_payload_hex
         ) VALUES ('item-cross', 'label-a', 'batch-a', 'product-label-b', 1, 'Otro',
                   2590, 'EAN13', '4006381333931', 1, 'list-label-a', 'PRICE_LIST',
                   CURRENT_TIMESTAMP, '1:1:1', ?, '00')`,
      )
        .bind('d'.repeat(64))
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(`UPDATE price_label_batches SET snapshot_hash = ? WHERE id = 'batch-a'`)
        .bind('e'.repeat(64))
        .run(),
    ).rejects.toThrow(/PRICE_LABEL_BATCH_SNAPSHOT_IMMUTABLE/);
    await expect(
      env.DB.prepare(`UPDATE price_label_items SET price_cents = 1 WHERE id = 'item-a'`).run(),
    ).rejects.toThrow(/PRICE_LABEL_ITEM_SNAPSHOT_IMMUTABLE/);

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE price_label_items
         SET status = 'FAILED', attempt_count = 1, last_error_code = 'PRINTER_TIMEOUT'
         WHERE id = 'item-a'`,
      ),
      env.DB.prepare(`UPDATE price_label_batches SET status = 'PARTIAL' WHERE id = 'batch-a'`),
    ]);
    const partial = await env.DB.prepare(
      `SELECT status FROM price_label_batches WHERE id = 'batch-a'`,
    ).first<{ status: string }>();
    expect(partial?.status).toBe('PARTIAL');

    await expect(env.DB.exec(DOWN_0034_SPRINT41_PRICE_LABELS)).rejects.toThrow();
    await env.DB.prepare(`DELETE FROM price_label_items`).run();
    await env.DB.prepare(`DELETE FROM price_label_batches`).run();
    await env.DB.prepare(`DELETE FROM price_label_templates`).run();
    await env.DB.exec(DOWN_0034_SPRINT41_PRICE_LABELS);

    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('price_label_templates','price_label_batches','price_label_items')`,
    ).all<{ name: string }>();
    expect(tables.results).toEqual([]);
    const removedMeta = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'catalog.price_labels.sprint41'`,
    ).first();
    expect(removedMeta).toBeNull();
  });
});
