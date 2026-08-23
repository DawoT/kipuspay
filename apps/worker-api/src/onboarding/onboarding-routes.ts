import type { WorkerEnv } from '../auth/control-plane.js';
import {
  bootstrapTenant,
  changeFormalizationStage,
  type TenantBootstrapInput,
  type VerticalType,
} from './onboarding-bootstrap.js';
import {
  appendAuditEvent,
  generateBadgeBarcode,
  generateCashierPin,
  hashPinArgon2id,
  persistBootstrap,
} from '@kipuspay/adapters-d1';
import { persistStripeCustomerBestEffort } from '../tenant/stripe-billing.js';
import { signHs256, verifyJwt } from '../auth/verify-jwt.js';
import { CASHIER_SESSION_TTL_SECONDS } from '../auth/cashier-login-route.js';
import type { FormalizationMode } from '@kipuspay/domain-fiscal-pe';
import { computeSetupProgress, type SetupServerState } from '@kipuspay/domain-onboarding';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

/** Bindings del bootstrap/claim: DB + KV (con put/delete) + secret HS256. */
export interface BootstrapHttpEnv {
  readonly DB?: D1Database;
  readonly TENANT_KV?: {
    get(key: string): Promise<string | null>;
    put?(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  readonly AUTH_JWT_HS_SECRET?: string;
  readonly STRIPE_SECRET_KEY?: string;
}

const ONBOARDING_TOKEN_TTL_SECONDS = 15 * 60;
const TRIAL_DAYS = 30;

const VERTICALS: readonly VerticalType[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
];

const MODES: readonly FormalizationMode[] = [
  'INTERNAL_CONTROL',
  'FORMALIZING',
  'ELECTRONIC_ISSUER',
];

function isVertical(v: unknown): v is VerticalType {
  return typeof v === 'string' && (VERTICALS as readonly string[]).includes(v);
}

function isMode(v: unknown): v is FormalizationMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v);
}

/** Valida el body y produce el dominio puro (sin persistir). */
function resolveBootstrapDomain(
  raw: unknown,
):
  | { ok: true; input: TenantBootstrapInput }
  | { ok: false; status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.tradeName !== 'string' ||
    !isVertical(o.verticalType) ||
    !isMode(o.formalizationMode)
  ) {
    return {
      ok: false,
      status: 422,
      body: { error: 'Campos de onboarding invalidos', code: 'INVALID_ONBOARDING' },
    };
  }
  return {
    ok: true,
    input: {
      tradeName: o.tradeName,
      verticalType: o.verticalType,
      formalizationMode: o.formalizationMode,
      ruc: typeof o.ruc === 'string' && o.ruc.length > 0 ? o.ruc : null,
    },
  };
}

interface OwnerCredentials {
  readonly branchId: string;
  readonly registerId: string;
  readonly sessionId: string;
  readonly ownerUserId: string;
  readonly ownerBadge: string;
  readonly ownerPin: string;
  readonly ownerPinHash: string;
}

async function generateOwnerCredentials(): Promise<OwnerCredentials> {
  const ownerPin = generateCashierPin();
  return {
    branchId: crypto.randomUUID(),
    registerId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    ownerUserId: crypto.randomUUID(),
    ownerBadge: generateBadgeBarcode(new Set()),
    ownerPin,
    ownerPinHash: await hashPinArgon2id(ownerPin),
  };
}

interface PersistedBootstrap {
  readonly tenantId: string;
  readonly tradeName: string;
  readonly branchId: string;
  readonly planId: string;
  readonly formalizationMode: string;
  readonly enabledDocumentTypes: readonly string[];
  readonly trialEndsAtIso: string;
  readonly ownerBadge: string;
  readonly ownerPin: string;
  readonly onboardingToken: string;
}

