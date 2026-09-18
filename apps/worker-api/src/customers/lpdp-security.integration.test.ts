import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('LpdpSecurityShard en Workerd', () => {
  it('consume atómicamente el límite bajo concurrencia', async () => {
    const namespace = env.LPDP_OTP_STATE_DO;
    const stub = namespace.get(namespace.idFromName(`lpdp-test-${crypto.randomUUID()}`));
    const calls = await Promise.all(
      Array.from({ length: 100 }, () =>
        stub.consumeRateLimit({
          keyHash: 'integration-fixed-key',
          limit: 12,
          windowMs: 60_000,
          nowMs: Date.now(),
        }),
      ),
    );

    expect(calls.filter((result) => result.allowed)).toHaveLength(12);
    expect(calls.filter((result) => !result.allowed)).toHaveLength(88);
  });

  it('permite un único consumo válido bajo concurrencia', async () => {
    const namespace = env.LPDP_OTP_STATE_DO;
    const stub = namespace.get(namespace.idFromName(`lpdp-test-${crypto.randomUUID()}`));
    const challengeId = crypto.randomUUID();
    await stub.createOtpChallenge({
      challengeId,
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      codeHash: 'fixed-code-hash',
      expiresAtMs: Date.now() + 60_000,
    });
    const challenge = {
      challengeId,
      codeHash: 'fixed-code-hash',
      nowMs: Date.now(),
      maxAttempts: 5,
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => stub.consumeOtpChallenge(challenge)),
    );
    expect(results.filter((result) => result.kind === 'VERIFIED')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'INVALID')).toHaveLength(19);
  });

  it('bloquea reto tras cinco códigos erróneos y respeta expiración', async () => {
    const namespace = env.LPDP_OTP_STATE_DO;
    const stub = namespace.get(namespace.idFromName(`lpdp-test-${crypto.randomUUID()}`));
    const challengeId = crypto.randomUUID();
    const nowMs = Date.now();
    await stub.createOtpChallenge({
      challengeId,
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      codeHash: 'right-code-hash',
      expiresAtMs: nowMs + 60_000,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (
          await stub.consumeOtpChallenge({
            challengeId,
            codeHash: 'wrong-code-hash',
            nowMs,
            maxAttempts: 5,
          })
        ).kind,
      ).toBe('INVALID');
    }
    expect(
      (
        await stub.consumeOtpChallenge({
          challengeId,
          codeHash: 'right-code-hash',
          nowMs,
          maxAttempts: 5,
        })
      ).kind,
    ).toBe('INVALID');

    const expiredId = crypto.randomUUID();
    await stub.createOtpChallenge({
      challengeId: expiredId,
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      codeHash: 'right-code-hash',
      expiresAtMs: nowMs + 1,
    });
    expect(
      (
        await stub.consumeOtpChallenge({
          challengeId: expiredId,
          codeHash: 'right-code-hash',
          nowMs: nowMs + 2,
          maxAttempts: 5,
        })
      ).kind,
    ).toBe('INVALID');
  });
});
