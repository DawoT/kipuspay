import type { AuthTenantSnapshot, RevocationLookup, SubscriptionStatus } from './auth-decide.js';
import { loadUserFromD1 } from './idp-user.js';
import type { TenantAuthDeps } from './tenant-auth-middleware.js';
import { verifyJwt, type JwtVerifyEnv } from './verify-jwt.js';

/** Bindings mínimos del plano de control (KV + DO). */
export interface ControlPlaneEnv {
  readonly TENANT_KV: {
    get(key: string): Promise<string | null>;
    put?(key: string, value: string): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  readonly TENANT_STATE_DO: {
    idFromName(name: string): { toString(): string };
    get(id: { toString(): string }): {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
}

export interface WorkerEnv extends ControlPlaneEnv, JwtVerifyEnv {
  readonly DB?: D1Database;
  /** Alias local de DB para dedup SEC-08 (Arquitectura §4). */
  readonly WEBHOOK_EVENTS_DB?: D1Database;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  readonly FQDN?: string;
  /** Proceso §5.1: motor ACID offline desactivable sin rollback de código. */
  readonly FEATURE_ACID_OFFLINE_SALE?: string;
  readonly FEATURE_FISCAL_CPE?: string;
  readonly FEATURE_FISCAL_RC?: string;
  readonly FEATURE_FISCAL_CIRCUIT_BREAKER?: string;
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  readonly FEATURE_CPE_PORTAL?: string;
  readonly FEATURE_OFFLINE_SYNC?: string;
  readonly FEATURE_POS_CHECKOUT?: string;
  readonly FEATURE_PRINT_TEMPLATES?: string;
  readonly FEATURE_VITRINA?: string;
  readonly FEATURE_LEDGER_AR_AP?: string;
  readonly FEATURE_PURCHASING_ORDERS?: string;
  readonly FEATURE_CASH_EXPENSES?: string;
  /** Sprint 17: cierre Z ciego / movimientos / reprints (ADR-0012). */
  readonly FEATURE_CASH_BLIND_Z?: string;
  readonly FEATURE_ORDERS_KDS?: string;
  readonly FEATURE_STOCK_TRANSFERS?: string;
  readonly FEATURE_PURCHASING_PARTIAL_RECEIVE?: string;
  /** Sprint 18 inventory capabilities. */
  readonly FEATURE_INVENTORY_BATCHES?: string;
  readonly FEATURE_INVENTORY_BOM?: string;
  readonly FEATURE_PRICING_LISTS?: string;
  readonly FEATURE_OWNER_MODE?: string;
  readonly FEATURE_OWNER_PUSH?: string;
  readonly FEATURE_REPORTING_ROLLUPS?: string;
  readonly FEATURE_REPORTING_CATALOG?: string;
  readonly FEATURE_REPORTING_EXPORT?: string;
  /** Sprint 21: importador de catálogo Bsale/Alegra/CSV (FASE 7 §5.4). */
  readonly FEATURE_CATALOG_IMPORT?: string;
  /** Sprint 22 — cobro local wallets / tarjeta. */
  readonly FEATURE_PAYMENTS_QR_WALLETS?: string;
  readonly FEATURE_PAYMENTS_CARD_ACQUIRER?: string;
  /** Sprint 23 — export Contasis/Concar + API pública. */
  readonly FEATURE_ACCOUNTING_EXPORT?: string;
  readonly FEATURE_INTEGRATIONS_API?: string;
  /** Sprint 24 — WhatsApp receipt + loyalty points. */
  readonly FEATURE_MESSAGING_WHATSAPP?: string;
  readonly FEATURE_LOYALTY_POINTS?: string;
  readonly WA_ACCESS_TOKEN?: string;
  readonly WA_PHONE_NUMBER_ID?: string;
  readonly WA_API_BASE?: string;
  /** Pepper HMAC para api_keys.key_hash (SEC-03). */
  readonly API_KEY_PEPPER?: string;
  readonly YAPE_WEBHOOK_SECRET?: string;
  readonly PLIN_WEBHOOK_SECRET?: string;
  readonly MP_WEBHOOK_SECRET?: string;
  readonly CULQI_WEBHOOK_SECRET?: string;
  readonly NIUBIZ_WEBHOOK_SECRET?: string;
  readonly CPE_PORTAL_SECRET?: string;
  /** Sprint 19 — KDS WebSocket hub (ADR-0013). */
  readonly BRANCH_KDS_HUB_DO?: ControlPlaneEnv['TENANT_STATE_DO'];
}

const isolateCache = new Map<string, { value: unknown; ts: number }>();
const MAX_ISOLATE_CACHE_ENTRIES = 10_000;
const ISOLATE_TTL_MS = 10_000;

const SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'trial',
  'active',
  'past_due',
  'canceled',
]);

function putIsolateCache(key: string, value: unknown): void {
  if (isolateCache.size >= MAX_ISOLATE_CACHE_ENTRIES && !isolateCache.has(key)) {
    const oldest = isolateCache.keys().next().value;
    if (oldest !== undefined) isolateCache.delete(oldest);
  }
  isolateCache.set(key, { value, ts: Date.now() });
}

/** Solo tests: limpia el caché de isolate entre casos. */
export function clearIsolateAuthCache(): void {
  isolateCache.clear();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRevokedPayload(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return Reflect.get(data, 'revoked') === true;
}

function mapTenantRow(raw: Record<string, unknown>): AuthTenantSnapshot {
  const statusRaw = raw.status ?? (raw.is_active ? 'active' : 'suspended');
  const status = statusRaw === 'active' ? 'active' : 'suspended';
  const subRaw = asString(raw.subscriptionStatus) ?? asString(raw.subscription_status) ?? 'active';
  const subscriptionStatus: SubscriptionStatus = SUBSCRIPTION_STATUSES.has(subRaw)
    ? (subRaw as SubscriptionStatus)
    : 'active';
  return {
    id: String(raw.id),
    status,
    subscriptionStatus,
    trialEndsAt: asString(raw.trialEndsAt) ?? asString(raw.trial_ends_at),
    pastGracePeriod: Boolean(raw.pastGracePeriod ?? raw.past_grace_period ?? false),
  };
}

/**
 * PERF-04: isolate → KV. Fallo de KV → throw (middleware → 503 AUTH_CONTROL).
 */
export async function getTenantCached(
  env: ControlPlaneEnv,
  tenantId: string,
): Promise<AuthTenantSnapshot | null> {
  const cacheKey = `tenant:${tenantId}`;
  const cached = isolateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ISOLATE_TTL_MS) {
    return cached.value as AuthTenantSnapshot | null;
  }
  try {
    const raw = await env.TENANT_KV.get(`tenant:${tenantId}`);
    if (!raw) {
      putIsolateCache(cacheKey, null);
      return null;
    }
    const parsed = mapTenantRow(JSON.parse(raw) as Record<string, unknown>);
    putIsolateCache(cacheKey, parsed);
    return parsed;
  } catch {
    throw new Error('TENANT_CACHE_UNAVAILABLE');
  }
}

/**
 * PERF-04 + fail-closed: KV solo acelera revoked=true; miss/0 → DO autoritativo.
 * Si el DO no responde → throw REVOCATION_CHECK_UNAVAILABLE (nunca false por omisión).
 */
export async function isTenantRevokedCached(
  env: ControlPlaneEnv,
  tenantId: string,
): Promise<boolean> {
  const cacheKey = `revoked:${tenantId}`;
  const cached = isolateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ISOLATE_TTL_MS) {
    return cached.value as boolean;
  }

