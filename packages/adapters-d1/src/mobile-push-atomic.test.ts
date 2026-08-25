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

  it('Risco 2 (F-02): default TTL 360s — expires_at = created +360 (no 60, no 300 marginal)', async () => {
    const now = '2026-08-23T10:00:00.000Z';
    const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...params: readonly unknown[]) {
            captured.push({ sql, params });
            return {
              bind: () => ({}) as never,
              run: () =>
                Promise.resolve({ results: [], success: true, meta: { duration: 0, changes: 1 } }),
              first<T>() {
                return Promise.resolve(null as T | null);
              },
              all<T>() {
                return Promise.resolve({
                  results: [] as T[],
                  success: true,
                  meta: { duration: 0 },
                });
              },
            };
          },
        };
      },
      batch(statements: readonly unknown[]) {
        return Promise.resolve(
          statements.map(() => ({ results: [], success: true, meta: { duration: 0, changes: 1 } })),
        );
      },
    };
    await appendPushEventAtomic(db as never, {
      tenantId: 't1',
      userId: 'u1',
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId: 'close-ttl-360',
      idempotencyKeyHash: 'ttl-360-key',
      now,
    });
    const pushInsert = captured.find((c) => c.sql.includes('INSERT INTO push_events'));
    expect(pushInsert).toBeDefined();
    // VALUES order: id(0),tenant(1),event_type(2),source_type(3),source_id(4),idem(5),scope(6),target_user(7),target_branch(8),payload(9),amount(10),deep_kind(11),deep_entity(12),ttl(13),collapse(14),created(15),expires(16)
    const ttlSeconds = pushInsert?.params[13];
    const createdAt = pushInsert?.params[15] as string;
    const expiresAt = pushInsert?.params[16] as string;
    expect(ttlSeconds).toBe(360);
    expect(createdAt).toBe(now);
    const diffSec = (Date.parse(expiresAt) - Date.parse(createdAt)) / 1000;
    expect(diffSec).toBe(360);
    // Dispatcher criba e.expires_at > now; con TTL 360 el evento sigue VIVO al despertar del cron */5 (300s)
    const cronWake = new Date(Date.parse(now) + 300 * 1000).toISOString();
    expect(Date.parse(expiresAt) > Date.parse(cronWake)).toBe(true);
  });

  it('Risco 2: ttl explícito se respeta (no clamp a 360)', async () => {
    const captured: Array<{ sql: string; params: readonly unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...params: readonly unknown[]) {
            captured.push({ sql, params });
            return {
              bind: () => ({}) as never,
              run: () =>
                Promise.resolve({ results: [], success: true, meta: { duration: 0, changes: 1 } }),
              first<T>() {
                return Promise.resolve(null as T | null);
              },
              all<T>() {
                return Promise.resolve({
                  results: [] as T[],
                  success: true,
                  meta: { duration: 0 },
                });
              },
            };
          },
        };
      },
      batch(statements: readonly unknown[]) {
        return Promise.resolve(
          statements.map(() => ({ results: [], success: true, meta: { duration: 0, changes: 1 } })),
        );
      },
    };
    await appendPushEventAtomic(db as never, {
      tenantId: 't1',
      userId: 'u1',
      purpose: 'OWNER_ALERTS',
      eventType: 'CASH_CLOSE',
      sourceEntityId: 'close-ttl-600',
      idempotencyKeyHash: 'ttl-600-key',
      ttlSeconds: 600,
      now: '2026-08-23T10:00:00.000Z',
    });
    const pushInsert = captured.find((c) => c.sql.includes('INSERT INTO push_events'));
    expect(pushInsert?.params[13]).toBe(600);
  });
});
