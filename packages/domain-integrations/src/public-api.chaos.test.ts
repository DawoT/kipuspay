import { describe, expect, it } from 'vitest';
import {
  assertHttpsWebhookUrl,
  assertSafeWebhookUrl,
  hashApiKey,
  verifyApiKey,
} from './public-api.js';
import { buildAccountingEntries, type AccountingSaleRow } from './accounting-export.js';

describe('s23 chaos', () => {
  it('URL metadata denegada aunque sea https', () => {
    expect(() => assertHttpsWebhookUrl('https://169.254.169.254/latest/meta-data')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
  });

  it('SSRF: IPv4-mapped IPv6 loopback y privada denegados', () => {
    expect(() => assertHttpsWebhookUrl('https://[::ffff:127.0.0.1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[::ffff:0a00:0001]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
  });

  it('SSRF: trailing dot y DNS rebinding denegados', async () => {
    expect(() => assertHttpsWebhookUrl('https://metadata.google.internal./')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    await expect(
      assertSafeWebhookUrl('https://10.0.0.5.nip.io/hook', () => Promise.resolve(['10.0.0.5'])),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
  });

  it('revocación conceptual: hash distinto tras rotar token', async () => {
    const pepper = 'p';
    const a = await hashApiKey('kp_live_aaaaaaaaaaaaaaaaaaaaaaaa', pepper);
    const b = await hashApiKey('kp_live_bbbbbbbbbbbbbbbbbbbbbbbb', pepper, a.saltHex);
    expect(a.hashHex).not.toBe(b.hashHex);
    expect(
      await verifyApiKey('kp_live_aaaaaaaaaaaaaaaaaaaaaaaa', pepper, a.saltHex, a.hashHex),
    ).toBe(true);
  });

  it('mismo input de ventas → mismos asientos (bit contract)', () => {
    const rows: AccountingSaleRow[] = [
      {
        saleId: 'sale-a',
        branchId: 'br',
        soldAt: '2026-08-05T12:00:00.000Z',
        totalCents: 20000,
        taxCents: 3051,
        payments: [{ methodCode: 'yape', amountCents: 20000 }],
        arBalanceCents: 0,
      },
    ];
    expect(JSON.stringify(buildAccountingEntries(rows))).toBe(
      JSON.stringify(buildAccountingEntries(rows)),
    );
  });
});
