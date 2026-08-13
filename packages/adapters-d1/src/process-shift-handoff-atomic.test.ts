import { beforeEach, describe, expect, it } from 'vitest';
import { hashPin } from '@kipuspay/domain-ops';
import {
  issueShiftPinAtomic,
  processShiftTransferAtomic,
  processTeamInviteAtomic,
  resolveSellerIdentifier,
} from './process-shift-handoff-atomic.js';

interface World {
  session?: {
    id: string;
    branch_id: string;
    opened_at: string;
    status: string;
    opening_balance_cents: number;
  } | null;
  outgoingShift?: {
    id: string;
    transfer_pin_hash: string | null;
    transfer_pin_expires_at: string | null;
  } | null;
  policy?: { interim_required: number } | null;
  existingUser?: { id: string } | null;
  sellerByBadge?: { id: string; email: string; role: string; badge_barcode: string } | null;
  sellerByPin?: { id: string; email: string; role: string; badge_barcode: string | null } | null;
  guardFails?: boolean;
}

const OPEN_SESSION = {
  id: 's1',
  branch_id: 'b1',
  opened_at: '2026-08-12T08:00:00.000Z',
  status: 'OPEN',
  opening_balance_cents: 10000,
};

const NOW = '2026-08-12T12:00:00.000Z';

/* eslint-disable no-secrets/no-secrets -- nombres canónicos de dominio */

function mockDb(world: World = {}): never {
  const first = (sql: string) => {
    if (sql.includes('FROM cash_register_sessions')) return world.session ?? null;
    if (sql.includes('FROM cash_register_shifts') && sql.includes('ended_at IS NULL')) {
      return world.outgoingShift ?? null;
    }
    if (sql.includes('FROM tenant_discount_policies'))
      return world.policy ?? { interim_required: 0 };
    if (sql.includes('FROM users') && sql.includes('email = ?')) return world.existingUser ?? null;
    if (sql.includes('badge_barcode = ?')) return world.sellerByBadge ?? null;
    if (sql.includes('pin_hash = ?')) return world.sellerByPin ?? null;
    if (sql.includes('row_hash')) return null;
    return null;
  };
  const prepare = (sql: string) => ({
    sql,
    bind() {

      return {
        sql,
        first: () => Promise.resolve(first(sql)),
        run: () => Promise.resolve({ meta: { changes: 1 } }),
        all: () => {

          if (sql.includes('pin_hash IS NOT NULL') && world.sellerByPin) {
            return Promise.resolve({
              results: [
                { ...world.sellerByPin, pin_hash: CASHIER_PIN_HASH },
              ],
            });
          }
          return Promise.resolve({ results: [] });
        },
      };
    },
  });
  return {
    prepare,
    batch: (stmts: readonly { sql?: string }[]) => {
      const guard = stmts.find((s) => (s.sql ?? '').includes('INSERT INTO atomic_guards'));
      if (guard && world.guardFails) {
        throw new Error('CHECK constraint failed: atomic_guards');
      }
      return Promise.resolve(stmts.map(() => ({ meta: { changes: 1 }, results: [] as unknown[] })));
    },
  } as never;
}

let CASHIER_PIN_HASH = '';
let TRANSFER_PIN_HASH = '';

beforeEach(async () => {
  CASHIER_PIN_HASH = await hashPin('1234');
  TRANSFER_PIN_HASH = await hashPin('123456');
});

