/**
 * Importación de catálogo Sprint 21 (FASE 7 §5.4 regla 1) — Bsale/Alegra/CSV.
 * Dos fases: preview (dry-run, no escribe) → commit (solo lo aprobado, idempotente).
 * Flag default off → 404 FEATURE_OFF.
 */
import {
  MAX_IMPORT_ROWS,
  type CatalogImportRow,
  type CatalogImportSource,
} from '@kipuspay/domain-integrations';
import { CatalogImporter } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

const CATALOG_SOURCES: readonly CatalogImportSource[] = ['bsale', 'alegra', 'csv'];

export function isCatalogImportEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_CATALOG_IMPORT === '1' || env?.FEATURE_CATALOG_IMPORT === 'true';
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function badRequest(reason: string): HttpResult {
  return { status: 400, body: { error: reason, code: 'BAD_REQUEST' } };
}

function resolveSource(value: unknown): CatalogImportSource | null {
  return typeof value === 'string' && (CATALOG_SOURCES as readonly string[]).includes(value)
    ? (value as CatalogImportSource)
    : null;
}

/** S21-H2: el import de catálogo modifica el catálogo maestro — solo
 * admin/owner (nunca cajero/vendedor por omisión). */
function isAdminRole(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function runCatalogImportHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
  userRole?: string,
): Promise<HttpResult> {
  return importCatalog(env, tenantId, body, resolveSource(body.source), userRole);
}

async function importCatalog(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: Record<string, unknown>,
  source: CatalogImportSource | null,
  userRole?: string,
): Promise<HttpResult> {
  if (!isCatalogImportEnabled(env)) return featureOff('FEATURE_CATALOG_IMPORT');
  if (!userRole || !isAdminRole(userRole)) {
    return { status: 403, body: { error: 'admin role required', code: 'FORBIDDEN_ADMIN' } };
  }
  if (!env?.DB) return dbUnavailable();
  if (!source) return badRequest('source debe ser bsale, alegra o csv');
  if (!Array.isArray(body.rows)) return badRequest('rows requerido');
  if (body.mode !== 'preview' && body.mode !== 'commit') {
    return badRequest('mode debe ser preview o commit');
  }
  const rows = body.rows as readonly CatalogImportRow[];
  if (rows.length > MAX_IMPORT_ROWS) {
    return badRequest(`lote excede el límite de ${MAX_IMPORT_ROWS} filas`);
  }
  const importer = new CatalogImporter(env.DB);

  if (body.mode === 'preview') {
    const plan = await importer.preview({ source, tenantId, rows });
    return {
      status: 200,
      body: {
        dryRun: true,
        created: plan.actions.filter((a) => a.kind === 'create').length,
        skipped: plan.actions.filter((a) => a.kind === 'skip-duplicate').length,
        conflicts: plan.conflicts,
      },
    };
  }

  // Commit tras preview (regla 1): el servidor re-planifica y rechaza si hay conflictos.
  const plan = await importer.preview({ source, tenantId, rows });
  if (plan.conflicts.length > 0) {
    return {
      status: 422,
      body: {
        error: 'El import tiene conflictos; corrija y rehaga el preview',
        code: 'IMPORT_CONFLICTS',
        conflicts: plan.conflicts,
      },
    };
  }
  const result = await importer.commit(plan);
  return { status: 200, body: { dryRun: false, ...result } };
}
