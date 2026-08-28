import type { WorkerEnv } from './control-plane.js';
import type { UserSession } from './idp-user.js';
import type { AuthTenantSnapshot } from './auth-decide.js';

export interface AuthenticatedSessionHttpResult {
  readonly status: 200 | 401 | 403 | 503;
  readonly body: Record<string, unknown>;
}

function isCapDynamicEnabled(env: WorkerEnv): boolean {
  return (
    env.FEATURE_TENANT_CAPABILITIES_DYNAMIC === '1' ||
    env.FEATURE_TENANT_CAPABILITIES_DYNAMIC === 'true'
  );
}

const CAP_CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 10_000;
const capsCache = new Map<string, { value: string[]; ts: number }>();
const epochCache = new Map<string, { value: number; ts: number }>();

export function clearSessionCapabilitiesCache(): void {
  capsCache.clear();
  epochCache.clear();
}

function putCapsCache(tenantId: string, value: string[]): void {
  if (capsCache.size >= MAX_CACHE_ENTRIES && !capsCache.has(tenantId)) {
    const oldest = capsCache.keys().next().value;
    if (oldest !== undefined) capsCache.delete(oldest);
  }
  capsCache.set(tenantId, { value, ts: Date.now() });
}

function putEpochCache(tenantId: string, value: number): void {
  if (epochCache.size >= MAX_CACHE_ENTRIES && !epochCache.has(tenantId)) {
    const oldest = epochCache.keys().next().value;
    if (oldest !== undefined) epochCache.delete(oldest);
  }
  epochCache.set(tenantId, { value, ts: Date.now() });
}

async function getCapabilitiesCached(env: WorkerEnv, tenantId: string): Promise<string[]> {
  const cached = capsCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CAP_CACHE_TTL_MS) return cached.value;
  if (!env.DB) throw new Error('CAPABILITIES_UNAVAILABLE');
  try {
    const result = await env.DB.prepare(
      'SELECT capability FROM tenant_capabilities WHERE tenant_id = ? AND enabled = 1 ORDER BY capability ASC',
    )
      .bind(tenantId)
      .all<{ capability: string }>();
    const caps = (result.results ?? []).map((r) => String(r.capability)).sort();
    putCapsCache(tenantId, caps);
    return caps;
  } catch {
    throw new Error('CAPABILITIES_UNAVAILABLE');
  }
}

async function getEpochCached(env: WorkerEnv, tenantId: string): Promise<number> {
  const cached = epochCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CAP_CACHE_TTL_MS) return cached.value;
  if (!env.DB) throw new Error('CAPABILITIES_UNAVAILABLE');
  try {
    const row = await env.DB.prepare('SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?')
      .bind(tenantId)
      .first<{ epoch: number }>();
    const epoch = typeof row?.epoch === 'number' && Number.isFinite(row.epoch) ? row.epoch : 0;
    putEpochCache(tenantId, epoch);
    return epoch;
  } catch {
    throw new Error('CAPABILITIES_UNAVAILABLE');
  }
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

  let capabilities: string[];
  let capabilitiesEpoch: number;
  if (isCapDynamicEnabled(env)) {
    try {
      const tenantId = user.tenantId;
      capabilities = await getCapabilitiesCached(env, tenantId);
      capabilitiesEpoch = await getEpochCached(env, tenantId);
    } catch {
      return { status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } };
    }
  } else {
    capabilities = [];
    capabilitiesEpoch = 0;
  }

  const cashRole = user.role === 'cashier' || user.role === 'supervisor';
  if (!cashRole) {
    return {
      status: 200,
      body: {
        userId: user.userId,
        role: user.role,
        branchId: user.branchId,
        terminal: null,
        capabilities,
        capabilitiesEpoch,
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
        capabilities,
        capabilitiesEpoch,
        ...(billing ? { billing } : {}),
      },
    };
  } catch {
    return { status: 503, body: { code: 'TERMINAL_SESSION_UNAVAILABLE' } };
  }
}
