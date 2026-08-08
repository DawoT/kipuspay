import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  acknowledgePriceLabelItems,
  createPriceLabelTemplate,
  createPriceLabelBatchAtomic,
  reprintPriceLabelBatchAtomic,
  retryPriceLabelBatch,
} from './price-labels.js';

const TEMPLATE = {
  dslVersion: 'PRICE_LABEL_V1',
  blocks: [
    { type: 'TEXT', field: 'product_name', align: 'CENTER' },
    { type: 'PRICE', field: 'price', align: 'CENTER' },
    { type: 'BARCODE', field: 'barcode', align: 'CENTER' },
  ],
};

async function seed(tenantId: string) {
  const branchId = `branch-${tenantId}`;
  const actorUserId = `user-${tenantId}`;
  const listId = `list-${tenantId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, 'Labels SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, 'Labels', 'Lima')`,
    ).bind(branchId, tenantId, `C-${tenantId}`),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'supervisor')`,
    ).bind(actorUserId, tenantId, branchId, `${tenantId}@example.com`),
    env.DB.prepare(
      `INSERT INTO price_lists (id, tenant_id, name, is_default)
       VALUES (?, ?, 'Lista', 1)`,
    ).bind(listId, tenantId),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, barcode, name, unit_code, price_cents)
       VALUES (?, ?, ?, '4006381333931', 'Café', 'NIU', 900),
              (?, ?, ?, '96385074', 'Té', 'NIU', 1900)`,
    ).bind(
      `product-1-${tenantId}`,
      tenantId,
      `P1-${tenantId}`,
      `product-2-${tenantId}`,
      tenantId,
      `P2-${tenantId}`,
    ),
    env.DB.prepare(
      `INSERT INTO product_prices (id, tenant_id, price_list_id, product_id, price_cents)
       VALUES (?, ?, ?, ?, 1290), (?, ?, ?, ?, 2590)`,
    ).bind(
      `price-1-${tenantId}`,
      tenantId,
      listId,
      `product-1-${tenantId}`,
      `price-2-${tenantId}`,
      tenantId,
      listId,
      `product-2-${tenantId}`,
    ),
  ]);
  await env.DB.prepare(`UPDATE branches SET price_list_id = ? WHERE tenant_id = ? AND id = ?`)
    .bind(listId, tenantId, branchId)
    .run();
  const template = await createPriceLabelTemplate(env.DB, {
    tenantId,
    actorUserId,
    templateKey: 'shelf',
    name: 'Anaquel',
    template: TEMPLATE,
    paperWidthMm: 58,
  });
  return {
    tenantId,
    branchId,
    actorUserId,
    listId,
    templateId: template.templateId,
    products: [`product-2-${tenantId}`, `product-1-${tenantId}`],
  };
}

function batchScope(fixture: Awaited<ReturnType<typeof seed>>) {
  return {
    tenantId: fixture.tenantId,
    branchId: fixture.branchId,
    actorUserId: fixture.actorUserId,
    templateId: fixture.templateId,
  };
}

