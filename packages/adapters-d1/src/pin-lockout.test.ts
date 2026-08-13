import { describe, expect, it } from 'vitest';
import {
  clearPinLockout,
  PIN_LOCKOUT_MS,
  PIN_MAX_FAILURES,
  readPinLockout,
  recordPinFailure,
} from './pin-lockout.js';

type Row = Record<string, unknown>;

function mockDb(initial: Row = { pin_attempts: 0, pin_locked_until: null }): {
  DB: unknown;
} {
  let user: Row = { ...initial };
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: () => Promise.resolve({ ...user }),
        run: () => {
          if (sql.includes('pin_attempts = 0, pin_locked_until = NULL')) {
            user = { pin_attempts: 0, pin_locked_until: null };
          } else if (sql.includes('UPDATE users SET')) {
            const attempts = Number(user.pin_attempts) + 1;
            user = { ...user, pin_attempts: attempts };
            if (attempts >= PIN_MAX_FAILURES) {
              user.pin_locked_until = new Date(Date.now() + PIN_LOCKOUT_MS).toISOString();
            }
          }
          return Promise.resolve({ success: true });
        },
      };
      return stmt;
    },
  };
  return { DB: db };
}

describe('pin-lockout persistente (SEC-11, migración 0050)', () => {
  it('lee el estado sin bloqueo', async () => {
    const { DB } = mockDb();
    const state = await readPinLockout(DB as never, 't1', 'u1', Date.now());
    expect(state.locked).toBe(false);
    expect(state.failures).toBe(0);
  });

  it('detecta un lockout vigente', async () => {
    const lockedUntil = new Date(Date.now() + 60_000).toISOString();
    const { DB } = mockDb({ pin_attempts: 0, pin_locked_until: lockedUntil });
    const state = await readPinLockout(DB as never, 't1', 'u1', Date.now());
    expect(state.locked).toBe(true);
    expect(state.lockedUntilIso).toBe(lockedUntil);
  });

  it('expira el lockout pasado el tiempo', async () => {
    const lockedUntil = new Date(Date.now() - 60_000).toISOString();
    const { DB } = mockDb({ pin_attempts: 0, pin_locked_until: lockedUntil });
    const state = await readPinLockout(DB as never, 't1', 'u1', Date.now());
    expect(state.locked).toBe(false);
  });

  it('registra un fallo y devuelve el nuevo estado', async () => {
    const { DB } = mockDb({ pin_attempts: 2, pin_locked_until: null });
    const state = await recordPinFailure(DB as never, 't1', 'u1', Date.now());
    expect(state.failures).toBeGreaterThanOrEqual(2);
  });

  it('el 5º fallo bloquea', async () => {
    const { DB } = mockDb({ pin_attempts: 4, pin_locked_until: null });
    const state = await recordPinFailure(DB as never, 't1', 'u1', Date.now());
    expect(state.locked).toBe(true);
    const until = Date.parse(state.lockedUntilIso ?? '');
    expect(until - Date.now()).toBeGreaterThanOrEqual(PIN_LOCKOUT_MS - 1000);
  });

  it('resetea el lockout tras éxito', async () => {
    const { DB } = mockDb({ pin_attempts: 4, pin_locked_until: null });
    await clearPinLockout(DB as never, 't1', 'u1');
    const state = await readPinLockout(DB as never, 't1', 'u1', Date.now());
    expect(state.failures).toBe(0);
    expect(state.locked).toBe(false);
  });

  it('constantes alineadas con SEC-11', () => {
    expect(PIN_MAX_FAILURES).toBe(5);
    expect(PIN_LOCKOUT_MS).toBe(15 * 60 * 1000);
  });
});
