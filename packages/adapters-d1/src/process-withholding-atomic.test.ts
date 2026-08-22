import { describe, expect, it } from 'vitest';
import { processPerceptionAtomic, processRetentionAtomic } from './process-withholding-atomic.js';

interface World {
  sale?: { id: string } | null;
  supplierInvoice?: { id: string } | null;
  series?: { id: string; series: string; current_number: number } | null;
  guardFails?: boolean;
}

function mockDb(world: World = {}, captured: string[] = []): never {
  const first = (sql: string) => {
    if (sql.includes('FROM sales')) return world.sale ?? null;
    if (sql.includes('FROM supplier_invoices')) return world.supplierInvoice ?? null;
    if (sql.includes('FROM branch_document_series')) return world.series ?? null;
    if (sql.includes('row_hash')) return null;
    return null;
  };
  const prepare = (sql: string) => ({
    sql,
    bind() {
      return { sql, first: () => Promise.resolve(first(sql)) };
    },
  });
  return {
    prepare,
    batch: (stmts: readonly { sql?: string }[]) => {
      for (const stmt of stmts) captured.push(stmt.sql ?? '');
      const guard = stmts.find((s) => (s.sql ?? '').includes('INSERT INTO atomic_guards'));
      if (guard && world.guardFails) throw new Error('CHECK constraint failed: atomic_guards');
      return Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } })));
    },
  } as never;
}

function worldWith(overrides: Partial<World> = {}): World {
  return {
    sale: { id: 's1' },
    supplierInvoice: { id: 'si1' },
    series: { id: 'ser-w', series: 'P001', current_number: 11 },
    ...overrides,
  };
}

describe('processWithholdingAtomic (P1c)', () => {
  it('percepción: calcula 2% y correlativo +1', async () => {
    const res = await processPerceptionAtomic(
      mockDb(worldWith()),
      't1',
      'b1',
      'u1',
      's1',
      'P001',
      10_000,
      'goods',
    );
    expect(res.amountCents).toBe(200);
    expect(res.number).toBe(12);
    expect(res.sunatStatus).toBe('PENDING');
    expect(res.ratePercentage).toBe(200);
  });

  it('percepción: categoría inválida → rechazo', async () => {
    await expect(
      processPerceptionAtomic(
        mockDb(worldWith()),
        't1',
        'b1',
        'u1',
        's1',
        'P001',
        10_000,
        'services',
      ),
    ).rejects.toThrow('INVALID_PERCEPTION_CATEGORY');
  });

  it('percepción: ORIGIN_SALE_NOT_FOUND sin venta', async () => {
    await expect(
      processPerceptionAtomic(
        mockDb(worldWith({ sale: null })),
        't1',
        'b1',
        'u1',
        's-x',
        'P001',
        100,
        'goods',
      ),
    ).rejects.toThrow('ORIGIN_SALE_NOT_FOUND');
  });

  it('retención: calcula 6% servicios y correlativo +1', async () => {
    const res = await processRetentionAtomic(
      mockDb(worldWith()),
      't1',
      'b1',
      'u1',
      'si1',
      'R001',
      10_000,
      'services',
    );
    expect(res.amountCents).toBe(600);
    expect(res.number).toBe(12);
    expect(res.ratePercentage).toBe(600);
  });

  it('retención: ORIGIN_SUPPLIER_INVOICE_NOT_FOUND', async () => {
    await expect(
      processRetentionAtomic(
        mockDb(worldWith({ supplierInvoice: null })),
        't1',
        'b1',
        'u1',
        'si-x',
        'R001',
        100,
        'goods',
      ),
    ).rejects.toThrow('ORIGIN_SUPPLIER_INVOICE_NOT_FOUND');
  });

  it('WITHHOLDING_SERIES_NOT_FOUND sin serie 02/20 activa', async () => {
    await expect(
      processPerceptionAtomic(
        mockDb(worldWith({ series: null })),
        't1',
        'b1',
        'u1',
        's1',
        'P001',
        100,
        'goods',
      ),
    ).rejects.toThrow('WITHHOLDING_SERIES_NOT_FOUND');
  });

  it('el guard aborta la doble emisión concurrente de la serie', async () => {
    await expect(
      processPerceptionAtomic(
        mockDb(worldWith({ guardFails: true })),
        't1',
        'b1',
        'u1',
        's1',
        'P001',
        100,
        'goods',
      ),
    ).rejects.toThrow('CHECK constraint failed');
  });

  it('encola fiscal_non_sale_outbox 02 y 20 en el mismo batch', async () => {
    const perceptionSql: string[] = [];
    await processPerceptionAtomic(
      mockDb(worldWith(), perceptionSql),
      't1',
      'b1',
      'u1',
      's1',
      'P001',
      10_000,
      'goods',
    );
    expect(perceptionSql.some((sql) => sql.includes('INSERT INTO fiscal_non_sale_outbox'))).toBe(
      true,
    );
    const retentionSql: string[] = [];
    await processRetentionAtomic(
      mockDb(
        worldWith({ series: { id: 'ser-r', series: 'R001', current_number: 3 } }),
        retentionSql,
      ),
      't1',
      'b1',
      'u1',
      'si1',
      'R001',
      10_000,
      'services',
    );
    expect(retentionSql.some((sql) => sql.includes('INSERT INTO fiscal_non_sale_outbox'))).toBe(
      true,
    );
  });
});
