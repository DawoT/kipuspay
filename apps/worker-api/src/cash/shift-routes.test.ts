import { describe, expect, it } from 'vitest';
import { runIssueShiftPinHttp, runShiftTransferHttp, type ShiftEnv } from './shift-routes.js';

function mockDb(overrides: Partial<Record<string, unknown>> = {}): unknown {
  const first = (sql: string) => {
    if (sql.includes('FROM cash_register_sessions')) {
      return overrides.session ?? null;
    }
    if (sql.includes('FROM cash_register_shifts') && sql.includes('ended_at IS NULL')) {
      return overrides.outgoingShift ?? null;
    }
    if (sql.includes('FROM tenant_discount_policies')) {
      return overrides.policy ?? { interim_required: 0 };
    }
    return null;
  };
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: () => Promise.resolve(first(sql)),
            run: () => Promise.resolve({ meta: { changes: 1 } }),
            all: () => Promise.resolve({ results: [] }),
          };
        },
      };
    },
    batch: (stmts: readonly { meta: { changes: number } }[]) =>
      Promise.resolve(stmts.map(() => ({ meta: { changes: 1 } }))),
  };
}

function envWith(overrides: Partial<ShiftEnv> = {}): ShiftEnv {
  return { FEATURE_SHIFT_HANDOFF: '1', DB: mockDb(), ...overrides };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'cashier' };

describe('ops.shift_handoff routes (Sprint 51)', () => {
  it('flag off → 404 FEATURE_OFF en pin y transfer', async () => {
    const env = envWith({ FEATURE_SHIFT_HANDOFF: '0' });
    expect((await runIssueShiftPinHttp(env, actor, { sessionId: 's1' })).status).toBe(404);
    expect(
      (
        await runShiftTransferHttp(env, actor, {
          sessionId: 's1',
          pin: '123456',
          outgoingUserId: 'u2',
        })
      ).status,
    ).toBe(404);
  });

  it('pin: valida sessionId requerido', async () => {
    const res = await runIssueShiftPinHttp(envWith(), actor, {});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('pin: sesión inexistente → 404', async () => {
    const res = await runIssueShiftPinHttp(envWith(), actor, { sessionId: 's-nope' });
    expect(res.status).toBe(404);
  });

  it('pin: devuelve el PIN en claro una sola vez con TTL', async () => {
    const env = envWith({
      DB: mockDb({
        session: {
          id: 's1',
          branch_id: 'b1',
          opened_at: '2026-08-12T08:00:00.000Z',
          status: 'OPEN',
          opening_balance_cents: 0,
        },
        outgoingShift: null,
      }),
    });
    const res = await runIssueShiftPinHttp(env, actor, { sessionId: 's1' });
    expect(res.status).toBe(200);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(res.body.ttlSeconds).toBe(300);
    expect(res.body.expiresAtIso).toBeTruthy();
  });

  it('transfer: valida campos requeridos', async () => {
    const res = await runShiftTransferHttp(envWith(), actor, { sessionId: 's1' });
    expect(res.status).toBe(400);
  });

  it('transfer: PIN inválido → 401 PIN_INVALID', async () => {
    const env = envWith({
      DB: mockDb({
        session: {
          id: 's1',
          branch_id: 'b1',
          opened_at: '2026-08-12T08:00:00.000Z',
          status: 'OPEN',
          opening_balance_cents: 0,
        },
        outgoingShift: {
          id: 'sh1',
          transfer_pin_hash: 'x'.repeat(64),
          transfer_pin_expires_at: '2099-01-01T00:00:00.000Z',
        },
        policy: { interim_required: 0 },
      }),
    });
    const res = await runShiftTransferHttp(env, actor, {
      sessionId: 's1',
      pin: '000000',
      outgoingUserId: 'u2',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('PIN_INVALID');
  });

  it('transfer: sesión cerrada → 422 SESSION_CLOSED', async () => {
    const env = envWith({
      DB: mockDb({
        session: {
          id: 's1',
          branch_id: 'b1',
          opened_at: '2026-08-12T08:00:00.000Z',
          status: 'CLOSED',
          opening_balance_cents: 0,
        },
      }),
    });
    const res = await runShiftTransferHttp(env, actor, {
      sessionId: 's1',
      pin: '123456',
      outgoingUserId: 'u2',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('SESSION_CLOSED');
  });

  it('transfer: conteo intermedio no entero → 422 INTERIM_COUNT_INVALID', async () => {
    const res = await runShiftTransferHttp(envWith(), actor, {
      sessionId: 's1',
      pin: '123456',
      outgoingUserId: 'u2',
      interimCountCents: 10.5,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INTERIM_COUNT_INVALID');
  });
});
