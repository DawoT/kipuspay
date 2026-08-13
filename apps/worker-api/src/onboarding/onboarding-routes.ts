import type { WorkerEnv } from '../auth/control-plane.js';
import {
  bootstrapTenant,
  changeFormalizationStage,
  type TenantBootstrapInput,
  type VerticalType,
} from './onboarding-bootstrap.js';
import type { FormalizationMode } from '@kipuspay/domain-fiscal-pe';
import { computeSetupProgress, type SetupServerState } from '@kipuspay/domain-onboarding';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

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

export function runBootstrapHttp(
  _env: WorkerEnv,
  raw: unknown,
): { status: number; body: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.tradeName !== 'string' ||
    !isVertical(o.verticalType) ||
    !isMode(o.formalizationMode)
  ) {
    return {
      status: 422,
      body: { error: 'Campos de onboarding invalidos', code: 'INVALID_ONBOARDING' },
    };
  }
  const input: TenantBootstrapInput = {
    tradeName: o.tradeName,
    verticalType: o.verticalType,
    formalizationMode: o.formalizationMode,
    ruc: typeof o.ruc === 'string' && o.ruc.length > 0 ? o.ruc : null,
  };
  try {
    const tenantId =
      typeof o.tenantId === 'string' && o.tenantId.length > 0
        ? o.tenantId
        : `t_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const result = bootstrapTenant(input, tenantId);
    return { status: 201, body: { ...result } };
  } catch (err) {
    return {
      status: 422,
      body: {
        error: err instanceof Error ? err.message : 'bootstrap failed',
        code: 'BOOTSTRAP_REJECTED',
      },
    };
  }
}

/**
 * S11-H2: cambio de etapa de formalización PERSISTENTE.
 * Valida el gate del dominio (sin saltos/retrocesos) y actualiza
 * `tenants.formalization_mode` + `enabled_document_types` en D1.
 */
export async function runFormalizationStageHttp(
  env: WorkerEnv,
  tenantId: string,
  raw: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  if (!isMode(o.from) || !isMode(o.to) || typeof o.confirmed !== 'boolean') {
    return { status: 422, body: { error: 'Cambio de etapa invalido', code: 'INVALID_STAGE' } };
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
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  // Persiste en el tenant (y sus docs habilitados derivados de la etapa).
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
  return { status: 200, body: { ...result } };
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
