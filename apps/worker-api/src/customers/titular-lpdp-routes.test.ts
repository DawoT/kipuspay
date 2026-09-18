import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { exportCustomer } from '@kipuspay/adapters-d1';
import {
  runTitularConsentsHttp,
  runTitularConsentHttp,
  runTitularEraseHttp,
  runTitularExportHttp,
  runTitularVerifyHttp,
  runTitularVerifyOtpHttp,
} from './titular-lpdp-routes.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  exportCustomer: vi.fn(() =>
    Promise.resolve({
      customerId: 'cust-1',
      tenantId: 't1',
      profile: { documentTypeCode: '1', documentNumber: '45123456', name: 'Ana' },
      consents: [],
      sales: [],
    }),
  ),
  listConsents: vi.fn(() =>
    Promise.resolve([
      { purpose: 'marketing', granted: true, grantedAtIso: 'g', revokedAtIso: null },
    ]),
  ),
  writeConsent: vi.fn(() => Promise.resolve({ kind: 'GRANT' })),
  eraseCustomer: vi.fn(() =>
    Promise.resolve({ customerId: 'cust-1', fiscalSnapshotsAnonymized: 3, consentsRevoked: 2 }),
  ),
}));

const SECRET = 'test-secret-titular';

interface TestEmail {
  readonly to: string;
  readonly text: string;
  readonly subject: string;
}
interface TestChallenge {
  readonly tenantId: string;
  readonly customerId: string;
  readonly codeHash: string;
  expiresAtMs: number;
  attempts: number;
}
const emailOutbox = new WeakMap<object, TestEmail[]>();

function memorySecurityState() {
  const counters = new Map<string, { count: number; windowStartedAtMs: number }>();
  const challenges = new Map<string, TestChallenge>();
  const stubs = new Map<string, object>();
  return {
    getByName(name: string) {
      const existing = stubs.get(name);
      if (existing) return existing;
      const stub = {
        consumeRateLimit: async (input: {
          keyHash: string;
          limit: number;
          windowMs: number;
          nowMs: number;
        }) => {
          const previous = counters.get(input.keyHash);
          const expired = previous && previous.windowStartedAtMs + input.windowMs <= input.nowMs;
          const count = expired ? 1 : (previous?.count ?? 0) + 1;
          const windowStartedAtMs = expired
            ? input.nowMs
            : (previous?.windowStartedAtMs ?? input.nowMs);
          counters.set(input.keyHash, { count, windowStartedAtMs });
          return {
            allowed: count <= input.limit,
            remaining: Math.max(0, input.limit - count),
            retryAfterSeconds: Math.ceil((windowStartedAtMs + input.windowMs - input.nowMs) / 1000),
          };
        },
        createOtpChallenge: async (input: {
          challengeId: string;
          tenantId: string;
          customerId: string;
          codeHash: string;
          expiresAtMs: number;
        }) => {
          challenges.set(input.challengeId, { ...input, attempts: 0 });
        },
        consumeOtpChallenge: async (input: {
          challengeId: string;
          codeHash: string;
          nowMs: number;
          maxAttempts: number;
        }) => {
          const challenge = challenges.get(input.challengeId);
          if (!challenge || challenge.expiresAtMs <= input.nowMs)
            return { kind: 'INVALID' as const };
          if (challenge.attempts >= input.maxAttempts) {
            challenges.delete(input.challengeId);
            return { kind: 'INVALID' as const };
          }
          if (challenge.codeHash !== input.codeHash) {
            challenge.attempts += 1;
            return { kind: 'INVALID' as const };
          }
          challenges.delete(input.challengeId);
          return {
            kind: 'VERIFIED' as const,
            tenantId: challenge.tenantId,
            customerId: challenge.customerId,
          };
        },
        deleteOtpChallenge: async (challengeId: string) => {
          challenges.delete(challengeId);
        },
      };
      stubs.set(name, stub);
      return stub;
    },
  };
}

