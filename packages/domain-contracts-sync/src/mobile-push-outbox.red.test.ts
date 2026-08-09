import { describe, expect, it } from 'vitest';
import {
  appendPushIntentAfterOrigin,
  consumeDisplayedReceipt,
  createDisplayedReceipt,
} from './mobile-push-outbox.js';

describe('Sprint 45 push outbox and DISPLAYED receipt contract (RED)', () => {
  it('never blocks or rolls back the origin when push append fails', async () => {
    const origin = { id: 'cash-close-a', committed: true };
    const result = await appendPushIntentAfterOrigin({
      origin,
      appendIntent: () => Promise.reject(new Error('PUSH_OUTBOX_UNAVAILABLE')),
    });
    expect(result).toEqual({
      origin,
      push: { queued: false, failure: 'PUSH_OUTBOX_UNAVAILABLE' },
    });
    expect(result.origin.committed).toBe(true);
  });

  it('binds an opaque signed receipt to delivery, tenant, subscription, and device', async () => {
    const receipt = await createDisplayedReceipt({
      tenantId: 'tenant-a',
      deliveryId: 'delivery-a',
      subscriptionId: 'subscription-a',
      deviceFingerprint: 'device-a',
      issuedAtSeconds: 1_000,
      expiresAtSeconds: 1_300,
    });
    expect(receipt.token).not.toContain('tenant-a');
    expect(receipt.expiresAtSeconds - receipt.issuedAtSeconds).toBeLessThanOrEqual(300);
  });

  it('accepts DISPLAYED exactly once and rejects replay, mismatch, and expiry', async () => {
    const receipt = await createDisplayedReceipt({
      tenantId: 'tenant-a',
      deliveryId: 'delivery-a',
      subscriptionId: 'subscription-a',
      deviceFingerprint: 'device-a',
      issuedAtSeconds: 1_000,
      expiresAtSeconds: 1_300,
    });
    const input = {
      token: receipt.token,
      tenantId: 'tenant-a',
      deliveryId: 'delivery-a',
      subscriptionId: 'subscription-a',
      deviceFingerprint: 'device-a',
      nowSeconds: 1_100,
    };
    await expect(consumeDisplayedReceipt(input)).resolves.toMatchObject({
      status: 'DISPLAYED',
      consumed: true,
    });
    await expect(consumeDisplayedReceipt(input)).rejects.toThrow('PUSH_ACK_REPLAY');
    await expect(consumeDisplayedReceipt({ ...input, tenantId: 'tenant-b' })).rejects.toThrow(
      'PUSH_ACK_SCOPE_MISMATCH',
    );
    await expect(
      consumeDisplayedReceipt({ ...input, deliveryId: 'delivery-b', nowSeconds: 1_301 }),
    ).rejects.toThrow('PUSH_ACK_EXPIRED');
  });
});