function worldWith(overrides: Partial<World> = {}): World {
  return {
    session: OPEN_SESSION,
    outgoingShift: {
      id: 'sh1',
      transfer_pin_hash: TRANSFER_PIN_HASH,
      transfer_pin_expires_at: '2099-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('processShiftHandoffAtomic (unit, Sprint 51)', () => {
  describe('issueShiftPinAtomic', () => {
    it('404 si la sesión no existe', async () => {
      const res = await issueShiftPinAtomic(mockDb(worldWith({ session: null })), {
        tenantId: 't1',
        userId: 'u1',
        sessionId: 's-x',
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(404);
    });

    it('422 si la sesión está cerrada', async () => {
      const res = await issueShiftPinAtomic(
        mockDb(worldWith({ session: { ...OPEN_SESSION, status: 'CLOSED' } })),
        { tenantId: 't1', userId: 'u1', sessionId: 's1' },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SESSION_CLOSED');
    });

    it('emite PIN de 6 dígitos que expira en el TTL; reemite sobre el tramo activo', async () => {
      const res = await issueShiftPinAtomic(mockDb(worldWith()), {
        tenantId: 't1',
        userId: 'u1',
        sessionId: 's1',
        nowIso: NOW,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.pin).toMatch(/^\d{6}$/);
      expect(res.pinHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/); // salt:sha256 (S51-H1)
      expect(Date.parse(res.expiresAtIso) - Date.parse(NOW)).toBe(5 * 60 * 1000);
    });

    it('crea el tramo inicial desde la apertura de la sesión cuando no existe', async () => {
      const res = await issueShiftPinAtomic(mockDb(worldWith({ outgoingShift: null })), {
        tenantId: 't1',
        userId: 'u1',
        sessionId: 's1',
        nowIso: NOW,
      });
      expect(res.ok).toBe(true);
    });
  });

  describe('processShiftTransferAtomic', () => {
    it('404 si la sesión no existe', async () => {
      const res = await processShiftTransferAtomic(mockDb(worldWith({ session: null })), {
        tenantId: 't1',
        sessionId: 's1',
        outgoingUserId: 'u1',
        incomingUserId: 'u2',
        pin: '123456',
        nowIso: NOW,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(404);
    });

    it('401 PIN_NOT_ISSUED sin PIN emitido en el tramo', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(
          worldWith({
            outgoingShift: { id: 'sh1', transfer_pin_hash: null, transfer_pin_expires_at: null },
          }),
        ),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PIN_NOT_ISSUED');
    });

    it('401 PIN_EXPIRED si el TTL venció (fail-closed, gana aunque el hash no sea el del pin)', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(
          worldWith({
            outgoingShift: {
              id: 'sh1',
              transfer_pin_hash: 'x'.repeat(64),
              transfer_pin_expires_at: '2020-01-01T00:00:00.000Z',
            },
          }),
        ),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PIN_EXPIRED');
    });

    it('401 PIN_INVALID si el hash no matchea dentro del TTL', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(
          worldWith({
            outgoingShift: {
              id: 'sh1',
              transfer_pin_hash: 'x'.repeat(64),
              transfer_pin_expires_at: '2099-01-01T00:00:00.000Z',
            },
          }),
        ),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('PIN_INVALID');
    });

    it('422 SAME_OPERATOR si entrante y saliente son el mismo', async () => {
      const res = await processShiftTransferAtomic(mockDb(worldWith()), {
        tenantId: 't1',
        sessionId: 's1',
        outgoingUserId: 'u1',
        incomingUserId: 'u1',
        pin: '123456',
        nowIso: NOW,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('SAME_OPERATOR');
    });

    it('422 INTERIM_COUNT_REQUIRED si la política lo exige y no hay conteo', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(worldWith({ policy: { interim_required: 1 } })),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INTERIM_COUNT_REQUIRED');
    });

    it('422 INTERIM_COUNT_INVALID con conteo no entero', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(worldWith({ policy: { interim_required: 1 } })),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          interimCountCents: 10.5,
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INTERIM_COUNT_INVALID');
    });

    it('409 PIN_USED si el guard del batch aborta (consumo concurrente)', async () => {
      const res = await processShiftTransferAtomic(mockDb(worldWith({ guardFails: true })), {
        tenantId: 't1',
        sessionId: 's1',
        outgoingUserId: 'u1',
        incomingUserId: 'u2',
        pin: '123456',
        nowIso: NOW,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PIN_USED');
    });

    it('transfiere con conteo intermedio y devuelve cashDiffCents', async () => {
      const res = await processShiftTransferAtomic(
        mockDb(worldWith({ policy: { interim_required: 1 } })),
        {
          tenantId: 't1',
          sessionId: 's1',
          outgoingUserId: 'u1',
          incomingUserId: 'u2',
          pin: '123456',
          interimCountCents: 8000,
          nowIso: NOW,
        },
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.cashDiffCents).toBe(2000);
      expect(res.interimRequired).toBe(true);
      expect(res.incomingUserId).toBe('u2');
    });

    it('transfiere sin conteo si la política no lo exige', async () => {
      const res = await processShiftTransferAtomic(mockDb(worldWith()), {
        tenantId: 't1',
        sessionId: 's1',
        outgoingUserId: 'u1',
        incomingUserId: 'u2',
        pin: '123456',
        nowIso: NOW,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.cashDiffCents).toBeNull();
      expect(res.interimRequired).toBe(false);
    });
  });

  describe('processTeamInviteAtomic', () => {
    it('422 INVITE_INVALID_EMAIL y INVITE_INVALID_ROLE', async () => {
      const db = mockDb(worldWith());
      const badEmail = await processTeamInviteAtomic(db, {
        tenantId: 't1',
        actorUserId: 'u1',
        email: 'sin-arroba',
        role: 'cashier',
      });
      expect(badEmail.ok).toBe(false);
      if (badEmail.ok) return;
      expect(badEmail.status).toBe(422);
      expect(badEmail.body.code).toBe('INVITE_INVALID_EMAIL');
      const badRole = await processTeamInviteAtomic(db, {
        tenantId: 't1',
        actorUserId: 'u1',
        email: 'a@b.co',
        role: 'owner' as never,
      });
      expect(badRole.ok).toBe(false);
      if (badRole.ok) return;
      expect(badRole.status).toBe(422);
      expect(badRole.body.code).toBe('INVITE_INVALID_ROLE');
    });

    it('409 USER_ALREADY_INVITED si el email ya existe', async () => {
      const res = await processTeamInviteAtomic(
        mockDb(worldWith({ existingUser: { id: 'u-x' } })),
        { tenantId: 't1', actorUserId: 'u1', email: 'a@b.co', role: 'cashier' },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('USER_ALREADY_INVITED');
    });

    it('crea usuario con badge EMP- y PIN de caja', async () => {
      const res = await processTeamInviteAtomic(mockDb(worldWith()), {
        tenantId: 't1',
        actorUserId: 'u1',
        email: ' vendedor@tienda.pe ',
        role: 'cashier',
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.badgeBarcode).toMatch(/^EMP-\d{5,}$/);
      expect(res.cashierPin).toMatch(/^\d{4}$/);
    });
  });

  describe('resolveSellerIdentifier', () => {
    it('resuelve por badge EMP-', async () => {
      const res = await resolveSellerIdentifier(
        mockDb(
          worldWith({
            sellerByBadge: {
              id: 'u9',
              email: 'v@t.pe',
              role: 'cashier',
              badge_barcode: 'EMP-55555',
            },
          }),
        ),
        't1',
        'EMP-55555',
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.seller.resolvedBy).toBe('badge');
      expect(res.seller.userId).toBe('u9');
    });

    it('resuelve por PIN de caja (hash server-side)', async () => {
      const res = await resolveSellerIdentifier(
        mockDb(
          worldWith({
            sellerByPin: { id: 'u9', email: 'v@t.pe', role: 'cashier', badge_barcode: null },
          }),
        ),
        't1',
        '1234',
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.seller.resolvedBy).toBe('pin');
    });

    it('fail-closed ante identificador desconocido', async () => {
      const res = await resolveSellerIdentifier(mockDb(worldWith()), 't1', 'EMP-99999');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('UNKNOWN_IDENTIFIER');
      const garbage = await resolveSellerIdentifier(mockDb(worldWith()), 't1', 'abc');
      expect(garbage.ok).toBe(false);
    });
  });
});
