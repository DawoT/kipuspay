import { describe, expect, it } from 'vitest';
import { loadUserFromD1, type UserLookupDb, type UserRow } from './idp-user.js';

function fakeDb(row: UserRow | null): UserLookupDb {
  return {
    prepare: () => ({
      bind: () => ({
        first: <T>() => Promise.resolve(row as T | null),
      }),
    }),
  };
}

describe('loadUserFromD1 (IdP sync)', () => {
  it('403 FORBIDDEN_USER si no hay fila activa', async () => {
    await expect(loadUserFromD1(fakeDb(null), 't1', 'ext-1')).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'FORBIDDEN_USER',
    });
  });

  it('403 FORBIDDEN_BRANCH si cashier sin branch', async () => {
    await expect(
      loadUserFromD1(
        fakeDb({
          id: 'u1',
          role: 'cashier',
          permissions: '[]',
          branch_id: null,
        }),
        't1',
        'ext-1',
      ),
    ).resolves.toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN_BRANCH' });
  });

  it('ok con owner sin branch', async () => {
    await expect(
      loadUserFromD1(
        fakeDb({
          id: 'u1',
          role: 'owner',
          permissions: '["reports"]',
          branch_id: null,
        }),
        't1',
        'ext-1',
      ),
    ).resolves.toMatchObject({
      ok: true,
      user: { userId: 'u1', role: 'owner', permissions: ['reports'] },
    });
  });

  it('401 si falta subject', async () => {
    await expect(loadUserFromD1(fakeDb(null), 't1', '')).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});
