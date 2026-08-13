import { describe, expect, it } from 'vitest';
import { processRemissionGuideAtomic } from './process-remission-guide-atomic.js';
import type { RemissionGuideRequest } from '@kipuspay/domain-fiscal-pe';

interface World {
  series?: { id: string; series: string; current_number: number } | null;
  guardFails?: boolean;
}

const REQUEST: RemissionGuideRequest = {
  series: 'T001',
  transferReasonCode: '01',
  transportModeCode: '01',
  vehiclePlate: 'ABC-123',
  carrier: { documentType: '01', documentNumber: '12345678', name: 'Carlos Ruiz' },
  origin: { ubigeo: '150101', address: 'Av. Lima 100' },
  destination: { ubigeo: '070101', address: 'Jr. Callao 200' },
  transferStartedAt: '2026-08-12T15:00:00.000Z',
  items: [{ productId: 'p1', quantityMicrounits: 5_000_000, uomCode: 'NIU' }],
};

function mockDb(world: World = {}): never {
  const first = (sql: string) => {
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
      const guard = stmts.find((s) => (s.sql ?? '').includes('INSERT INTO atomic_guards'));
      if (guard && world.guardFails) throw new Error('CHECK constraint failed: atomic_guards');
      return Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } })));
    },
  } as never;
}

function worldWith(overrides: Partial<World> = {}): World {
  return { series: { id: 'ser-t', series: 'T001', current_number: 7 }, ...overrides };
}

describe('processRemissionGuideAtomic (P1b)', () => {
  it('emite GRE con correlativo serie T +1 y estado PENDING', async () => {
    const res = await processRemissionGuideAtomic(mockDb(worldWith()), 't1', 'b1', 'u1', REQUEST);
    expect(res.series).toBe('T001');
    expect(res.number).toBe(8);
    expect(res.sunatStatus).toBe('PENDING');
    expect(res.transferReasonCode).toBe('01');
  });

  it('rechaza motivo fuera del catálogo 18', async () => {
    await expect(
      processRemissionGuideAtomic(mockDb(worldWith()), 't1', 'b1', 'u1', {
        ...REQUEST,
        transferReasonCode: '99',
      }),
    ).rejects.toThrow('INVALID_TRANSFER_REASON');
  });

  it('GRE_SERIES_NOT_FOUND sin serie T activa', async () => {
    await expect(
      processRemissionGuideAtomic(mockDb(worldWith({ series: null })), 't1', 'b1', 'u1', REQUEST),
    ).rejects.toThrow('GRE_SERIES_NOT_FOUND');
  });

  it('el guard aborta la doble emisión concurrente de la misma serie', async () => {
    await expect(
      processRemissionGuideAtomic(
        mockDb(worldWith({ guardFails: true })),
        't1',
        'b1',
        'u1',
        REQUEST,
      ),
    ).rejects.toThrow('CHECK constraint failed');
  });
});
