import type { AuthTenantSnapshot, RevocationLookup, SubscriptionStatus } from './auth-decide.js';
import { loadUserFromD1 } from './idp-user.js';
import type { TenantAuthDeps } from './tenant-auth-middleware.js';
import { verifyJwt, type JwtVerifyEnv } from './verify-jwt.js';
import type { BackupKmsBinding } from '../backup/backup-workflow.js';

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
  /** Analytics Engine — solo features de dashboards (ADR-0030, Principio 9). */
  readonly ANALYTICS_ENGINE?: AnalyticsEngineDataset;
  readonly STRIPE_WEBHOOK_SECRET?: string;
  readonly FQDN?: string;
  /** Origen HTTPS del POS (pages.dev ahora; app.kipuspay.com solo tras DM). */
  readonly POS_APP_ORIGIN?: string;
  readonly ALLOWED_ORIGINS?: string;
  /** Proceso §5.1: motor ACID offline desactivable sin rollback de código. */
  readonly FEATURE_ACID_OFFLINE_SALE?: string;
  readonly FEATURE_FISCAL_CPE?: string;
  readonly FEATURE_FISCAL_RC?: string;
  readonly FEATURE_FISCAL_CIRCUIT_BREAKER?: string;
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  /** C6: endpoint del PSE KipusPay para RC (worker-fiscal y RC cron). */
  readonly FISCAL_PSE_ENDPOINT_URL?: string;
  /** C6: R2 con los XML fiscales producidos (worker-fiscal los escribe). */
  readonly FISCAL_XML_R2?: {
    get(key: string): Promise<{ text(): Promise<string> } | null>;
    put(key: string, value: string): Promise<void>;
  };
  /** C6: WorkerEntrypoint FiscalService del worker-fiscal (drain + produce). */
  readonly FISCAL?: {
    drain(options?: { readonly limit?: number }): Promise<unknown>;
    produceMissing(input: { readonly tenantId: string; readonly saleId: string }): Promise<unknown>;
    wrapTenantDek?(input: {
      readonly tenantId: string;
      readonly backupId: string;
      readonly dek: Uint8Array;
    }): Promise<
      { readonly wrappedDekB64: string; readonly kekVersion: string } | { readonly error: string }
    >;
    submitRc?(input: {
      readonly tenantId: string;
      readonly summaryId: string;
      readonly xml: string;
    }): Promise<{
      readonly accepted: boolean;
      readonly cdrCode: string;
      readonly cdrMessage: string;
    }>;
  };
  /** ADR-FISCAL-007: SOL del emisor para SOAP billService (worker-api y RPC). */
  readonly SUNAT_SOL_USER?: string;
  readonly SUNAT_SOL_PASSWORD?: string;
  readonly SUNAT_BILL_ENDPOINT_URL?: string;
  /** Canal billService: staging (default, e-beta) | production (URL oficial allowlist). */
  readonly SUNAT_BILL_CHANNEL?: string;
  readonly FISCAL_PSE_FETCH?: typeof fetch;
  /** Envelope cifrado del certificado de tenant (secreto o binding con get()). */
  readonly TENANT_CERT_ENVELOPE?: string | { get(): Promise<string> };
  readonly FEATURE_BILLING_USAGE_OVERAGE?: string;
  readonly FEATURE_SALES_RETURNS?: string;
  readonly STRIPE_SECRET_KEY?: string;
  readonly STRIPE_PRICE_ARRANQUE?: string;
  readonly STRIPE_PRICE_CRECE?: string;
  readonly STRIPE_PRICE_CADENA?: string;
  readonly PLATFORM_STAFF_TOKEN?: string;
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
  /** S1 (Sprint 7): token interno worker→DO del KDS (broadcast/replay). */
  readonly KDS_BROADCAST_TOKEN?: string;
  readonly FEATURE_STOCK_TRANSFERS?: string;
  readonly FEATURE_PURCHASING_PARTIAL_RECEIVE?: string;
  readonly FEATURE_PURCHASING_THREE_WAY?: string;
  /** Sprint 30: promociones y tramos (ADR-0014). */
  readonly FEATURE_PRICING_PROMOTIONS?: string;
  /** Sprint 31: variantes/UOM exactas (ADR-0015). */
  readonly FEATURE_CATALOG_VARIANTS?: string;
  readonly FEATURE_CATALOG_UOM?: string;
  /** Sprint C1: catálogo vendible para la terminal del POS. */
  readonly FEATURE_CATALOG_SELLABLE?: string;
  /** Sprint C2: login local del POS con PIN de cajero (ADR-0034). */
  readonly FEATURE_AUTH_CASHIER_LOGIN?: string;
  /** Sprint 32: apartados + diario (ADR-0016). */
  readonly FEATURE_SALES_LAYAWAY?: string;
  readonly FEATURE_LEDGER_CHART_OF_ACCOUNTS?: string;
  /** Sprint 33: cotizaciones COM-05 (ADR-0017). */
  readonly FEATURE_SALES_QUOTES?: string;
  /** Sprint 34: devolución a proveedor (ADR-0018). */
  readonly FEATURE_PURCHASING_RETURNS?: string;
  /** Sprint 35: crédito de tienda / gift cards (ADR-0019). */
  readonly FEATURE_LEDGER_STORE_CREDIT?: string;
  /** Sprint 36: cuotas / pago en partes. */
  readonly FEATURE_SALES_INSTALLMENTS?: string;
  /** Sprint 37: comisiones de vendedor. */
  readonly FEATURE_SALES_COMMISSIONS?: string;
  /** Sprint 38: ubicaciones y racks. */
  readonly FEATURE_INVENTORY_LOCATIONS?: string;
  /** Sprint 39: identidad serial y leases offline. */
  readonly FEATURE_INVENTORY_SERIALS?: string;
  /** Sprint 40: peso variable y balanza. */
  readonly FEATURE_INVENTORY_SCALE?: string;
  /** Sprint 41: etiquetas de precio autoritativas. */
  readonly FEATURE_CATALOG_PRICE_LABELS?: string;
  /** Sprint 42: export KPBK1/restore dry-run, default-off. */
  readonly FEATURE_DATA_BACKUP?: string;
  /** Sprint 43: pedidos de cliente con reserva, default-off. */
  readonly FEATURE_ORDERS_CUSTOMER_ORDERS?: string;
  /** Sprint 44: ventas recurrentes; ejecución manual solo con guard de entorno. */
  readonly FEATURE_SALES_RECURRING?: string;
  readonly RECURRING_MANUAL_RUN_ENABLED?: string;
  /** Sprint 45: push operacional y cliente PWA móvil; ambos default-off. */
  readonly FEATURE_MOBILE_PUSH?: string;
  readonly FEATURE_CLIENT_MOBILE_POS?: string;
  /** ADR-0036: despacho push inline post-enqueue vía waitUntil; default-off (palanca de rollback). */
  readonly FEATURE_PUSH_INLINE_DISPATCH?: string;
  /** Sprint 46: analítica predictiva (Holt-Winters), default-off. */
  readonly FEATURE_ANALYTICS_FORECASTING?: string;
  readonly FEATURE_ANALYTICS_AGENTIC_INSIGHTS?: string;
  readonly AI_MODEL?: string;
  readonly PUSH_VAPID_PUBLIC_KEY?: string;
  readonly PUSH_KMS?: {
    encryptEnvelope(input: Record<string, unknown>): Promise<{
      ciphertext: string;
      keyVersion: string;
      fingerprint: string;
    }>;
    sendWebPush(input: Record<string, unknown>): Promise<{
      provider: 'WEB_PUSH';
      status: 'ACCEPTED' | 'RETRY' | 'FAILED' | 'INVALID';
      responseCode: string;
      providerMessageIdHash: string;
      retryAfterSeconds: number | null;
      invalidateSubscription: boolean;
    }>;
    sendFcm(input: Record<string, unknown>): Promise<{
      provider: 'FCM_HTTP_V1';
      status: 'ACCEPTED' | 'RETRY' | 'FAILED' | 'INVALID';
      responseCode: string;
      providerMessageIdHash: string;
      retryAfterSeconds: number | null;
      invalidateSubscription: boolean;
    }>;
    issueAckReceipt(input: {
      tenantId: string;
      userId: string;
      deliveryId: string;
      subscriptionId: string;
      deviceFingerprint: string;
      issuedAtSeconds: number;
      expiresAtSeconds: number;
    }): Promise<{ token: string; receiptHash: string; keyVersion: string }>;
    verifyAckReceipt(input: { token: string; nowSeconds: number }): Promise<{
      tenantId: string;
      userId: string;
      deliveryId: string;
      subscriptionId: string;
      deviceFingerprint: string;
      issuedAtSeconds: number;
      expiresAtSeconds: number;
      nonce: string;
    }>;
  };
  readonly BACKUPS?: R2Bucket;
  readonly BACKUP_WORKFLOW?: Workflow<{
    readonly tenantId: string;
    readonly backupId: string;
  }>;
  readonly BACKUP_KMS?: BackupKmsBinding;
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
  /** Ola 2 — capabilities dinámicas SaaS (ADR-ARCH-003) — kill-switch global. */
  readonly FEATURE_TENANT_CAPABILITIES_DYNAMIC?: string;
  /** Sprint 47 — LPDP: inventario/consentimiento/export/erase de datos personales. */
  readonly FEATURE_LPDP?: string;
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
