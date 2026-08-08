import { describe, expect, it } from 'vitest';
import { createGenericPrintOutbox } from './generic-print-outbox.js';

describe('generic non-cash-blocking print outbox', () => {
  it('survives F5 and resumes only unacknowledged price-label items', async () => {
    const storage = new Map();
    const first = createGenericPrintOutbox({ storage });
    await first.enqueue({
      jobId: 'price-labels/batch-1',
      kind: 'PRICE_LABEL_BATCH',
      items: [
        { itemId: 'item-1', payload: new Uint8Array([1]) },
        { itemId: 'item-2', payload: new Uint8Array([2]) },
      ],
    });
    await first.acknowledge('price-labels/batch-1', 'item-1');

    const afterReload = createGenericPrintOutbox({ storage });
    expect(await afterReload.pendingItemIds('price-labels/batch-1')).toEqual(['item-2']);
  });

  it('warns at 80% and preserves work on quota exhaustion', async () => {
    const outbox = createGenericPrintOutbox({
      storage: new Map(),
      quota: { usage: 80, quota: 100 },
    });
    expect(outbox.quotaState()).toBe('WARNING');
    await expect(
      outbox.enqueue({
        jobId: 'price-labels/batch-2',
        kind: 'PRICE_LABEL_BATCH',
        items: [{ itemId: 'item-3', payload: new Uint8Array(101) }],
      }),
    ).rejects.toThrow('PRINT_OUTBOX_QUOTA_EXCEEDED');
    expect(await outbox.hasCorruption()).toBe(false);
  });

  it('never contributes a blocker to sale completion or close Z', () => {
    const outbox = createGenericPrintOutbox({ storage: new Map() });
    expect(outbox.countCashBlockingJobs()).toBe(0);
    expect(outbox.canCloseCashRegister()).toBe(true);
  });

  it('reports malformed persisted values without reading their fields', async () => {
    const storage = new Map<unknown, unknown>([
      ['print_jobs/corrupt', null],
      ['print_jobs/also-corrupt', { blocksCashClose: true, items: 'invalid' }],
    ]);
    const outbox = createGenericPrintOutbox({ storage });

    expect(outbox.countCashBlockingJobs()).toBe(0);
    expect(outbox.canCloseCashRegister()).toBe(true);
    await expect(outbox.hasCorruption()).resolves.toBe(true);
  });
});
