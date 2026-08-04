export type CashRole = 'owner' | 'admin' | 'supervisor' | 'cashier';

export interface UserSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly allowedBranches: readonly string[];
  readonly role: CashRole;
  readonly permissions: readonly string[];
}

export type LoadUserResult =
  | { readonly ok: true; readonly user: UserSession }
  | {
      readonly ok: false;
      readonly status: 401 | 403;
      readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN_USER' | 'FORBIDDEN_BRANCH';
      readonly error: string;
    };

export interface UserRow {
  readonly id: string;
  readonly role: string;
  readonly permissions: string | null;
  readonly branch_id: string | null;
}

export interface UserLookupDb {
  prepare(query: string): {
    bind(...args: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
}

const CASH_ROLES: ReadonlySet<string> = new Set(['cashier', 'supervisor']);
const ALL_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'supervisor', 'cashier']);

function parsePermissions(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

/**
 * IdP sync → D1 (Arquitectura §3): usuario activo por external_auth_id + tenant.
 */
export async function loadUserFromD1(
  db: UserLookupDb,
  tenantId: string,
  externalAuthId: string,
): Promise<LoadUserResult> {
  if (!externalAuthId) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      error: 'JWT subject missing',
    };
  }

  const userRecord = await db
    .prepare(
      `SELECT id, role, permissions, branch_id FROM users
       WHERE external_auth_id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL`,
    )
    .bind(externalAuthId, tenantId)
    .first<UserRow>();

  if (!userRecord) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_USER',
      error: 'Local user is not active for this tenant',
    };
  }

  if (!ALL_ROLES.has(userRecord.role)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_USER',
      error: 'Local user is not active for this tenant',
    };
  }

  if (!userRecord.branch_id && CASH_ROLES.has(userRecord.role)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_BRANCH',
      error: 'Cash role requires a branch',
    };
  }

  const role = userRecord.role as CashRole;
  const branchId = userRecord.branch_id ?? '';
  return {
    ok: true,
    user: {
      userId: userRecord.id,
      tenantId,
      branchId,
      allowedBranches: branchId ? [branchId] : [],
      role,
      permissions: parsePermissions(userRecord.permissions),
    },
  };
}
