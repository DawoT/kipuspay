/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- absent Sprint 45 module is the intentional RED boundary */
import { describe, expect, it, vi } from 'vitest';
import {
  appendPushEventAtomic,
  claimPushDeliveries,
  revokePushConsentAtomic,
} from './process-mobile-push-atomic.js';

describe('Sprint 45 D1/workerd outbox contract (RED)', () => {
  it('requires current consent and deduplicates event by tenant idempotency hash', async () => {
    const db = {
      prepare: vi.fn(),
      batch: vi.fn(async () => [{ success: true }, { success: true }]),
    };
    await expect(
      appendPushEventAtomic(db, {
        tenantId: 'tenant-a',
        userId: 'owner-a',
        purpose: 'OWNER_ALERTS',
        eventType: 'CASH_DISCREPANCY',
        sourceEntityId: 'shift-a',
        idempotencyKeyHash: 'event-hash-a',
      }),
    ).resolves.toMatchObject({ queued: true, alreadyApplied: false });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it('revokes every subscription for the consent in one D1 batch', async () => {
    const db = {
      prepare: vi.fn(),
      batch: vi.fn(async () => [{ success: true }, { success: true }]),
    };
    await expect(
      revokePushConsentAtomic(db, {
        tenantId: 'tenant-a',
        userId: 'owner-a',
        consentId: 'consent-a',
        now: '2026-08-08T20:00:00.000Z',
      }),
    ).resolves.toMatchObject({ revoked: true, subscriptionsDisabled: expect.any(Number) });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it('claims due deliveries with bounded leases and no cross-tenant rows', async () => {
    const result = await claimPushDeliveries(
      {
        prepare: vi.fn(),
        batch: vi.fn(),
      },
      {
        tenantId: 'tenant-a',
        workerIdHash: 'worker-a',
        limit: 50,
        now: '2026-08-08T20:00:00.000Z',
      },
    );
    expect(result.hasMore).toEqual(expect.any(Boolean));
    expect(result.deliveries).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ tenantId: 'tenant-b' })]),
    );
    expect(result.deliveries.length).toBeLessThanOrEqual(50);
  });
});
