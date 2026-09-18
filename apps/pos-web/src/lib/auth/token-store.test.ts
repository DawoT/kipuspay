import { describe, expect, it } from 'vitest';
import {
  createLoginIdentityGeneration,
  clearLoginToken,
  readLoginToken,
  readLoginUser,
  resolveAuthorization,
  subscribeLoginIdentityChanges,
  writeLoginToken,
  writeLoginTenantId,
  writeLoginUser,
} from './token-store';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
}

describe('token-store', () => {
  it('invalida una respuesta A antigua después de una transición A → B → A', () => {
    const identity = createLoginIdentityGeneration();
    const firstA = identity.next();

    identity.next();
    const currentA = identity.next();

    expect(identity.isCurrent(firstA)).toBe(false);
    expect(identity.isCurrent(currentA)).toBe(true);
  });

  it('escribe y lee el token', () => {
    const storage = memoryStorage();
    writeLoginToken(storage, 'jwt-abc');
    expect(readLoginToken(storage)).toBe('jwt-abc');
  });

  it('limpia el token', () => {
    const storage = memoryStorage();
    writeLoginToken(storage, 'jwt-abc');
    clearLoginToken(storage);
    expect(readLoginToken(storage)).toBeNull();
  });

  it('notifica cambios de token/tenant para que la sesión POS revalide su catálogo', () => {
    const storage = memoryStorage();
    const changes: string[] = [];
    const unsubscribe = subscribeLoginIdentityChanges((kind) => changes.push(kind));

    writeLoginToken(storage, 'jwt-abc');
    writeLoginTenantId(storage, 'tenant-a');
    clearLoginToken(storage);
    writeLoginUser(storage, { userId: 'u1', role: 'owner', branchId: 'b1' });
    unsubscribe();
    writeLoginToken(storage, 'jwt-next');

    expect(changes).toEqual(['token', 'tenant', 'token']);
  });

  it('guarda la identidad del cajero del login (userId/role/branch)', () => {
    const storage = memoryStorage();
    expect(readLoginUser(storage)).toBeNull();
    writeLoginUser(storage, { userId: 'u1', role: 'cashier', branchId: 'b1' });
    expect(readLoginUser(storage)).toEqual({ userId: 'u1', role: 'cashier', branchId: 'b1' });
  });

  it('readLoginUser tolera JSON corrupto (fail-closed null)', () => {
    const storage = memoryStorage();
    storage.setItem('kipuspay_user', '{roto');
    expect(readLoginUser(storage)).toBeNull();
  });

  it('resolveAuthorization devuelve Bearer solo si hay token', () => {
    const storage = memoryStorage();
    expect(resolveAuthorization(storage)).toBe('');
    writeLoginToken(storage, 'jwt-abc');
    expect(resolveAuthorization(storage)).toBe('Bearer jwt-abc');
  });

  it('tolerancia a storage bloqueado', () => {
    const broken: Storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    expect(readLoginToken(broken)).toBeNull();
    expect(resolveAuthorization(broken)).toBe('');
    expect(() => writeLoginToken(broken, 'x')).not.toThrow();
  });
});
