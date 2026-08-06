import { describe, expect, it } from 'vitest';
import {
  claimWebhookDeliveryAtomic,
  enqueueWebhookDeliveryAtomic,
  settleWebhookDeliveryAtomic,
} from './process-webhook-delivery-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(state: {
  existingId?: string | null;
  delivery?: { status: string; attempt_count: number } | null;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM webhook_deliveries') && sql.includes('endpoint_id')) {
            return Promise.resolve(
              (state.existingId ? { id: state.existingId } : null) as T | null,
            );
          }
          if (sql.includes('SELECT status, attempt_count')) {
            return Promise.resolve((state.delivery ?? null) as T | null);
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

describe('process-webhook-delivery-atomic', () => {
  it('enqueue nuevo', async () => {
    const res = await enqueueWebhookDeliveryAtomic(mockDb({ existingId: null }), 't1', {
      endpointId: 'ep1',
      eventId: 'evt1',
      eventType: 'sale.created',
      payloadJson: '{}',
    });
    expect(res.idempotent).toBe(false);
  });

  it('enqueue idempotente UNIQUE', async () => {
    const res = await enqueueWebhookDeliveryAtomic(mockDb({ existingId: 'd1' }), 't1', {
      endpointId: 'ep1',
      eventId: 'evt1',
      eventType: 'sale.created',
      payloadJson: '{}',
    });
    expect(res).toEqual({ id: 'd1', idempotent: true });
  });

  it('claim PENDING', async () => {
    const res = await claimWebhookDeliveryAtomic(
      mockDb({ delivery: { status: 'PENDING', attempt_count: 0 } }),
      't1',
      'd1',
    );
    expect(res).toEqual({ ok: true, attemptCount: 1 });
  });

  it('claim rechaza DELIVERED', async () => {
    const res = await claimWebhookDeliveryAtomic(
      mockDb({ delivery: { status: 'DELIVERED', attempt_count: 1 } }),
      't1',
      'd1',
    );
    expect(res.ok).toBe(false);
  });

  it('settle success', async () => {
    const res = await settleWebhookDeliveryAtomic(mockDb({}), 't1', {
      deliveryId: 'd1',
      endpointId: 'ep1',
      success: true,
      attemptCount: 1,
      nowMs: 1_000,
      endpointFailureCount: 2,
    });
    expect(res).toEqual({ status: 'DELIVERED', endpointDisabled: false });
  });

  it('settle failure con auto-disable', async () => {
    const res = await settleWebhookDeliveryAtomic(mockDb({}), 't1', {
      deliveryId: 'd1',
      endpointId: 'ep1',
      success: false,
      attemptCount: 3,
      nowMs: 1_000,
      endpointFailureCount: 4,
      error: 'timeout',
    });
    expect(res.endpointDisabled).toBe(true);
    expect(res.status).toBe('FAILED');
  });
});
