import { describe, expect, it } from 'vitest';
import { issuePushAckReceipt, verifyPushAckReceipt } from './mobile-push-receipt.js';

const secret = '0123456789abcdef0123456789abcdef';
const claims = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  deliveryId: 'delivery-a',
  subscriptionId: 'subscription-a',
  deviceFingerprint: 'device-a',
  issuedAtSeconds: 1_786_224_000,
  expiresAtSeconds: 1_786_224_300,
};

describe('Sprint 45 cryptographic ACK receipt', () => {
  it('issues a signed opaque receipt with a maximum 300 second window', async () => {
    const issued = await issuePushAckReceipt(secret, claims);
    expect(issued.token).not.toContain('tenant-a');
    expect(issued.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      verifyPushAckReceipt(secret, issued.token, claims.issuedAtSeconds),
    ).resolves.toMatchObject(claims);
  });

  it('rejects tampering, expiry, and windows over 300 seconds', async () => {
    const issued = await issuePushAckReceipt(secret, claims);
    await expect(
      verifyPushAckReceipt(secret, `${issued.token.slice(0, -1)}x`, claims.issuedAtSeconds),
    ).rejects.toThrow('PUSH_ACK_INVALID');
    await expect(
      verifyPushAckReceipt(secret, issued.token, claims.expiresAtSeconds + 1),
    ).rejects.toThrow('PUSH_ACK_EXPIRED');
    await expect(
      issuePushAckReceipt(secret, { ...claims, expiresAtSeconds: claims.issuedAtSeconds + 301 }),
    ).rejects.toThrow('PUSH_ACK_WINDOW_INVALID');
  });
});
