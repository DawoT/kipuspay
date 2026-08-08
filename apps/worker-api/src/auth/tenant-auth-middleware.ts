import { createMiddleware } from 'hono/factory';
import {
  decideAuthGate,
  type AuthGateInput,
  type AuthTenantSnapshot,
  type RevocationLookup,
} from './auth-decide.js';
import type { LoadUserResult, UserSession } from './idp-user.js';

export interface VerifiedJwtClaims {
  readonly tenantId: string;
  readonly sub: string;
  readonly authTime?: number;
}

export interface TenantAuthDeps {
  readonly verifyJwt: (token: string) => Promise<VerifiedJwtClaims | null>;
  readonly getTenant: (tenantId: string) => Promise<AuthTenantSnapshot | null>;
  readonly checkRevocation: (tenantId: string) => Promise<RevocationLookup>;
  /** IdP → D1; si se omite, no se exige usuario local (tests de plano de control). */
  readonly loadUser?: (tenantId: string, externalAuthId: string) => Promise<LoadUserResult>;
  readonly nowMs?: () => number;
}

interface AuthVariables {
  tenant: AuthTenantSnapshot;
  jwt: VerifiedJwtClaims;
  user?: UserSession;
}

async function resolveJwt(
  deps: TenantAuthDeps,
  authz: string,
): Promise<{ hasBearerJwt: boolean; jwt: VerifiedJwtClaims | null }> {
  const hasBearerJwt = authz.startsWith('Bearer ');
  if (!hasBearerJwt) return { hasBearerJwt: false, jwt: null };
  try {
    return { hasBearerJwt: true, jwt: await deps.verifyJwt(authz.slice(7)) };
  } catch {
    return { hasBearerJwt: true, jwt: null };
  }
}

function hintMismatch(jwt: VerifiedJwtClaims | null, host: string, xTenantId: string): boolean {
  const hintTenantId = xTenantId || host.split('.')[0] || '';
  return Boolean(
    jwt && hintTenantId && hintTenantId !== 'localhost' && hintTenantId !== jwt.tenantId,
  );
}

async function loadTenant(
  deps: TenantAuthDeps,
  jwt: VerifiedJwtClaims | null,
): Promise<{ tenant: AuthTenantSnapshot | null; tenantLookupFailed: boolean }> {
  if (!jwt) return { tenant: null, tenantLookupFailed: false };
  try {
    return { tenant: await deps.getTenant(jwt.tenantId), tenantLookupFailed: false };
  } catch {
    return { tenant: null, tenantLookupFailed: true };
  }
}

async function loadRevocation(
  deps: TenantAuthDeps,
  jwt: VerifiedJwtClaims | null,
  tenantLookupFailed: boolean,
  tenant: AuthTenantSnapshot | null,
): Promise<RevocationLookup> {
  if (!jwt || tenantLookupFailed || !tenant) return { available: false };
  try {
    return await deps.checkRevocation(jwt.tenantId);
  } catch {
    return { available: false };
  }
}

/**
 * tenantAndAuthMiddleware: fail-closed + Plan Guard + IdP user (opcional).
 */
export function createTenantAndAuthMiddleware(deps: TenantAuthDeps) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const { hasBearerJwt, jwt } = await resolveJwt(deps, c.req.header('authorization') || '');
    const { tenant, tenantLookupFailed } = await loadTenant(deps, jwt);
    const revocation = await loadRevocation(deps, jwt, tenantLookupFailed, tenant);

    const input: AuthGateInput = {
      hasBearerJwt,
      jwtValid: jwt !== null,
      tenantHintMismatch: hintMismatch(
        jwt,
        c.req.header('host') || '',
        c.req.header('x-tenant-id') || '',
      ),
      tenant,
      tenantLookupFailed,
      revocation,
      path: c.req.path,
      nowMs: (deps.nowMs ?? Date.now)(),
    };

    const decision = decideAuthGate(input);
    if (!decision.ok) {
      return c.json({ error: decision.error, code: decision.code }, decision.status);
    }

    if (deps.loadUser && jwt) {
      const userResult = await deps.loadUser(jwt.tenantId, jwt.sub);
      if (!userResult.ok) {
        return c.json({ error: userResult.error, code: userResult.code }, userResult.status);
      }
      c.set('user', userResult.user);
    }

    c.set('tenant', tenant as AuthTenantSnapshot);
    c.set('jwt', jwt as VerifiedJwtClaims);
    await next();
  });
}

/** Deps fail-closed por defecto: sin plano de revocación configurado → 503. */
export function defaultFailClosedDeps(): TenantAuthDeps {
  return {
    verifyJwt: () => Promise.resolve(null),
    getTenant: () => Promise.reject(new Error('TENANT_CACHE_UNAVAILABLE')),
    checkRevocation: () => Promise.resolve({ available: false }),
  };
}
