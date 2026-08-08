import { describe, expect, it, vi } from 'vitest';
import {
  acknowledgePriceLabelItems,
  createPriceLabelBatchAtomic,
  reprintPriceLabelBatchAtomic,
  retryPriceLabelBatch,
} from './price-labels.js';

function db() {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
  };
}

describe('Sprint 41 D1 price-label authority', () => {
  it('resolves an explicit ordered product list with branch-default list fallback', async () => {
    const database = db();
    await createPriceLabelBatchAtomic(database, {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      actorUserId: 'supervisor-a',
      templateId: 'template-a',
      productIds: ['product-2', 'product-1'],
      idempotencyKey: 'request-1',
    });
    expect(database.batch).toHaveBeenCalledOnce();
    expect(database.prepare).toHaveBeenCalledWith(expect.stringContaining('price_lists'));
  });

  it('rejects cross-tenant product, list and template references', async () => {
    await expect(
      createPriceLabelBatchAtomic(db(), {
        tenantId: 'tenant-a',
        branchId: 'branch-a',
        actorUserId: 'supervisor-a',
        templateId: 'template-b',
        priceListId: 'list-b',
        productIds: ['product-b'],
        idempotencyKey: 'cross-tenant',
      }),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
  });

  it('ignores client price and materializes one coherent snapshot during a price change', async () => {
    const result = await createPriceLabelBatchAtomic(db(), {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      actorUserId: 'supervisor-a',
      templateId: 'template-a',
      priceListId: 'list-a',
      productIds: ['product-1', 'product-2'],
      idempotencyKey: 'coherent-1',
      clientPriceCents: 1,
    });
    expect(result.items.map((item) => item.priceCents)).toEqual([1290, 2590]);
    expect(result).not.toHaveProperty('clientPriceCents');
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps retry snapshots but explicit reprint refreshes price and audits', async () => {
    const database = db();
    const retry = await retryPriceLabelBatch(database, {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      batchId: 'batch-1',
    });
    expect(retry.batchId).toBe('batch-1');
    expect(retry.snapshotHash).toBe('original-snapshot-hash');

    const reprint = await reprintPriceLabelBatchAtomic(database, {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      actorUserId: 'supervisor-a',
      batchId: 'batch-1',
      idempotencyKey: 'reprint-1',
    });
    expect(reprint.batchId).not.toBe('batch-1');
    expect(reprint.reprintOfBatchId).toBe('batch-1');
    expect(database.prepare).toHaveBeenCalledWith(expect.stringContaining('PRICE_LABEL_REPRINT'));
  });

  it('ACKs items independently and retries only non-ACKed items', async () => {
    const result = await acknowledgePriceLabelItems(db(), {
      tenantId: 'tenant-a',
      batchId: 'batch-1',
      acknowledgements: [
        { itemId: 'item-1', status: 'ACKED' },
        { itemId: 'item-2', status: 'FAILED', errorCode: 'PRINTER_TIMEOUT' },
      ],
    });
    expect(result.batchStatus).toBe('PARTIAL');
    expect(result.retryItemIds).toEqual(['item-2']);
  });
});
