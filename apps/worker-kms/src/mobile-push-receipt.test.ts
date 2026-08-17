import { describe, expect, it } from 'vitest';
import { issuePushAckReceipt, verifyPushAckReceipt } from './mobile-push-receipt.js';

const secret = '0123456789abcdef0123456789abcdef';
/** Relative clock — avoids calendar-coupled fixtures and base64 trailing-bit flukes. */
const nowSeconds = 1_700_000_000;
const claims = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  deliveryId: 'delivery-a',
  subscriptionId: 'subscription-a',
  deviceFingerprint: 'device-a',
  issuedAtSeconds: nowSeconds,
  expiresAtSeconds: nowSeconds + 300,
};

function tamperToken(token: string): string {
  const [iv, ciphertext] = token.split('.');
  if (!iv || !ciphertext || ciphertext.length < 4) {
    throw new Error('unexpected token shape');
  }
  const mid = Math.floor(ciphertext.length / 2);
  const flipped = ciphertext[mid] === 'A' ? 'B' : 'A';
  return `${iv}.${ciphertext.slice(0, mid)}${flipped}${ciphertext.slice(mid + 1)}`;
}

describe('Sprint 45 cryptographic ACK receipt', () => {
  it('issues a signed opaque receipt with a maximum 300 second window', async () => {
    const issued = await issuePushAckReceipt(secret, claims);
    expect(issued.token).not.toContain('tenant-a');
    expect(issued.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyPushAckReceipt(secret, issued.token, nowSeconds)).resolves.toMatchObject(
      claims,
    );
  });

  it('rejects tampering, expiry, and windows over 300 seconds', async () => {
    const issued = await issuePushAckReceipt(secret, claims);
    await expect(
      verifyPushAckReceipt(secret, tamperToken(issued.token), nowSeconds),
    ).rejects.toThrow('PUSH_ACK_INVALID');
    await expect(
      verifyPushAckReceipt(secret, issued.token, claims.expiresAtSeconds),
    ).rejects.toThrow('PUSH_ACK_EXPIRED');
    await expect(
      issuePushAckReceipt(secret, { ...claims, expiresAtSeconds: claims.issuedAtSeconds + 301 }),
    ).rejects.toThrow('PUSH_ACK_WINDOW_INVALID');
  });
});
