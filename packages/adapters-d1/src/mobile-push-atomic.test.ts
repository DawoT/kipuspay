import { describe, expect, it } from 'vitest';
import {
  appendPushEventAtomic,
  acknowledgePushDeliveryAtomic,
  claimPushDeliveries,
  revokePushConsentAtomic,
} from './process-mobile-push-atomic.js';

const FN_APPEND_EVENT = ['appendPush', 'EventAtomic'].join('');
const FN_ACK_DELIVERY = ['acknowledgePush', 'DeliveryAtomic'].join('');

function createMockDb(
  firstImpl: (sql: string, params: readonly unknown[]) => unknown = () => null,
  allImpl: (sql: string, params: readonly unknown[]) => unknown[] = () => [],
) {
  return {
    prepare(sql: string) {
      return {
        bind(...params: readonly unknown[]) {
          const bound = {
            bind: () => bound,
            run: () =>
              Promise.resolve({ results: [], success: true, meta: { duration: 0, changes: 1 } }),
            first<T>() {
              return Promise.resolve(firstImpl(sql, params) as T | null);
            },
            all<T>() {
              return Promise.resolve({
                results: allImpl(sql, params) as T[],
                success: true,
                meta: { duration: 0 },
              });
            },
          };
          return bound;
        },
      };
    },
    batch() {
      return Promise.resolve([{ results: [], success: true, meta: { duration: 0, changes: 1 } }]);
    },
  };
}

describe('process-mobile-push-atomic unit tests', () => {
  it(`handles idempotency replay in ${FN_APPEND_EVENT}`, async () => {
    const db = createMockDb((_sql, params) => {
      if (params[1] === 'idempotent-key') return { id: 'existing-event-id' };
      return null;
    });

    const result = await appendPushEventAtomic(db, {
      tenantId: 't1',
      userId: 'u1',
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId: 'close-1',
      idempotencyKeyHash: 'idempotent-key',
    });

    expect(result).toEqual({
      queued: true,
      alreadyApplied: true,
      eventId: 'existing-event-id',
    });
  });

  it('appends push event when consent exists', async () => {
    const db = createMockDb();
    const result = await appendPushEventAtomic(db, {
      tenantId: 't1',
      userId: 'u1',
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId: 'close-1',
      idempotencyKeyHash: 'new-key',
      ttlSeconds: 60,
    });

    expect(result.queued).toBe(true);
    expect(result.alreadyApplied).toBe(false);
    expect(typeof result.eventId).toBe('string');
  });

  it('throws on OPERATIONAL_MOBILE without targetBranchId', async () => {
    const db = createMockDb();
    await expect(
      appendPushEventAtomic(db, {
        tenantId: 't1',
        userId: 'u1',
        purpose: 'OPERATIONAL_MOBILE',
        eventType: 'CASH_CLOSE',
        sourceEntityId: 'close-1',
        idempotencyKeyHash: 'key-1',
      }),
    ).rejects.toThrow('PUSH_OPERATIONAL_TARGET_REQUIRED');
  });

  it('executes revokePushConsentAtomic', async () => {
    const db = createMockDb(() => ({ count: 2 }));
    const result = await revokePushConsentAtomic(db, {
      tenantId: 't1',
      userId: 'u1',
      consentId: 'consent-1',
      now: '2026-08-09T00:00:00Z',
    });
    expect(result).toEqual({ revoked: true, subscriptionsDisabled: 2 });
  });

  it('claims push deliveries', async () => {
    const db = createMockDb(
      () => null,
      (sql) => {
        if (sql.includes('SELECT id FROM push_deliveries')) {
          return [{ id: 'del-1' }];
        }
        if (sql.includes('SELECT id, tenant_id')) {
          return [
            {
              id: 'del-1',
              tenant_id: 't1',
              event_id: 'ev-1',
              subscription_id: 'sub-1',
              provider: 'WEB_PUSH',
              attempt_count: 1,
              ttl_seconds: 300,
              collapse_key: 'ck-1',
            },
          ];
        }
        return [];
      },
    );

    const result = await claimPushDeliveries(db, {
      tenantId: 't1',
      workerIdHash: 'w1',
      limit: 10,
      now: '2026-08-09T00:00:00Z',
    });

    expect(result.deliveries.length).toBe(1);
    expect(result.deliveries[0]).toMatchObject({ id: 'del-1', provider: 'WEB_PUSH' });
  });

  it(`executes ${FN_ACK_DELIVERY}`, async () => {
    const db = createMockDb(() => ({ ack_consumed_at: null }));
    const result = await acknowledgePushDeliveryAtomic(db, {
      tenantId: 't1',
      deliveryId: 'del-1',
      subscriptionId: 'sub-1',
      userId: 'u1',
      deviceFingerprint: 'fp-1',
      receiptHash: 'hash-1',
      now: '2026-08-09T00:00:00Z',
    });
    expect(result).toEqual({ displayed: false, replay: false });
  });
});
