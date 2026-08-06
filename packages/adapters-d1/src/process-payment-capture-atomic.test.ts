import { describe, expect, it } from 'vitest';
import {
  createPendingCaptureAtomic,
  settleCaptureAtomic,
  insertManualCaptureAtomic,
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
            return Promise.resolve((state.existing ?? null) as T | null);
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
