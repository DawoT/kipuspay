import { describe, expect, it } from 'vitest';
import { runResolveSellerHttp, runTeamInviteHttp, type TeamEnv } from './team-routes.js';

function mockDb(overrides: Partial<Record<string, unknown>> = {}): unknown {
  const first = (sql: string) => {
    if (sql.includes('FROM users') && sql.includes('badge_barcode = ?')) {
      return overrides.sellerByBadge ?? null;
    }
    if (sql.includes('FROM users') && sql.includes('pin_hash = ?')) {
      return overrides.sellerByPin ?? null;
    }
    if (sql.includes('FROM users') && sql.includes('email = ?')) {
      return overrides.existingUser ?? null;
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

function envWith(overrides: Partial<TeamEnv> = {}): TeamEnv {
  return { FEATURE_TEAM_INVITE: '1', DB: mockDb(), ...overrides };
}

const owner = { tenantId: 't1', userId: 'u1', role: 'owner' };
const cashier = { tenantId: 't1', userId: 'u2', role: 'cashier' };

describe('ops.team_invite routes (Sprint 51)', () => {
  it('flag off → 404 FEATURE_OFF en invite y resolve', async () => {
    const env = envWith({ FEATURE_TEAM_INVITE: '0' });
    expect((await runTeamInviteHttp(env, owner, { email: 'a@b.co', role: 'cashier' })).status).toBe(
      404,
    );
    expect((await runResolveSellerHttp(env, owner, { identifier: 'EMP-12345' })).status).toBe(404);
  });

  it('invite: solo owner/admin/supervisor → 403 para cashier', async () => {
    const res = await runTeamInviteHttp(envWith(), cashier, { email: 'a@b.co', role: 'cashier' });
    expect(res.status).toBe(403);
  });

  it('invite: valida email y rol requeridos', async () => {
    const res = await runTeamInviteHttp(envWith(), owner, {});
    expect(res.status).toBe(400);
  });

  it('invite: email inválido → 422 INVITE_INVALID_EMAIL', async () => {
    const res = await runTeamInviteHttp(envWith(), owner, { email: 'sin-arroba', role: 'cashier' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVITE_INVALID_EMAIL');
  });

  it('invite: rol no permitido → 422 INVITE_INVALID_ROLE', async () => {
    const res = await runTeamInviteHttp(envWith(), owner, { email: 'a@b.co', role: 'owner' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVITE_INVALID_ROLE');
  });

  it('invite: duplicado por email → 409 USER_ALREADY_INVITED', async () => {
    const env = envWith({ DB: mockDb({ existingUser: { id: 'u-x' } }) });
    const res = await runTeamInviteHttp(env, owner, { email: 'a@b.co', role: 'cashier' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USER_ALREADY_INVITED');
  });

  it('invite: crea y devuelve badge EMP- + PIN de caja una sola vez', async () => {
    const res = await runTeamInviteHttp(envWith(), owner, {
      email: 'vendedor@tienda.pe',
      role: 'cashier',
      branchId: 'b1',
    });
    expect(res.status).toBe(201);
    expect(res.body.badgeBarcode).toMatch(/^EMP-\d{5,}$/);
    expect(res.body.cashierPin).toMatch(/^\d{4}$/);
  });

  it('resolve: badge EMP- → vendedor por badge (edge 1A)', async () => {
    const env = envWith({
      DB: mockDb({
        sellerByBadge: {
          id: 'u9',
          email: 'v@tienda.pe',
          role: 'cashier',
          badge_barcode: 'EMP-55555',
        },
      }),
    });
    const res = await runResolveSellerHttp(env, owner, { identifier: 'EMP-55555' });
    expect(res.status).toBe(200);
    expect(res.body.resolvedBy).toBe('badge');
    expect(res.body.userId).toBe('u9');
  });

  it('resolve: PIN de caja → vendedor por hash server-side', async () => {
    const env = envWith({
      DB: mockDb({
        sellerByPin: { id: 'u9', email: 'v@tienda.pe', role: 'cashier', badge_barcode: null },
      }),
    });
    const res = await runResolveSellerHttp(env, owner, { identifier: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.resolvedBy).toBe('pin');
  });

  it('resolve: fail-closed — identificador desconocido → 404 UNKNOWN_IDENTIFIER', async () => {
    const res = await runResolveSellerHttp(envWith(), owner, { identifier: 'EMP-99999' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('UNKNOWN_IDENTIFIER');
  });

  it('resolve: valida identifier requerido', async () => {
    const res = await runResolveSellerHttp(envWith(), owner, {});
    expect(res.status).toBe(400);
  });
});