async function persistAndMintToken(
  env: BootstrapHttpEnv,
  domain: ReturnType<typeof bootstrapTenant>,
  credentials: OwnerCredentials,
  trialEndsAtIso: string,
  nowMs: number,
): Promise<
  | { ok: true; persisted: PersistedBootstrap }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const kv = env.TENANT_KV;
  const db = env.DB;
  const secret = env.AUTH_JWT_HS_SECRET;
  if (!kv?.put || !kv.delete || !db || !secret) {
    return {
      ok: false,
      status: 503,
      body: { error: 'Bootstrap unavailable', code: 'BOOTSTRAP_UNAVAILABLE' },
    };
  }
  const putFn = (key: string, value: string, opts?: { expirationTtl?: number }) =>
    kv.put!(key, value, opts);
  const deleteFn = (key: string) => kv.delete!(key);
  try {
    await persistBootstrap(
      db,
      (key, value, opts) => putFn(key, value, opts),
      (key) => deleteFn(key),
      {
        tenantId: domain.tenantId,
        tradeName: domain.tradeName,
        verticalType: domain.verticalType,
        formalizationMode: domain.formalizationMode,
        ruc: domain.ruc,
        enabledDocumentTypes: domain.enabledDocumentTypes,
        trialEndsAtIso,
        branchId: credentials.branchId,
        registerId: credentials.registerId,
        sessionId: credentials.sessionId,
        ownerUserId: credentials.ownerUserId,
        ownerEmail: `owner.${domain.tenantId}@kipuspay.com`,
        ownerBadge: credentials.ownerBadge,
        ownerPinHash: credentials.ownerPinHash,
        nowIso: new Date(nowMs).toISOString(),
      },
    );
  } catch (err) {
    return {
      ok: false,
      status: 500,
      body: {
        error: err instanceof Error ? err.message : 'bootstrap failed',
        code: 'BOOTSTRAP_PERSIST_FAILED',
      },
    };
  }
  await persistStripeCustomerBestEffort(env, domain.tenantId, domain.tradeName);
  const jti = crypto.randomUUID();
  const nowSec = Math.floor(nowMs / 1000);
  const token = await signHs256(secret, {
    sub: jti,
    tenantId: domain.tenantId,
    purpose: 'onboarding',
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + ONBOARDING_TOKEN_TTL_SECONDS,
  });
  await putFn(
    `onboarding:${jti}`,
    JSON.stringify({
      tenantId: domain.tenantId,
      ownerUserId: credentials.ownerUserId,
      branchId: credentials.branchId,
      sessionId: credentials.sessionId,
    }),
    { expirationTtl: ONBOARDING_TOKEN_TTL_SECONDS },
  );
  return {
    ok: true,
    persisted: {
      tenantId: domain.tenantId,
      tradeName: domain.tradeName,
      branchId: credentials.branchId,
      planId: domain.planId,
      formalizationMode: domain.formalizationMode,
      enabledDocumentTypes: domain.enabledDocumentTypes,
      trialEndsAtIso,
      ownerBadge: credentials.ownerBadge,
      ownerPin: credentials.ownerPin,
      onboardingToken: token,
    },
  };
}

function bindingsError(
  env: BootstrapHttpEnv,
): { status: number; body: Record<string, unknown> } | null {
  if (!env?.DB || !env?.TENANT_KV?.put || !env?.TENANT_KV?.delete || !env?.TENANT_KV?.get) {
    return { status: 503, body: { error: 'Bootstrap unavailable', code: 'BOOTSTRAP_UNAVAILABLE' } };
  }
  if (!env.AUTH_JWT_HS_SECRET) {
    return { status: 503, body: { error: 'Signing unavailable', code: 'SIGNING_UNAVAILABLE' } };
  }
  return null;
}

