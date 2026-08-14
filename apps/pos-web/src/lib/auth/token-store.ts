export const LOGIN_TOKEN_KEY = 'kipuspay_token';
export const LOGIN_USER_KEY = 'kipuspay_user';
export const LOGIN_TENANT_KEY = 'kipuspay_tenant_id';

export interface LoginUserIdentity {
  readonly userId: string;
  readonly role: string;
  readonly branchId: string;
}

function safeGet(storage: Pick<Storage, 'getItem'> | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // El login persiste aunque el storage esté bloqueado.
  }
}

export function readLoginToken(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): string | null {
  const token = safeGet(storage, LOGIN_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export function writeLoginToken(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  token: string,
): void {
  safeSet(storage, LOGIN_TOKEN_KEY, token);
}

export function clearLoginToken(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(LOGIN_TOKEN_KEY);
  } catch {
    // Sin storage: nada que limpiar.
  }
}

export function resolveAuthorization(storage: Pick<Storage, 'getItem'> | null | undefined): string {
  const token = readLoginToken(storage);
  return token ? `Bearer ${token}` : '';
}

export function writeLoginUser(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  user: LoginUserIdentity,
): void {
  try {
    storage?.setItem(LOGIN_USER_KEY, JSON.stringify(user));
  } catch {
    // Sin storage: la sesión vive solo en memoria.
  }
}

export function readLoginUser(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): LoginUserIdentity | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(LOGIN_USER_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.userId === 'string' &&
      typeof value.role === 'string' &&
      typeof value.branchId === 'string'
    ) {
      return { userId: value.userId, role: value.role, branchId: value.branchId };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLoginTenantId(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  tenantId: string,
): void {
  try {
    storage?.setItem(LOGIN_TENANT_KEY, tenantId);
  } catch {
    // Sin storage: el hint vive solo en memoria.
  }
}