function env(overrides: Record<string, unknown> = {}): WorkerEnv {
  const customer = {
    id: 'cust-1',
    name: 'Ana Perez',
    phone: '+51999999999',
    email: 'ana@example.test',
    pii_erased: overrides.customerErased === true ? 1 : 0,
  };
  const sent: TestEmail[] = [];
  const email = overrides.EMAIL ?? {
    send: async (message: TestEmail) => {
      sent.push(message);
      return { messageId: `email-${sent.length}` };
    },
  };
  const result = {
    FEATURE_LPDP: '1',
    AUTH_JWT_HS_SECRET: SECRET,
    LPDP_OTP_HMAC_SECRET: 'unit-test-otp-hmac-secret',
    LPDP_OTP_FROM: 'privacidad@example.test',
    EMAIL: email,
    LPDP_OTP_STATE_DO: memorySecurityState(),
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: () =>
            Promise.resolve(
              sql.includes('tenant_capabilities')
                ? { enabled: 1, config_json: '{}', epoch: 0 }
                : sql.includes('pii_erased = 0') && customer.pii_erased === 1
                  ? null
                  : customer,
            ),
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
          run: () => Promise.resolve({ success: true, meta: {} }),
        }),
      }),
      batch: () => Promise.resolve([]),
    },
    ...overrides,
  } as unknown as WorkerEnv;
  emailOutbox.set(result, sent);
  return result;
}

async function titularTokenFor(
  e: WorkerEnv,
  identity = {
    tenantId: 't1',
    documentNumber: '45123456',
    name: 'Ana Perez',
    phone: '+51999999999',
  },
): Promise<{ token: string; challengeId: string; emailSent: boolean }> {
  const started = await runTitularVerifyHttp(e, identity, '198.51.100.10');
  const challengeId = (started.body as { challengeId: string }).challengeId;
  const mail = emailOutbox.get(e)?.at(-1);
  const code = mail?.text.match(/\b\d{6}\b/)?.[0] ?? '';
  const completed = await runTitularVerifyOtpHttp(e, { challengeId, code }, '198.51.100.10');
  return {
    token: (completed.body as { token?: string }).token ?? '',
    challengeId,
    emailSent: Boolean(mail),
  };
}

