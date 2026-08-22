import { describe, expect, it } from 'vitest';
import {
  appendPushIntentAfterOrigin,
  consumeDisplayedReceipt,
  createDisplayedReceipt,
} from './mobile-push-outbox.js';

describe('mobile push outbox edge contracts', () => {
  it('reports successful append and hides non-protocol failures', async () => {
    await expect(
      appendPushIntentAfterOrigin({ origin: 'sale-a', appendIntent: () => Promise.resolve() }),
    ).resolves.toEqual({ origin: 'sale-a', push: { queued: true } });
    await expect(
      appendPushIntentAfterOrigin({ origin: 'sale-a', appendIntent: () => Promise.reject('raw') }),
    ).resolves.toEqual({
      origin: 'sale-a',
      push: { queued: false, failure: 'PUSH_OUTBOX_FAILED' },
    });
  });

  it('rejects invalid receipt windows', async () => {
    await expect(
      createDisplayedReceipt({
        tenantId: 'tenant-a',
        deliveryId: 'delivery-a',
        subscriptionId: 'subscription-a',
        deviceFingerprint: 'device-a',
        issuedAtSeconds: 1_000,
        expiresAtSeconds: 1_301,
      }),
    ).rejects.toThrow('PUSH_ACK_WINDOW_INVALID');
  });

  it('rejects malformed and tampered opaque receipts', async () => {
    await expect(
      consumeDisplayedReceipt({
        token: '%%%',
        tenantId: 'tenant-a',
        deliveryId: 'delivery-a',
        subscriptionId: 'subscription-a',
        deviceFingerprint: 'device-a',
        nowSeconds: 1_100,
      }),
    ).rejects.toThrow('PUSH_ACK_INVALID');
    const receipt = await createDisplayedReceipt({
      tenantId: 'tenant-a',
      deliveryId: 'delivery-a',
      subscriptionId: 'subscription-a',
      deviceFingerprint: 'device-a',
      issuedAtSeconds: 1_000,
      expiresAtSeconds: 1_300,
    });
    await expect(
      consumeDisplayedReceipt({
        token: `${receipt.token.slice(0, -1)}A`,
        tenantId: 'tenant-a',
        deliveryId: 'delivery-a',
        subscriptionId: 'subscription-a',
        deviceFingerprint: 'device-a',
        nowSeconds: 1_100,
      }),
    ).rejects.toThrow('PUSH_ACK_INVALID');
  });
});