describe('Sprint 41 D1 price-label authority', () => {
  it('resolves explicit/default list identity without customer or promotion context', async () => {
    const fixture = await seed('labels-resolution');
    const result = await createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      products: fixture.products.map((productId, index) => ({ productId, copies: index + 1 })),
      idempotencyKey: 'request-1',
    });
    expect(result.priceListId).toBe(fixture.listId);
    expect(result.priceListIdentity).toBe('BRANCH_DEFAULT');
    expect(result.items.map((item) => item.priceCents)).toEqual([2590, 1290, 1290]);
    expect(result.items.every((item) => item.priceSource === 'PRICE_LIST')).toBe(true);
    expect(result.items.every((item) => item.resolvedAt && item.resolutionVersion)).toBe(true);

    const explicit = await createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      priceListId: fixture.listId,
      products: [{ productId: fixture.products[0]!, copies: 1 }],
      idempotencyKey: 'request-explicit',
    });
    expect(explicit.priceListIdentity).toBe('EXPLICIT');
  });

  it('rejects cross-tenant references and untrusted snapshot fields', async () => {
    const local = await seed('labels-local');
    const foreign = await seed('labels-foreign');
    await expect(
      createPriceLabelBatchAtomic(env.DB, {
        ...batchScope(local),
        templateId: foreign.templateId,
        priceListId: foreign.listId,
        products: [{ productId: foreign.products[0]!, copies: 1 }],
        idempotencyKey: 'cross-tenant',
      }),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
    await expect(
      createPriceLabelBatchAtomic(env.DB, {
        ...batchScope(local),
        products: [{ productId: local.products[0]!, copies: 1 }],
        idempotencyKey: 'tampered',
        priceCents: 1,
      } as never),
    ).rejects.toThrow('PRICE_LABEL_UNTRUSTED_FIELD');
  });

  it('keeps retries byte-identical while reprint refreshes current price exactly once', async () => {
    const fixture = await seed('labels-reprint');
    const original = await createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      products: [{ productId: fixture.products[1]!, copies: 1 }],
      idempotencyKey: 'original',
    });
    const retry = await retryPriceLabelBatch(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      batchId: original.batchId,
    });
    expect(retry).toEqual(original);
    await env.DB.prepare(
      `UPDATE product_prices SET price_cents = 1490
       WHERE tenant_id = ? AND price_list_id = ? AND product_id = ?`,
    )
      .bind(fixture.tenantId, fixture.listId, fixture.products[1])
      .run();
    const reprint = await reprintPriceLabelBatchAtomic(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      actorUserId: fixture.actorUserId,
      batchId: original.batchId,
      idempotencyKey: 'reprint-1',
    });
    expect(reprint.reprintOfBatchId).toBe(original.batchId);
    expect(reprint.items[0]?.priceCents).toBe(1490);
    const retryReprint = await reprintPriceLabelBatchAtomic(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      actorUserId: fixture.actorUserId,
      batchId: original.batchId,
      idempotencyKey: 'reprint-1',
    });
    expect(retryReprint.batchId).toBe(reprint.batchId);
    const auditCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_events
       WHERE tenant_id = ? AND action = 'PRICE_LABEL_REPRINT'`,
    )
      .bind(fixture.tenantId)
      .first<{ n: number }>();
    expect(auditCount?.n).toBe(1);
  });

  it('derives PARTIAL then ACKED from independent item outcomes', async () => {
    const fixture = await seed('labels-ack');
    const batch = await createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      products: fixture.products.map((productId) => ({ productId, copies: 1 })),
      idempotencyKey: 'ack',
    });
    const result = await acknowledgePriceLabelItems(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      batchId: batch.batchId,
      acknowledgements: [
        { itemId: batch.items[0]!.itemId, status: 'ACKED' },
        { itemId: batch.items[1]!.itemId, status: 'FAILED', errorCode: 'PRINTER_TIMEOUT' },
      ],
    });
    expect(result.batchStatus).toBe('PARTIAL');
    expect(result.retryItemIds).toEqual([batch.items[1]!.itemId]);
    const completed = await acknowledgePriceLabelItems(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      batchId: batch.batchId,
      acknowledgements: [{ itemId: batch.items[1]!.itemId, status: 'ACKED' }],
    });
    expect(completed.batchStatus).toBe('ACKED');
  });

  it('keeps concurrent creation coherent and audit reprints hash-chained without forks', async () => {
    const fixture = await seed('labels-race');
    const create = () =>
      createPriceLabelBatchAtomic(env.DB, {
        ...batchScope(fixture),
        products: fixture.products.map((productId) => ({ productId, copies: 1 })),
        idempotencyKey: 'same-request',
      });
    const [first, second] = await Promise.all([create(), create()]);
    expect(second.batchId).toBe(first.batchId);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM price_label_batches
       WHERE tenant_id = ? AND idempotency_key = 'same-request'`,
    )
      .bind(fixture.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);

    const update = env.DB.batch([
      env.DB.prepare(
        `UPDATE product_prices SET price_cents = 2690 WHERE tenant_id = ? AND product_id = ?`,
      ).bind(fixture.tenantId, fixture.products[0]),
      env.DB.prepare(
        `UPDATE product_prices SET price_cents = 1390 WHERE tenant_id = ? AND product_id = ?`,
      ).bind(fixture.tenantId, fixture.products[1]),
    ]);
    const next = createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      products: fixture.products.map((productId) => ({ productId, copies: 1 })),
      idempotencyKey: 'coherent-race',
    });
    const [, raced] = await Promise.all([update, next]);
    expect([
      [2590, 1290],
      [2690, 1390],
    ]).toContainEqual(raced.items.map((item) => item.priceCents));

    const concurrent = await Promise.allSettled([
      acknowledgePriceLabelItems(env.DB, {
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
        batchId: first.batchId,
        acknowledgements: [{ itemId: first.items[0]!.itemId, status: 'ACKED' }],
      }),
      reprintPriceLabelBatchAtomic(env.DB, {
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
        actorUserId: fixture.actorUserId,
        batchId: first.batchId,
        idempotencyKey: 'audit-race-a',
      }),
      reprintPriceLabelBatchAtomic(env.DB, {
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
        actorUserId: fixture.actorUserId,
        batchId: first.batchId,
        idempotencyKey: 'audit-race-b',
      }),
    ]);
    expect(concurrent.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
    ]);
    const audits = await env.DB.prepare(
      `SELECT prev_hash, row_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'PRICE_LABEL_REPRINT' ORDER BY rowid`,
    )
      .bind(fixture.tenantId)
      .all<{ prev_hash: string | null; row_hash: string }>();
    expect(audits.results).toHaveLength(1);
    audits.results.forEach((audit, index) => {
      expect(audit.row_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(audit.prev_hash).toBe(index === 0 ? null : audits.results[index - 1]?.row_hash);
    });
    const reprintCounts = await env.DB.prepare(
      `SELECT
         COUNT(*) AS batches,
         (SELECT COUNT(*) FROM price_label_items i
          INNER JOIN price_label_batches b ON b.tenant_id = i.tenant_id AND b.id = i.batch_id
          WHERE b.tenant_id = ? AND b.reprint_of_batch_id = ?) AS items
       FROM price_label_batches
       WHERE tenant_id = ? AND reprint_of_batch_id = ?`,
    )
      .bind(fixture.tenantId, first.batchId, fixture.tenantId, first.batchId)
      .first<{ batches: number; items: number }>();
    expect(reprintCounts).toEqual({ batches: 1, items: 2 });
  });

  it('rolls back batch/items when the atomic tail fails', async () => {
    const fixture = await seed('labels-rollback');
    await env.DB.prepare(
      `CREATE TRIGGER fail_labels_tail BEFORE INSERT ON price_label_items
       WHEN NEW.tenant_id = '${fixture.tenantId}' AND NEW.ordinal = 1
       BEGIN SELECT RAISE(ABORT, 'TEST_LABEL_TAIL_FAILURE'); END`,
    ).run();
    await expect(
      createPriceLabelBatchAtomic(env.DB, {
        ...batchScope(fixture),
        products: fixture.products.map((productId) => ({ productId, copies: 1 })),
        idempotencyKey: 'rollback',
      }),
    ).rejects.toThrow('TEST_LABEL_TAIL_FAILURE');
    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM price_label_batches WHERE tenant_id = ?) AS batches,
        (SELECT COUNT(*) FROM price_label_items WHERE tenant_id = ?) AS items`,
    )
      .bind(fixture.tenantId, fixture.tenantId)
      .first<{ batches: number; items: number }>();
    expect(counts).toEqual({ batches: 0, items: 0 });
  });

  it('rolls back reprint batch, items and audit together when audit append fails', async () => {
    const fixture = await seed('labels-audit-rollback');
    const original = await createPriceLabelBatchAtomic(env.DB, {
      ...batchScope(fixture),
      products: fixture.products.map((productId) => ({ productId, copies: 1 })),
      idempotencyKey: 'audit-rollback-original',
    });
    await env.DB.prepare(
      `CREATE TRIGGER fail_reprint_audit BEFORE INSERT ON audit_events
       WHEN NEW.tenant_id = '${fixture.tenantId}' AND NEW.action = 'PRICE_LABEL_REPRINT'
       BEGIN SELECT RAISE(ABORT, 'TEST_REPRINT_AUDIT_FAILURE'); END`,
    ).run();
    await expect(
      reprintPriceLabelBatchAtomic(env.DB, {
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
        actorUserId: fixture.actorUserId,
        batchId: original.batchId,
        idempotencyKey: 'audit-rollback-reprint',
      }),
    ).rejects.toThrow('TEST_REPRINT_AUDIT_FAILURE');
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM price_label_batches
          WHERE tenant_id = ? AND reprint_of_batch_id IS NOT NULL) AS reprints,
         (SELECT COUNT(*) FROM price_label_items i
          INNER JOIN price_label_batches b ON b.tenant_id = i.tenant_id AND b.id = i.batch_id
          WHERE b.tenant_id = ? AND b.reprint_of_batch_id IS NOT NULL) AS reprint_items,
         (SELECT COUNT(*) FROM audit_events
          WHERE tenant_id = ? AND action = 'PRICE_LABEL_REPRINT') AS audits`,
    )
      .bind(fixture.tenantId, fixture.tenantId, fixture.tenantId)
      .first<{ reprints: number; reprint_items: number; audits: number }>();
    expect(counts).toEqual({ reprints: 0, reprint_items: 0, audits: 0 });
  });
});