  let kvFlag: string | null = null;
  try {
    kvFlag = await env.TENANT_KV.get(`revocation:${tenantId}`);
  } catch {
    // KV down: continuar al DO.
  }
  if (kvFlag === '1') {
    putIsolateCache(cacheKey, true);
    return true;
  }

  try {
    const id = env.TENANT_STATE_DO.idFromName(tenantId);
    const stub = env.TENANT_STATE_DO.get(id);
    const res = await stub.fetch(new Request('https://tenant-state/status'));
    if (!res.ok) throw new Error(`DO responded with status ${res.status}`);
    const data: unknown = await res.json();
    const revoked = isRevokedPayload(data);
    putIsolateCache(cacheKey, revoked);
    return revoked;
  } catch {
    throw new Error('REVOCATION_CHECK_UNAVAILABLE');
  }
}

export async function checkRevocationLookup(
  env: ControlPlaneEnv,
  tenantId: string,
): Promise<RevocationLookup> {
  try {
    const revoked = await isTenantRevokedCached(env, tenantId);
    return { available: true, revoked };
  } catch {
    return { available: false };
  }
}

/**
 * Deps de runtime: JWT WebCrypto + plano KV/DO + IdP/D1 (si hay DB).
 */
export function createAuthDepsFromEnv(env: WorkerEnv): TenantAuthDeps {
  const deps: TenantAuthDeps = {
    verifyJwt: (token: string) => verifyJwt(env, token),
    getTenant: (tenantId: string) => getTenantCached(env, tenantId),
    checkRevocation: (tenantId: string) => checkRevocationLookup(env, tenantId),
  };
  if (env.DB) {
    const db = env.DB;
    return {
      ...deps,
      loadUser: (tenantId, externalAuthId) => loadUserFromD1(db, tenantId, externalAuthId),
    };
  }
  return deps;
}
