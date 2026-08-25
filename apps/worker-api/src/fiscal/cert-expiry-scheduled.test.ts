/* eslint-disable @typescript-eslint/no-explicit-any -- focused D1 boundary fake */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCertExpiryScheduled } from './cert-expiry-scheduled.js';

const appendPushEventAtomic = vi.hoisted(() => vi.fn());

vi.mock('@kipuspay/adapters-d1', () => ({
  appendPushEventAtomic,
}));

const NOW = Date.parse('2026-08-24T13:00:00.000Z');
const FP = 'a'.repeat(64);
const FP2 = 'b'.repeat(64);

function isoDaysFromNow(days: number): string {
  // Formato D1 DATETIME: 'YYYY-MM-DD HH:MM:SS' (UTC).
  return new Date(NOW + days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
}

/** D1 fake: filas del barrido tenant_certificates + owner push-capable. */
function fakeDb(options: {
  certs?: readonly {
    tenant_id: string;
    fingerprint_sha256: string;
    expires_at: string;
  }[];
  ownerIds?: Record<string, string | null>;
}) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: () => {
          if (sql.includes("role = 'owner'")) {
            const owner = options.ownerIds?.[String(args[0] ?? '')];
            return Promise.resolve(owner ? { id: owner } : null);
          }
          return Promise.resolve(null);
        },
        all: () => {
          if (sql.includes('FROM tenant_certificates')) {
            return Promise.resolve({ results: options.certs ?? [] });
          }
          return Promise.resolve({ results: [] });
        },
        run: () => Promise.resolve({}),
      }),
      first: () => Promise.resolve(null),
      all: () => Promise.resolve({ results: [] }),
      run: () => Promise.resolve({}),
    }),
    batch: (stmts: unknown[]) => Promise.resolve(stmts),
  };
}

describe('cert-expiry-scheduled (SEC-03, alerta T-30d)', () => {
  beforeEach(() => {
    appendPushEventAtomic.mockReset();
    appendPushEventAtomic.mockResolvedValue({ queued: true, alreadyApplied: false });
  });

  it('sin DB → no op', async () => {
    await expect(runCertExpiryScheduled({}, { nowMs: NOW })).resolves.toEqual({
      certsScanned: 0,
      alertsEmitted: 0,
    });
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });

  it('cert a 10 días → UNA alerta OWNER_ALERTS al owner con hash estable por certificado', async () => {
    appendPushEventAtomic.mockImplementation((_db, input) =>
      Promise.resolve({ queued: true, alreadyApplied: false, eventId: input.idempotencyKeyHash }),
    );
    const env = {
      DB: fakeDb({
        certs: [{ tenant_id: 't1', fingerprint_sha256: FP, expires_at: isoDaysFromNow(10) }],
        ownerIds: { t1: 'owner-1' },
      }),
    } as never;
    const res = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(res).toEqual({ certsScanned: 1, alertsEmitted: 1 });
    expect(appendPushEventAtomic).toHaveBeenCalledTimes(1);
    const call = appendPushEventAtomic.mock.calls[0] as [unknown, any];
    expect(call[1]).toMatchObject({
      tenantId: 't1',
      userId: 'owner-1',
      purpose: 'OWNER_ALERTS',
      eventType: 'CERT_EXPIRY_WARNING',
      idempotencyKeyHash: `cert-expiry:t1:${FP}`,
      sourceEntityId: `tenant-cert:t1:${FP}`,
      deepLinkKind: 'cert_expiry',
      collapseKey: 'cert-expiry:t1',
    });
    const payload = JSON.parse(call[1].payloadRedactedJson) as { daysLeft: number };
    expect(payload.daysLeft).toBe(10);
  });

  it('dedup F5b-4: 2ª corrida (día siguiente, misma huella) NO re-emite — UNA por certificado', async () => {
    const seen = new Set<string>();
    appendPushEventAtomic.mockImplementation((_db, input) => {
      if (seen.has(input.idempotencyKeyHash)) {
        return Promise.resolve({ queued: true, alreadyApplied: true });
      }
      seen.add(input.idempotencyKeyHash);
      return Promise.resolve({ queued: true, alreadyApplied: false, eventId: 'e1' });
    });
    const env = {
      DB: fakeDb({
        certs: [{ tenant_id: 't1', fingerprint_sha256: FP, expires_at: isoDaysFromNow(20) }],
        ownerIds: { t1: 'owner-1' },
      }),
    } as never;
    const day1 = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(day1.alertsEmitted).toBe(1);
    // Día siguiente el cert SIGUE en la ventana T-30: la clave estable evita re-alarma.
    const day2 = await runCertExpiryScheduled(env, { nowMs: NOW + 86_400_000 });
    expect(day2.alertsEmitted).toBe(0);
    expect(appendPushEventAtomic).toHaveBeenCalledTimes(2); // intentó, dedup lo frenó
  });

  it('rotación (huella nueva) → nueva alerta; certs distintos → alertas independientes', async () => {
    const env = {
      DB: fakeDb({
        certs: [
          { tenant_id: 't1', fingerprint_sha256: FP, expires_at: isoDaysFromNow(5) },
          { tenant_id: 't1', fingerprint_sha256: FP2, expires_at: isoDaysFromNow(29) },
        ],
        ownerIds: { t1: 'owner-1' },
      }),
    } as never;
    const res = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(res).toEqual({ certsScanned: 2, alertsEmitted: 2 });
    const keys = (appendPushEventAtomic.mock.calls as [unknown, any][]).map(
      (c) => c[1].idempotencyKeyHash,
    );
    expect(keys).toEqual([`cert-expiry:t1:${FP}`, `cert-expiry:t1:${FP2}`]);
  });

  it('fuera de ventana: vencido o a >30 días no alertan (el fake DB ya filtró; defensa en profundidad)', async () => {
    const env = {
      DB: fakeDb({
        certs: [
          { tenant_id: 't-old', fingerprint_sha256: FP, expires_at: isoDaysFromNow(-3) },
          { tenant_id: 't-far', fingerprint_sha256: FP2, expires_at: isoDaysFromNow(45) },
        ],
        ownerIds: { 't-old': 'owner-1', 't-far': 'owner-1' },
      }),
    } as never;
    const res = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(res.alertsEmitted).toBe(0);
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });

  it('sin owner con mobile.push → skip best-effort', async () => {
    const env = {
      DB: fakeDb({
        certs: [{ tenant_id: 't1', fingerprint_sha256: FP, expires_at: isoDaysFromNow(10) }],
        ownerIds: { t1: null },
      }),
    } as never;
    const res = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(res).toEqual({ certsScanned: 1, alertsEmitted: 0 });
    expect(appendPushEventAtomic).not.toHaveBeenCalled();
  });

  it('fallo de push en un tenant no tumba el barrido (best-effort)', async () => {
    appendPushEventAtomic.mockRejectedValueOnce(new Error('PUSH_DOWN'));
    const env = {
      DB: fakeDb({
        certs: [
          { tenant_id: 't1', fingerprint_sha256: FP, expires_at: isoDaysFromNow(10) },
          { tenant_id: 't2', fingerprint_sha256: FP2, expires_at: isoDaysFromNow(12) },
        ],
        ownerIds: { t1: 'owner-1', t2: 'owner-2' },
      }),
    } as never;
    const res = await runCertExpiryScheduled(env, { nowMs: NOW });
    expect(res.alertsEmitted).toBe(1);
  });
});