describe('LPDP ARCO self-serve del titular (Sprint C3)', () => {
  it('verify: solo prepara reto y envía OTP al correo registrado, no al destinatario del payload', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'email-test-id' });
    const res = await runTitularVerifyHttp(
      env({ EMAIL: { send }, LPDP_OTP_FROM: 'privacidad@example.test' }),
      {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
        email: 'attacker@example.test',
      },
    );

    expect(res.status).toBe(202);
    expect((res.body as { challengeId?: string }).challengeId).toEqual(expect.any(String));
    expect((res.body as { token?: string }).token).toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test' }));
  });

  it('verify: el token aparece solo después de consumir el OTP enviado al correo registrado', async () => {
    const e = env();
    const result = await titularTokenFor(e);
    expect(result.emailSent).toBe(true);
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(20);
  });

  it('verify-otp: consume el reto una sola vez y rechaza replay y códigos erróneos', async () => {
    const e = env();
    const started = await runTitularVerifyHttp(
      e,
      {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
      },
      '198.51.100.20',
    );
    const challengeId = (started.body as { challengeId: string }).challengeId;
    const code = emailOutbox.get(e)?.[0]?.text.match(/\b\d{6}\b/)?.[0] ?? '';
    expect(
      (await runTitularVerifyOtpHttp(e, { challengeId, code: '999999' }, '198.51.100.20')).status,
    ).toBe(403);
    const accepted = await runTitularVerifyOtpHttp(e, { challengeId, code }, '198.51.100.20');
    expect(accepted.status).toBe(200);
    expect((await runTitularVerifyOtpHttp(e, { challengeId, code }, '198.51.100.20')).status).toBe(
      403,
    );
  });

  it('verify-otp: falla cerrado si el proveedor de correo rechaza el envío', async () => {
    const e = env({
      EMAIL: { send: vi.fn().mockRejectedValue(new Error('provider unavailable')) },
    });
    const result = await runTitularVerifyHttp(
      e,
      {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Ana Perez',
        phone: '+51999999999',
      },
      '198.51.100.21',
    );
    expect(result.status).toBe(503);
    expect(result.body).not.toHaveProperty('token');
  });

  it('verify: los datos no coincidentes no envían correo ni revelan si existe el titular', async () => {
    const mismatchEnv = env();
    const mismatch = await runTitularVerifyHttp(
      mismatchEnv,
      {
        tenantId: 't1',
        documentNumber: '45123456',
        name: 'Otra Persona',
        phone: '+51999999999',
      },
      '198.51.100.11',
    );
    expect(mismatch.status).toBe(202);
    expect((mismatch.body as { token?: string }).token).toBeUndefined();
    expect(emailOutbox.get(mismatchEnv)).toHaveLength(0);

    const missingEnv = env({
      DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            first: () =>
              Promise.resolve(
                sql.includes('tenant_capabilities')
                  ? { enabled: 1, config_json: '{}', epoch: 0 }
                  : null,
              ),
            all: () => Promise.resolve({ results: [], success: true, meta: {} }),
            run: () => Promise.resolve({ success: true, meta: {} }),
          }),
        }),
        batch: () => Promise.resolve([]),
      },
    });
    const missing = await runTitularVerifyHttp(
      missingEnv,
      {
        tenantId: 't1',
        documentNumber: '00000000',
        name: 'Nadie',
        phone: '+51000000000',
      },
      '198.51.100.12',
    );
    expect(missing.status).toBe(202);
    expect(missing.body).toMatchObject({ message: (mismatch.body as { message: string }).message });
    expect(emailOutbox.get(missingEnv)).toHaveLength(0);
  });

  it('verify: aísla el límite de titular por tenant y normaliza el documento', async () => {
    const e = env();
    const base = {
      tenantId: 'tenant-a',
      documentNumber: '45-123-456',
      name: 'Ana Perez',
      phone: '+51999999999',
    };
    const sameTenant = { ...base, documentNumber: '45123456' };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await runTitularVerifyHttp(e, attempt === 0 ? base : sameTenant, '198.51.100.30')).status,
      ).toBe(202);
    }
    expect((await runTitularVerifyHttp(e, sameTenant, '198.51.100.30')).status).toBe(429);
    expect(
      (await runTitularVerifyHttp(e, { ...sameTenant, tenantId: 'tenant-b' }, '198.51.100.30'))
        .status,
    ).toBe(202);
  });

  it('verify: flag off → 404 y datos incompletos → 400', async () => {
    expect((await runTitularVerifyHttp(env({ FEATURE_LPDP: '0' }), {})).status).toBe(404);
    expect((await runTitularVerifyHttp(env(), { tenantId: 't1' })).status).toBe(400);
  });

  it('export: token de titular devuelve la copia del propio titular', async () => {
    const { token } = await titularTokenFor(env());
    const res = await runTitularExportHttp(env(), `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as { export?: { customerId?: string } }).export?.customerId).toBe('cust-1');
  });

  it('export: error inesperado no expone SQL ni PII en la respuesta', async () => {
    vi.mocked(exportCustomer).mockRejectedValueOnce(
      new Error('SQLITE_BUSY: customer Ana Perez phone +51999999999'),
    );
    const { token } = await titularTokenFor(env());

    const res = await runTitularExportHttp(env(), `Bearer ${token}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toContain('SQLITE_BUSY');
    expect(JSON.stringify(res.body)).not.toContain('Ana Perez');
  });

  it('token admin (sin scope) jamás pasa como titular → 401', async () => {
    const { signHs256 } = await import('../auth/verify-jwt.js');
    const adminToken = await signHs256(SECRET, {
      tenantId: 't1',
      sub: 'admin-1',
      role: 'owner',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await runTitularExportHttp(env(), `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });

  it('token titular con customerId distinto de sub jamás pasa como titular', async () => {
    const { signHs256 } = await import('../auth/verify-jwt.js');
    const forgedScopeToken = await signHs256(SECRET, {
      tenantId: 't1',
      sub: 'cust-1',
      customerId: 'cust-2',
      scope: 'lpdp_titular',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await runTitularExportHttp(env(), `Bearer ${forgedScopeToken}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'TITULAR_UNAUTHORIZED', code: 'TITULAR_UNAUTHORIZED' });
  });

  it('erase exige confirmación doble y luego anonimiza', async () => {
    const { token } = await titularTokenFor(env());
    const unconfirmed = await runTitularEraseHttp(env(), `Bearer ${token}`, {});
    expect(unconfirmed.status).toBe(400);
    expect((unconfirmed.body as { code?: string }).code).toBe(
      'TITULAR_ERASE_CONFIRMATION_REQUIRED',
    );
    const res = await runTitularEraseHttp(env(), `Bearer ${token}`, { confirmed: true });
    expect(res.status).toBe(200);
    expect((res.body as { consentsRevoked?: number }).consentsRevoked).toBe(2);
  });

  it('consents: el titular lee sus consentimientos', async () => {
    const { token } = await titularTokenFor(env());
    const res = await runTitularConsentsHttp(env(), `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as { customerId?: string }).customerId).toBe('cust-1');
  });

  it('consent: token emitido antes del erase no puede volver a conceder', async () => {
    const { token } = await titularTokenFor(env());
    const res = await runTitularConsentHttp(env({ customerErased: true }), `Bearer ${token}`, {
      purpose: 'marketing',
      granted: true,
    });
    expect(res.status).toBe(401);
    expect((res.body as { code?: string }).code).toBe('TITULAR_UNAUTHORIZED');
  });
});
