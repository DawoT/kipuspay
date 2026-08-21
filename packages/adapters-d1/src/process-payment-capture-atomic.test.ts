import { describe, expect, it } from 'vitest';
import {
  createPendingCaptureAtomic,
  insertManualCaptureAtomic,
  isDbUnavailable,
  settleCaptureAtomic,
} from './process-payment-capture-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(state: { existing?: { id: string; status: string } | null }): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM payment_captures')) {
            if (!state.existing) return Promise.resolve(null);
            // Payload del fixture: saleId 's1', salePaymentId 'sp1', 1000 cents.
            return Promise.resolve({
              id: state.existing.id,
              status: state.existing.status,
              sale_id: 's1',
              sale_payment_id: 'sp1',
              amount_cents: 1000,
            } as T | null);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult([] as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

interface CaptureRow {
  id: string;
  tenant_id: string;
  sale_id: string;
  sale_payment_id: string;
  acquirer: string;
  status: string;
  amount_cents: number;
  idempotency_key: string;
}

/**
 * Fake D1 con la UNIQUE (tenant_id, idempotency_key) REAL de payment_captures:
 * el segundo INSERT concurrente choca igual que en producción (D1Error del
 * batch) y expone la fila ganadora al re-SELECT — el terreno exacto de US-02.
 */
function concurrentCaptureDb(): { db: D1DatabaseLike; count: () => number } {
  const rowsByKey = new Map<string, CaptureRow>();
  const keyOf = (tenantId: string, idemKey: string) => `${tenantId}\u0000${idemKey}`;
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      const bound = {
        _sql: sql,
        _params: [] as unknown[],
        bind(...params: unknown[]) {
          bound._params = params;
          return bound;
        },
        first: <T>() => {
          if (sql.includes('FROM payment_captures')) {
            const row = rowsByKey.get(
              keyOf(bound._params[0] as string, bound._params[1] as string),
            );
            return Promise.resolve(
              (row
                ? {
                    id: row.id,
                    status: row.status,
                    sale_id: row.sale_id,
                    sale_payment_id: row.sale_payment_id,
                    amount_cents: row.amount_cents,
                  }
                : null) as T | null,
            );
          }
          return Promise.resolve(null as T | null);
        },
        all: <T>() => Promise.resolve(okResult([] as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return bound;
    },
    batch: (stmts: readonly D1Bound[]) => {
      for (const stmt of stmts as unknown as Array<{ _sql: string; _params: unknown[] }>) {
        if (stmt._sql.includes('INSERT INTO payment_captures')) {
          const [id, tenantId, saleId, salePaymentId, acquirer, , amountCents, idemKey] =
            stmt._params as [string, string, string, string, string, unknown, number, string];
          const k = keyOf(tenantId, idemKey);
          if (rowsByKey.has(k)) {
            return Promise.reject(
              new Error(
                'UNIQUE constraint failed: payment_captures.tenant_id, payment_captures.idempotency_key',
              ),
            );
          }
          rowsByKey.set(k, {
            id,
            tenant_id: tenantId,
            sale_id: saleId,
            sale_payment_id: salePaymentId,
            acquirer,
            status: 'PENDING',
            amount_cents: amountCents,
            idempotency_key: idemKey,
          });
        }
      }
      return Promise.resolve(stmts.map(() => okResult()));
    },
  };
  return { db, count: () => rowsByKey.size };
}

/**
 * Fake D1 para el hueco fail-closed de US-02: el batch choca con la UNIQUE
 * (error crudo real de D1) y el re-SELECT del ganador falla (DB caída) o no
 * ve la fila. La adapter debe fallar-closed con `DB_UNAVAILABLE` (código
 * estable), jamás re-lanzar el SQL interno del constraint a la ruta.
 */
function uniqueReselectFailureDb(mode: 'down' | 'invisible'): { db: D1DatabaseLike } {
  let capturesSelected = 0;
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM payment_captures')) {
            capturesSelected += 1;
            // 1er SELECT (pre-check): fila aún no visible → se intenta el INSERT.
            if (capturesSelected === 1) return Promise.resolve(null as T | null);
            // Re-SELECT del ganador: DB caída o fila no visible.
            if (mode === 'down') {
              return Promise.reject(new Error('D1_ERROR: SQLITE_ERROR: database is locked'));
            }
            return Promise.resolve(null as T | null);
          }
          return Promise.resolve(null as T | null);
        },
        all: <T>() => Promise.resolve(okResult([] as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: () =>
      Promise.reject(
        new Error(
          'UNIQUE constraint failed: payment_captures.tenant_id, payment_captures.idempotency_key',
        ),
      ),
  };
  return { db };
}

describe('process-payment-capture-atomic', () => {
  it('create PENDING', async () => {
    const res = await createPendingCaptureAtomic(mockDb({ existing: null }), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'off:0:yape',
    });
    expect(res.status).toBe('PENDING');
    expect(res.idempotent).toBe(false);
  });

  it('idempotent reintento', async () => {
    const res = await createPendingCaptureAtomic(
      mockDb({ existing: { id: 'c1', status: 'PENDING' } }),
      't1',
      {
        saleId: 's1',
        salePaymentId: 'sp1',
        methodCode: 'yape',
        amountCents: 1000,
        idempotencyKey: 'off:0:yape',
      },
    );
    expect(res.id).toBe('c1');
    expect(res.idempotent).toBe(true);
  });

  it('A3: reintento idempotente devuelve el status REAL, no PENDING hardcodeado', async () => {
    const res = await createPendingCaptureAtomic(
      mockDb({ existing: { id: 'c1', status: 'CAPTURED' } }),
      't1',
      {
        saleId: 's1',
        salePaymentId: 'sp1',
        methodCode: 'yape',
        amountCents: 1000,
        idempotencyKey: 'off:0:yape',
      },
    );
    expect(res.id).toBe('c1');
    expect(res.status).toBe('CAPTURED');
    expect(res.idempotent).toBe(true);
  });

  it('US-02: reintento secuencial con payload distinto → IDEMPOTENCY_MISMATCH (no replay)', async () => {
    const { db } = concurrentCaptureDb();
    const input = {
      saleId: 's1',
      salePaymentId: 'sp1',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'off:0:yape',
    } as const;
    await createPendingCaptureAtomic(db, 't1', input);
    await expect(
      createPendingCaptureAtomic(db, 't1', { ...input, amountCents: 999 }),
    ).rejects.toThrow('IDEMPOTENCY_MISMATCH');
  });

  it('US-02: doble create concurrente (Promise.all) misma key → COUNT(*)=1, un ganador y un replay idempotente, sin error crudo', async () => {
    const { db, count } = concurrentCaptureDb();
    const input = {
      saleId: 's1',
      salePaymentId: 'sp1',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'off:0:yape',
    } as const;
    const [a, b] = await Promise.all([
      createPendingCaptureAtomic(db, 't1', input),
      createPendingCaptureAtomic(db, 't1', input),
    ]);
    // La UNIQUE (tenant_id, idempotency_key) dejó exactamente UNA fila.
    expect(count()).toBe(1);
    // Misma captura ganadora para ambos; exactamente uno fue el creador.
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('PENDING');
    expect(b.status).toBe('PENDING');
    expect([a.idempotent, b.idempotent].sort()).toEqual([false, true]);
  });

  it('US-02: colisión concurrente con payload distinto → IDEMPOTENCY_MISMATCH, COUNT(*)=1', async () => {
    const { db, count } = concurrentCaptureDb();
    const base = { saleId: 's1', salePaymentId: 'sp1', methodCode: 'yape' } as const;
    const results = await Promise.allSettled([
      createPendingCaptureAtomic(db, 't1', { ...base, amountCents: 1000, idempotencyKey: 'k1' }),
      createPendingCaptureAtomic(db, 't1', { ...base, amountCents: 999, idempotencyKey: 'k1' }),
    ]);
    const mismatches = results.filter(
      (r) => r.status === 'rejected' && (r.reason as Error).message === 'IDEMPOTENCY_MISMATCH',
    );
    expect(mismatches).toHaveLength(1);
    expect(count()).toBe(1);
  });

  it('US-02 fail-closed: UNIQUE + re-SELECT del ganador con la DB caída → DB_UNAVAILABLE estable, sin SQL interno', async () => {
    const { db } = uniqueReselectFailureDb('down');
    const err = await createPendingCaptureAtomic(db, 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'off:0:yape',
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    // Código estable fail-closed; nunca el mensaje crudo del constraint D1.
    expect((err as Error).message).toBe('DB_UNAVAILABLE');
    expect((err as Error).message).not.toMatch(/UNIQUE|constraint/i);
    expect(isDbUnavailable(err)).toBe(true);
  });

  it('US-02 fail-closed: UNIQUE sin fila ganadora visible → DB_UNAVAILABLE (no se re-lanza el SQL)', async () => {
    const { db } = uniqueReselectFailureDb('invisible');
    const err = await createPendingCaptureAtomic(db, 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      methodCode: 'yape',
      amountCents: 1000,
      idempotencyKey: 'off:0:yape',
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('DB_UNAVAILABLE');
    expect((err as Error).message).not.toMatch(/UNIQUE|constraint/i);
  });

  it('settle CAPTURED', async () => {
    const res = await settleCaptureAtomic(
      mockDb({ existing: { id: 'c1', status: 'PENDING' } }),
      't1',
      { captureId: 'c1', toStatus: 'CAPTURED', acquirerRef: 'ref-1' },
    );
    expect(res.status).toBe('CAPTURED');
  });

  it('manual capture', async () => {
    const res = await insertManualCaptureAtomic(mockDb({ existing: null }), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      acquirer: 'yape',
      amountCents: 500,
      idempotencyKey: 'off:0:yape',
    });
    expect(res.id).toBeTruthy();
  });

  it('cash method no PENDING', async () => {
    await expect(
      createPendingCaptureAtomic(mockDb({ existing: null }), 't1', {
        saleId: 's1',
        salePaymentId: 'sp1',
        methodCode: 'cash',
        amountCents: 100,
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow('CAPTURE_REQUIRES_ACQUIRER');
  });
});