export async function runBootstrapHttp(
  env: BootstrapHttpEnv,
  raw: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const resolved = resolveBootstrapDomain(raw);
  if (!resolved.ok) return { status: resolved.status, body: resolved.body };
  let domain: ReturnType<typeof bootstrapTenant>;
  try {
    domain = bootstrapTenant(
      resolved.input,
      `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    );
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'bootstrap failed',
        code: 'BOOTSTRAP_REJECTED',
      },
    };
  }
  const unavailable = bindingsError(env);
  if (unavailable) return unavailable;
  const existing = await env.TENANT_KV?.get(`tenant:${domain.tenantId}`);
  if (existing) {
    return { status: 409, body: { error: 'Tenant already exists', code: 'TENANT_ALREADY_EXISTS' } };
  }
  const nowMs = Date.now();
  const trialEndsAtIso = new Date(nowMs + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const credentials = await generateOwnerCredentials();
  const result = await persistAndMintToken(env, domain, credentials, trialEndsAtIso, nowMs);
  if (!result.ok) return { status: result.status, body: result.body };
  const persisted = result.persisted;
  return {
    status: 201,
    body: {
      tenantId: persisted.tenantId,
      tradeName: persisted.tradeName,
      branchId: persisted.branchId,
      planId: persisted.planId,
      formalizationMode: persisted.formalizationMode,
      enabledDocumentTypes: persisted.enabledDocumentTypes,
      trialEndsAt: persisted.trialEndsAtIso,
      ownerBadge: persisted.ownerBadge,
      ownerPin: persisted.ownerPin,
      onboardingToken: persisted.onboardingToken,
      expiresInSeconds: ONBOARDING_TOKEN_TTL_SECONDS,
    },
  };
}

/**
 * M6A: consumo del token de onboarding (single-use, TTL 15 min).
 * Minta la sesión JWT del owner (12h) — el PIN ya no viaja por la red.
 */
interface ClaimedOnboarding {
  readonly tenantId: string;
  readonly ownerUserId: string;
  readonly branchId: string;
  readonly sessionId: string;
}

async function resolveClaimToken(
  env: BootstrapHttpEnv,
  token: string,
): Promise<
  | { ok: true; claimed: ClaimedOnboarding }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (!env?.TENANT_KV?.get || !env?.TENANT_KV?.delete) {
    return {
      ok: false,
      status: 503,
      body: { error: 'Claim unavailable', code: 'CLAIM_UNAVAILABLE' },
    };
  }
  const claims = await verifyJwt(env, token);
  if (!claims) {
    return { ok: false, status: 403, body: { error: 'Invalid token', code: 'INVALID_TOKEN' } };
  }
  const raw = await env.TENANT_KV.get(`onboarding:${claims.sub}`);
  if (!raw) {
    return {
      ok: false,
      status: 403,
      body: { error: 'Token used or expired', code: 'INVALID_TOKEN' },
    };
  }
  await env.TENANT_KV.delete(`onboarding:${claims.sub}`);
  let payload: { tenantId?: string; ownerUserId?: string; branchId?: string; sessionId?: string };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return { ok: false, status: 403, body: { error: 'Invalid token', code: 'INVALID_TOKEN' } };
  }
  if (!payload.tenantId || !payload.ownerUserId || payload.tenantId !== claims.tenantId) {
    return { ok: false, status: 403, body: { error: 'Invalid token', code: 'INVALID_TOKEN' } };
  }
  return {
    ok: true,
    claimed: {
      tenantId: payload.tenantId,
      ownerUserId: payload.ownerUserId,
      branchId: payload.branchId ?? '',
      sessionId: payload.sessionId ?? '',
    },
  };
}

export async function runOnboardingClaimHttp(
  env: BootstrapHttpEnv | undefined,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env?.AUTH_JWT_HS_SECRET) {
    return { status: 503, body: { error: 'Signing unavailable', code: 'SIGNING_UNAVAILABLE' } };
  }
  const resolved = await resolveClaimToken(env, token);
  if (!resolved.ok) return { status: resolved.status, body: resolved.body };
  const claimed = resolved.claimed;
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionToken = await signHs256(env.AUTH_JWT_HS_SECRET, {
    sub: claimed.ownerUserId,
    tenantId: claimed.tenantId,
    role: 'owner',
    branchId: claimed.branchId,
    auth_time: nowSec,
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + CASHIER_SESSION_TTL_SECONDS,
  });
  return {
    status: 200,
    body: {
      token: sessionToken,
      expiresAt: new Date((nowSec + CASHIER_SESSION_TTL_SECONDS) * 1000).toISOString(),
      user: { userId: claimed.ownerUserId, role: 'owner', branchId: claimed.branchId },
      cashRegisterSessionId: claimed.sessionId,
    },
  };
}

/**
 * S11-H2: cambio de etapa de formalización PERSISTENTE.
 * Valida el gate del dominio (sin saltos/retrocesos) y actualiza
 * `tenants.formalization_mode` + `enabled_document_types` en D1.
 */
async function persistFormalizationStage(
  env: WorkerEnv,
  tenantId: string,
  actorUserId: string,
  fromMode: string,
  result: ReturnType<typeof changeFormalizationStage>,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const enabled = result.enabledDocumentTypes.map((c) => `"${c}"`).join(',');
  const updated = await env.DB.prepare(
    `UPDATE tenants SET formalization_mode = ?, enabled_document_types = ?
     WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(result.formalizationMode, `[${enabled}]`, tenantId)
    .run();
  if ((updated.meta?.changes ?? 0) !== 1) {
    return { status: 404, body: { error: 'Tenant not found', code: 'TENANT_NOT_FOUND' } };
  }
  await appendAuditEvent(env.DB, { tenantId }, async (prev) => ({
    id: crypto.randomUUID(),
    branchId: null,
    actorUserId,
    action: 'FORMALIZATION_MODE',
    entityType: 'tenant',
    entityId: tenantId,
    payloadJson: JSON.stringify({ from: fromMode, to: result.formalizationMode }),
    prevHash: prev,
    rowHash: await sha256Hex(
      JSON.stringify({
        action: 'FORMALIZATION_MODE',
        entity_id: tenantId,
        prev,
      }),
    ),
  }));
  return null;
}

// eslint-disable-next-line complexity -- formalization: stage FSM × plan × role
export async function runFormalizationStageHttp(
  env: WorkerEnv,
  tenantId: string,
  raw: unknown,
  actorUserId = 'system',
  actorRole = '',
): Promise<{ status: number; body: Record<string, unknown> }> {
  // S52-H1: cambiar el modo fiscal del tenant es admin/owner — jamás cashier
  // (un cajero podría bajar a INTERNAL_CONTROL y evadir la emisión electrónica).
  if (actorRole && actorRole !== 'owner' && actorRole !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (!isMode(o.from) || !isMode(o.to) || typeof o.confirmed !== 'boolean') {
    return { status: 422, body: { error: 'Cambio de etapa invalido', code: 'INVALID_STAGE' } };
  }
  // S52-H1: el `from` es el modo ACTUAL de la DB, nunca el declarado por el
  // cliente (el gate de la máquina de estados no se salta ni se retrocede).
  const currentMode = await env.DB.prepare(
    `SELECT formalization_mode FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ formalization_mode: string }>();
  const actualFrom = currentMode?.formalization_mode ?? null;
  if (!actualFrom) {
    return { status: 404, body: { error: 'Tenant not found', code: 'TENANT_NOT_FOUND' } };
  }
  if (actualFrom !== o.from) {
    return { status: 422, body: { error: 'Stage mismatch', code: 'STAGE_MISMATCH' } };
  }
  let result: ReturnType<typeof changeFormalizationStage>;
  try {
    result = changeFormalizationStage(o.from, o.to, { confirmed: o.confirmed });
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'stage rejected',
        code: 'STAGE_REJECTED',
      },
    };
  }
  const persistenceError = await persistFormalizationStage(
    env,
    tenantId,
    actorUserId,
    String(o.from),
    result,
  );
  if (persistenceError) return persistenceError;
  return { status: 200, body: { ...result } };
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sprint 52 — onboarding.tour (Arquitectura §5.3 regla 37a, GTM §6.2).
 *
 * - GET /api/onboarding/setup-progress: estado server del Setup Checklist del
 *   "segundo día" (logo, facturación, catálogo, equipo) computado en D1; el
 *   paso impresora es local del navegador (preflight PrinterTransport, S25).
 * - POST /api/growth/events: instrumentación de la métrica del tour y del
 *   checklist (GTM §6.2 — Staff Growth). El catálogo de eventos está cerrado
 *   en la DB (CHECK, migración 0044) y se valida también acá.
 *
 * Gating: flag default-off → 404. El tenant viene del JWT.
 */

export interface OnboardingEnv {
  readonly FEATURE_ONBOARDING_TOUR?: string;
  readonly DB?: unknown;
}

export function isOnboardingTourEnabled(env: OnboardingEnv | undefined): boolean {
  return env?.FEATURE_ONBOARDING_TOUR === '1';
}

/** Catálogo cerrado de growth events (espejo del CHECK de la migración 0044). */
export const GROWTH_EVENT_TYPES = [
  'onboarding_started',
  'first_sale',
  'formalization_upgrade',
  'trial_to_paid',
  'plan_upgrade',
  'referral_credited',
  'tour_started',
  'tour_completed',
  'tour_dismissed',
  'setup_checklist_step_completed',
  'setup_checklist_completed',
] as const;

export type GrowthEventType = (typeof GROWTH_EVENT_TYPES)[number];

interface SetupRow {
  logo_url: string | null;
  formalization_mode: string;
  has_catalog: number;
  team_size: number;
}

export interface SetupDb {
  prepare(sql: string): {
    bind(...params: unknown[]): { first<T>(): Promise<T | null> };
  };
}

async function loadSetupRow(db: SetupDb, tenantId: string): Promise<SetupRow> {
  const row = await db
    .prepare(
      `SELECT t.logo_url,
              t.formalization_mode,
              CASE WHEN EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = t.id) THEN 1 ELSE 0 END AS has_catalog,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS team_size
       FROM tenants t WHERE t.id = ? LIMIT 1`,
    )
    .bind(tenantId)
    .first<SetupRow>();
  if (!row) {
    throw new Error('TENANT_NOT_FOUND');
  }
  return row;
}

export async function runSetupProgressHttp(
  env: OnboardingEnv,
  actor: QuickAddActor,
): Promise<HttpResult> {
  if (!isOnboardingTourEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'ONBOARDING_DB_UNAVAILABLE' } };
  let row: SetupRow;
  try {
    row = await loadSetupRow(env.DB as SetupDb, actor.tenantId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 404, body: { code: msg } };
  }
  const server: SetupServerState = {
    logo: (row.logo_url ?? '') !== '',
    invoicing: row.formalization_mode !== 'INTERNAL_CONTROL',
    team: row.team_size > 1,
    catalog: row.has_catalog === 1,
  };
  // El paso impresora es local: el cliente decide con el preflight y rehace el
  // cálculo con computeSetupProgress(server, printerReady).
  return {
    status: 200,
    body: {
      server,
      formalizationMode: row.formalization_mode,
      // Progreso asumiendo impresora pendiente (referencia; el cliente recalcula).
      progress: computeSetupProgress(server, false),
    },
  };
}

export async function runGrowthEventHttp(
  env: OnboardingEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isOnboardingTourEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'ONBOARDING_DB_UNAVAILABLE' } };
  const eventType = typeof body.eventType === 'string' ? body.eventType : '';
  if (!GROWTH_EVENT_TYPES.includes(eventType as GrowthEventType)) {
    return {
      status: 422,
      body: { code: 'UNKNOWN_GROWTH_EVENT', error: 'eventType fuera del catálogo' },
    };
  }
  const meta = body.meta === undefined ? null : body.meta;
  if (meta !== null && (typeof meta !== 'object' || Array.isArray(meta))) {
    return { status: 422, body: { code: 'INVALID_META' } };
  }
  const db = env.DB as unknown as {
    prepare(sql: string): {
      bind(...params: unknown[]): { run(): Promise<{ meta?: { changes?: number } }> };
    };
  };
  await db
    .prepare(
      `INSERT INTO growth_events (id, tenant_id, event_type, occurred_at, meta_json)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.tenantId,
      eventType,
      meta === null ? null : JSON.stringify(meta),
    )
    .run();
  return { status: 201, body: { ok: true, eventType } };
}

export async function runListGrowthEventsHttp(
  env: OnboardingEnv,
  tenantId: string,
): Promise<HttpResult> {
  if (!tenantId) return { status: 401, body: { code: 'UNAUTHORIZED' } };
  if (!env.DB) return { status: 503, body: { code: 'ONBOARDING_DB_UNAVAILABLE' } };
  const db = env.DB as unknown as {
    prepare(sql: string): {
      bind(...params: unknown[]): {
        all<T>(): Promise<{ results?: T[] }>;
      };
    };
  };
  const rows = await db
    .prepare(
      `SELECT tenant_id AS tenantId, event_type AS eventType, occurred_at AS occurredAtIso, meta_json AS metaJson
       FROM growth_events WHERE tenant_id = ? ORDER BY occurred_at ASC`,
    )
    .bind(tenantId)
    .all<{
      tenantId: string;
      eventType: string;
      occurredAtIso: string;
      metaJson: string | null;
    }>();
  const events = (rows.results ?? []).map((row) => {
    let meta: Record<string, unknown> | undefined;
    if (row.metaJson) {
      try {
        const parsed: unknown = JSON.parse(row.metaJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>;
        }
      } catch {
        meta = undefined;
      }
    }
    return {
      tenantId: row.tenantId,
      eventType: row.eventType,
      occurredAtIso: row.occurredAtIso,
      ...(meta ? { meta } : {}),
    };
  });
  return { status: 200, body: { events } };
}
