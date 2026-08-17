import type { WorkerEnv } from './control-plane.js';
import type { UserSession } from './idp-user.js';
import type { AuthTenantSnapshot } from './auth-decide.js';

export interface AuthenticatedSessionHttpResult {
  readonly status: 200 | 401 | 403 | 503;
  readonly body: Record<string, unknown>;
}

export async function runAuthenticatedSessionHttp(
  env: WorkerEnv,
  user: UserSession | undefined,
  terminalId: string,
  tenant?: AuthTenantSnapshot | null,
): Promise<AuthenticatedSessionHttpResult> {
  if (!user) return { status: 401, body: { code: 'UNAUTHENTICATED' } };
  const billing = tenant
    ? {
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        pastGracePeriod: tenant.pastGracePeriod,
      }
    : null;
  const cashRole = user.role === 'cashier' || user.role === 'supervisor';
  if (!cashRole) {
    return {
      status: 200,
      body: {
        userId: user.userId,
        role: user.role,
        branchId: user.branchId,
        terminal: null,
        ...(billing ? { billing } : {}),
      },
    };
  }
  if (!terminalId || !env.DB) {
    return {
      status: env.DB ? 403 : 503,
      body: { code: env.DB ? 'TERMINAL_SESSION_REQUIRED' : 'DB_UNAVAILABLE' },
    };
  }
  try {
    const terminal = await env.DB.prepare(
      `SELECT t.id AS terminal_id, s.id AS terminal_session_id
       FROM pos_terminals t
       JOIN pos_terminal_sessions s ON s.tenant_id = t.tenant_id
         AND s.terminal_id = t.id AND s.status = 'ACTIVE'
       WHERE t.tenant_id = ? AND t.id = ? AND t.branch_id = ?
         AND s.user_id = ? AND s.branch_id = ?
       LIMIT 1`,
    )
      .bind(user.tenantId, terminalId, user.branchId, user.userId, user.branchId)
      .first<{ terminal_id: string; terminal_session_id: string }>();
    if (!terminal) {
      return { status: 403, body: { code: 'TERMINAL_SESSION_REQUIRED' } };
    }
    return {
      status: 200,
      body: {
        userId: user.userId,
        role: user.role,
        branchId: user.branchId,
        terminal: {
          terminalId: terminal.terminal_id,
          terminalSessionId: terminal.terminal_session_id,
        },
        ...(billing ? { billing } : {}),
      },
    };
  } catch {
    return { status: 503, body: { code: 'TERMINAL_SESSION_UNAVAILABLE' } };
  }
}
