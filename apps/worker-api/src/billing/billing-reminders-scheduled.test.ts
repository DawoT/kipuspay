/* eslint-disable @typescript-eslint/no-explicit-any -- focused D1 boundary fake */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reminderDayFor, runBillingRemindersScheduled } from './billing-reminders-scheduled.js';

const appendPushEventAtomic = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  appendPushEventAtomic,
}));

/** D1 fake: rows de tenants past_due, count de reminders y owner por tenant. */
function fakeDb(options: {
  tenants: readonly { tenant_id: string }[];
  counts?: Record<string, number>;
  ownerIds?: Record<string, string | null>;
}) {
  return {
    prepare: (sql: string) => {
      const stmt = {
        bind: (...args: string[]) => {
          const tenantId = args[0] ?? '';
          return {
            first: () => {
              if (sql.includes('COUNT(*)')) {
                return Promise.resolve({ n: options.counts?.[tenantId] ?? 0 });
              }
              if (sql.includes("role = 'owner'")) {
                const owner = options.ownerIds?.[tenantId];
                return Promise.resolve(owner ? { id: owner } : null);
              }
              return Promise.resolve(null);
            },
          };
        },
        first: () => {
          if (sql.includes('FROM tenants')) return Promise.resolve(null);
          return Promise.resolve({ n: 0 });
        },
        all: () => Promise.resolve({ results: options.tenants }),
        run: () => Promise.resolve({ success: true }),
      };
      return stmt;
    },
  };
}

describe('billing-reminders (S9-A3 anti-apagado)', () => {
  beforeEach(() => {
    appendPushEventAtomic.mockClear();
  });

  it('sin DB → no op', async () => {
    await expect(runBillingRemindersScheduled({}, { nowMs: Date.now() })).resolves.toEqual({
      remindersEmitted: 0,
      tenantsScanned: 0,
    });
  });

  it('sin tenants past_due → sin reminders', async () => {
    const env = { DB: fakeDb({ tenants: [] }) } as never;
    const res = await runBillingRemindersScheduled(env, { nowMs: Date.now() });
    expect(res).toEqual({ remindersEmitted: 0, tenantsScanned: 0 });
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });

  it('tenants past_due con owner push → emite recordatorio día 1 idempotente por día', async () => {
    const env = {
      DB: fakeDb({
        tenants: [{ tenant_id: 't-past-due' }],
        counts: { 't-past-due': 0 },
        ownerIds: { 't-past-due': 'owner-1' },
      }),
    } as never;
    const res = await runBillingRemindersScheduled(env, {
      nowMs: Date.parse('2026-08-14T12:00:00.000Z'),
    });
    expect(res).toEqual({ remindersEmitted: 1, tenantsScanned: 1 });
    expect(appendPushEventAtomic).toHaveBeenCalledTimes(1);
    const call = appendPushEventAtomic.mock.calls[0] as [unknown, any];
    expect(call[1]).toMatchObject({
      tenantId: 't-past-due',
      userId: 'owner-1',
      purpose: 'OWNER_ALERTS',
      eventType: 'BILLING_REMINDER',
      idempotencyKeyHash: 'billing:t-past-due:2026-08-14:day1',
      deepLinkKind: 'billing_reminder',
    });
  });

  it('ya emitió 3 recordatorios → no emite más', async () => {
    const env = {
      DB: fakeDb({
        tenants: [{ tenant_id: 't-past-due' }],
        counts: { 't-past-due': 3 },
        ownerIds: { 't-past-due': 'owner-1' },
      }),
    } as never;
    const res = await runBillingRemindersScheduled(env, { nowMs: Date.now() });
    expect(res).toEqual({ remindersEmitted: 0, tenantsScanned: 1 });
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });

  it('máximo 3 recordatorios (día 4 no se emite)', () => {
    expect(reminderDayFor(0)).toBe(1);
    expect(reminderDayFor(1)).toBe(2);
    expect(reminderDayFor(2)).toBe(3);
    expect(reminderDayFor(3)).toBeNull();
    expect(reminderDayFor(9)).toBeNull();
  });

  it('sin capability mobile.push en el owner → skip (best-effort, no rompe)', async () => {
    const env = {
      DB: fakeDb({
        tenants: [{ tenant_id: 't-x' }],
        counts: { 't-x': 0 },
        ownerIds: { 't-x': null },
      }),
    } as never;
    const res = await runBillingRemindersScheduled(env, { nowMs: Date.now() });
    expect(res).toEqual({ remindersEmitted: 0, tenantsScanned: 1 });
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });
});
