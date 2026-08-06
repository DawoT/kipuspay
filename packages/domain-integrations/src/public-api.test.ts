import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- test fixtures, not live credentials */
import {
  assertHttpsWebhookUrl,
  assertSafeWebhookUrl,
  computeNextAttemptAtMs,
  hashApiKey,
  isPublicApiEventType,
  kvApiKeyRevokedKey,
  parseApiKeyToken,
  shouldDisableWebhookEndpoint,
  signWebhookBody,
  verifyApiKey,
  WEBHOOK_AUTO_DISABLE_FAILURES,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_TIMEOUT_MS,
} from './public-api.js';

describe('public-api', () => {
  it('catálogo de eventos públicos', () => {
    expect(isPublicApiEventType('sale.created')).toBe(true);
    expect(isPublicApiEventType('cpe.accepted')).toBe(true);
    expect(isPublicApiEventType('cpe.rejected')).toBe(true);
    expect(isPublicApiEventType('invoice.paid')).toBe(false);
  });

  it('rechaza webhook http, inválido y metadata IP', () => {
    expect(() => assertHttpsWebhookUrl('not a url')).toThrow('WEBHOOK_URL_INVALID');
    expect(() => assertHttpsWebhookUrl('http://example.com/hook')).toThrow('WEBHOOK_URL_NOT_HTTPS');
    expect(() => assertHttpsWebhookUrl('https://169.254.169.254/latest')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://127.0.0.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://10.0.0.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://192.168.1.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://172.16.0.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://0.0.0.0/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://100.64.0.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://localhost/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://foo.localhost/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://metadata.google.internal/')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[::1]/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://[fc00::1]/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://[::ffff:127.0.0.1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[::ffff:a00:1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[::ffff:7f00:1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[0:0:0:0:0:0:0:1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[0:0:0:0:0:ffff:7f00:1]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[::ffff:0a00:0001]/hook')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://[fe80::1]/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://[2001:db8::1]/hook')).not.toThrow();
    expect(() => assertHttpsWebhookUrl('https://[2001:db8:0:0:0:0:0:1]/hook')).not.toThrow();
    expect(() => assertHttpsWebhookUrl('https://metadata.google.internal./')).toThrow(
      'WEBHOOK_URL_DENIED',
    );
    expect(() => assertHttpsWebhookUrl('https://169.254.1.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://172.31.255.1/hook')).toThrow('WEBHOOK_URL_DENIED');
    expect(() => assertHttpsWebhookUrl('https://8.8.8.8/hook')).not.toThrow();
    expect(() => assertHttpsWebhookUrl('https://hooks.example.com/kipus')).not.toThrow();
  });

  it('rechaza DNS rebinding (hostname que resuelve a IP privada)', async () => {
    await expect(
      assertSafeWebhookUrl('https://10.0.0.5.nip.io/hook', () => Promise.resolve(['10.0.0.5'])),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/kipus', () => Promise.resolve(['8.8.8.8'])),
    ).resolves.toBeUndefined();
    // IPv6 no normalizable por URL: la IP viene cruda del resolver.
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['0:0:0:0:0:0:0:1']),
      ),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () => Promise.resolve(['fe80::1'])),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['::ffff:0a00:1']),
      ),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['0:0:0:0:0:ffff:a00:1']),
      ),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['2606:4700:4700::1111']),
      ),
    ).resolves.toBeUndefined();
    // IP pública v4 (rama true de isPrivateIpv4String)
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['93.184.216.34']),
      ),
    ).resolves.toBeUndefined();
    // IPv6 malformada (grupos != 8 y head+tail > 7) → no match, no deny
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['1:2:3:4:5:6:7']),
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['1:2:3:4:5:6:7:8:9']),
      ),
    ).resolves.toBeUndefined();
    // IPv6 con zone id (%eth0) se normaliza y sigue siendo link-local → deny
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['fe80::1%eth0']),
      ),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    // Trailing dot en el hostname: se normaliza y se resuelve (no bypass SSRF)
    await expect(
      assertSafeWebhookUrl('https://10.0.0.5.nip.io./hook', () => Promise.resolve(['10.0.0.5'])),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    // ::ffff:dotted crudo del resolver
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['::ffff:127.0.0.1']),
      ),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    // ::1 crudo del resolver (no normalizable vía hostname)
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () => Promise.resolve(['::1'])),
    ).rejects.toThrow('WEBHOOK_URL_DENIED');
    // IPv6 malformada con :: y >7 grupos → no deny
    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/hook', () =>
        Promise.resolve(['1:2:3:4:5:6:7:8::']),
      ),
    ).resolves.toBeUndefined();
  });

  it('parsea y rechaza API key inválida', () => {
    expect(() => parseApiKeyToken('bad')).toThrow('API_KEY_INVALID');
    expect(() => parseApiKeyToken('kp_short')).toThrow('API_KEY_INVALID');
    const token = 'kp_live_abcdef0123456789abcdef0123456789';
    expect(parseApiKeyToken(token).prefix).toBe('kp_live_abcdef01');
  });

  it('hash + verify API key con salt/pepper', async () => {
    const pepper = 'test-pepper';
    const token = 'kp_live_abcdef0123456789abcdef0123456789';
    const { saltHex, hashHex } = await hashApiKey(token, pepper);
    expect(await verifyApiKey(token, pepper, saltHex, hashHex)).toBe(true);
    expect(await verifyApiKey(`${token}x`, pepper, saltHex, hashHex)).toBe(false);
    expect(await verifyApiKey(token, pepper, saltHex, hashHex.slice(0, 8))).toBe(false);
  });

  it('firma HMAC del body de webhook', async () => {
    const body = '{"event":"sale.created"}';
    const sig = await signWebhookBody('whsec_test', body);
    const again = await signWebhookBody('whsec_test', body);
    expect(sig).toBe(again);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('policy de reintentos y auto-disable + kv key', () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(3);
    expect(WEBHOOK_AUTO_DISABLE_FAILURES).toBe(5);
    expect(WEBHOOK_TIMEOUT_MS).toBe(5_000);
    expect(shouldDisableWebhookEndpoint(4)).toBe(false);
    expect(shouldDisableWebhookEndpoint(5)).toBe(true);
    const t0 = 1_000_000;
    expect(computeNextAttemptAtMs(t0, 0)).toBe(t0 + 5_000);
    expect(computeNextAttemptAtMs(t0, 1)).toBe(t0 + 5_000);
    expect(computeNextAttemptAtMs(t0, 2)).toBe(t0 + 25_000);
    expect(computeNextAttemptAtMs(t0, 3)).toBe(t0 + 125_000);
    expect(kvApiKeyRevokedKey('t1', 'kp_live_ab')).toBe('api_key_revoked:t1:kp_live_ab');
  });
});
