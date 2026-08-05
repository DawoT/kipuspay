/**
 * Chaos QA Sprint 18 — concurrencia lógica mismo lote / kit (puro).
 * Dos consumidores no pueden tomar más stock del disponible.
 */
import { describe, expect, it } from 'vitest';
import { allocateFefo, explodeBom, InsufficientBatchStockError, type StockBatch } from './index.js';

describe('chaos stock lote/kit', () => {
  it('dos asignaciones FEFO concurrentes: la segunda falla si el lote se agota', () => {
    const batches: StockBatch[] = [
      { batchId: 'lot-a', productId: 'p1', qty: 5, expiresAtUtc: '2026-09-01T00:00:00Z' },
    ];
    const first = allocateFefo(batches, 'p1', 3, '2026-08-05T00:00:00Z');
    expect(first[0]!.qty).toBe(3);
    const remaining: StockBatch[] = [
      { batchId: 'lot-a', productId: 'p1', qty: 5 - 3, expiresAtUtc: '2026-09-01T00:00:00Z' },
    ];
    expect(() => allocateFefo(remaining, 'p1', 3, '2026-08-05T00:00:00Z')).toThrow(
      InsufficientBatchStockError,
    );
    expect(() => allocateFefo(remaining, 'p1', 2, '2026-08-05T00:00:00Z')).not.toThrow();
  });

  it('kit BOM: componente corto impide explosión usable (rollback total en adapter)', () => {
    const comps = [
      { componentProductId: 'c1', qtyPerKit: 2 },
      { componentProductId: 'c2', qtyPerKit: 1 },
    ];
    const need = explodeBom(comps, 3);
    expect(need).toEqual([
      { componentProductId: 'c1', qty: 6 },
      { componentProductId: 'c2', qty: 3 },
    ]);
    const available = new Map([
      ['c1', 6],
      ['c2', 2],
    ]);
    const short = need.some((l) => (available.get(l.componentProductId) ?? 0) < l.qty);
    expect(short).toBe(true);
  });
});
