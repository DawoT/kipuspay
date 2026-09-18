/**
 * Sprint 47 — LPDP (Arquitectura §5.3 regla 32a / ADR-0031).
 * Inventario PII, consentimiento por propósito, export (derecho de acceso) y
 * erase/anonimización del titular. Tenant siempre del JWT (LPDP-04); jamás del
 * payload. Fail-closed: flag apagado ⇒ 404 FEATURE_OFF; cliente anonimizado ⇒
 * sin PII jamás.
 */
import {
  eraseCustomer,
  exportCustomer,
  listConsents,
  listCustomers,
  writeConsent,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import type { HttpResult } from '../auth/plan-cadena.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface LpdpActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly branchId?: string;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'supervisor']);

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

function forbidden(): HttpResult {
  return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
}

function mapErr(e: unknown): HttpResult {
  const msg = e instanceof Error ? e.message : String(e);
  const safe = new Set([
    'CUSTOMER_NOT_FOUND',
    'CUSTOMER_ERASED',
    'ALREADY_ERASED',
    'UNKNOWN_CONSENT_PURPOSE',
  ]);
  // Errores inesperados pueden contener SQL o PII. Solo los códigos de
  // dominio allowlisted son seguros para devolver al cliente.
  if (!safe.has(msg))
    return { status: 500, body: { error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' } };
  return { status: 404, body: { error: msg, code: msg } };
}

function actorOk(actor: LpdpActor | undefined, requireAdmin: boolean): boolean {
  if (!actor?.tenantId || !actor.userId) return false;
  if (requireAdmin) return ADMIN_ROLES.has(actor.role.toLowerCase());
  return true;
}

async function requireLpdp(env: WorkerEnv, tenantId: string): Promise<HttpResult | null> {
  try {
    await new CapabilityResolver(env).require(tenantId, 'compliance.lpdp');
    return null;
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status === 404 ? 404 : 503,
        body: { code: error.status === 404 ? 'FEATURE_OFF' : 'CAPABILITY_UNAVAILABLE' },
      };
    }
    return { status: 503, body: { code: 'CAPABILITY_UNAVAILABLE' } };
  }
}

/** GET /api/customers — inventario PII del tenant (LPDP-04). */
export async function runListCustomersHttp(
  env: WorkerEnv | undefined,
  actor: LpdpActor | undefined,
  limitRaw: string | null | undefined,
  offsetRaw: string | null | undefined,
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  if (!actorOk(actor, false)) return forbidden();
  const capabilityError = await requireLpdp(env, actor!.tenantId);
  if (capabilityError) return capabilityError;
  const limit = Number.isInteger(Number(limitRaw))
    ? Math.min(Math.max(Number(limitRaw), 1), 200)
    : 100;
  const offset = Number.isInteger(Number(offsetRaw)) ? Math.max(Number(offsetRaw), 0) : 0;
  try {
    const items = await listCustomers(env.DB, actor!.tenantId, limit, offset);
    return { status: 200, body: { items, tenantId: actor!.tenantId } };
  } catch (e) {
    return mapErr(e);
  }
}

/** GET /api/customers/:id/consents — consentimientos del titular. */
export async function runListConsentsHttp(
  env: WorkerEnv | undefined,
  actor: LpdpActor | undefined,
  customerId: string,
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  if (!actorOk(actor, false)) return forbidden();
  const capabilityError = await requireLpdp(env, actor!.tenantId);
  if (capabilityError) return capabilityError;
  if (!customerId)
    return { status: 400, body: { error: 'customerId required', code: 'BAD_REQUEST' } };
  try {
    const consents = await listConsents(env.DB, actor!.tenantId, customerId);
    return { status: 200, body: { customerId, consents } };
  } catch (e) {
    return mapErr(e);
  }
}

/** POST /api/customers/:id/consent — registra/revoca un propósito. */
export async function runWriteConsentHttp(
  env: WorkerEnv | undefined,
  actor: LpdpActor | undefined,
  customerId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  if (!actorOk(actor, false)) return forbidden();
  const capabilityError = await requireLpdp(env, actor!.tenantId);
  if (capabilityError) return capabilityError;
  const purpose = typeof body.purpose === 'string' ? body.purpose : '';
  const granted = body.granted === true || body.granted === 1 || body.granted === '1';
  if (!customerId || !purpose) {
    return { status: 400, body: { error: 'customerId and purpose required', code: 'BAD_REQUEST' } };
  }
  try {
    const result = await writeConsent(
      env.DB,
      actor!.tenantId,
      customerId,
      purpose,
      granted,
      new Date().toISOString(),
    );
    return { status: 200, body: { customerId, purpose, ...result } };
  } catch (e) {
    return mapErr(e);
  }
}

/** GET /api/customers/:id/export — derecho de acceso del titular (LPDP-02). */
export async function runExportCustomerHttp(
  env: WorkerEnv | undefined,
  actor: LpdpActor | undefined,
  customerId: string,
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  // S47-H2: el export entrega PII COMPLETA (nombre, email, teléfono, DNI +
  // historial de ventas) — solo admin/owner (nunca cashier). El derecho LPDP
  // se ejerce con control de acceso.
  if (!actorOk(actor, true)) return forbidden();
  const capabilityError = await requireLpdp(env, actor!.tenantId);
  if (capabilityError) return capabilityError;
  if (!customerId)
    return { status: 400, body: { error: 'customerId required', code: 'BAD_REQUEST' } };
  try {
    const payload = await exportCustomer(env.DB, actor!.tenantId, customerId);
    return { status: 200, body: payload as unknown as Record<string, unknown> };
  } catch (e) {
    return mapErr(e);
  }
}

/** POST /api/customers/:id/erase — borrado/anonimización del titular (LPDP-03). Solo admin/owner/supervisor. */
export async function runEraseCustomerHttp(
  env: WorkerEnv | undefined,
  actor: LpdpActor | undefined,
  customerId: string,
): Promise<HttpResult> {
  if (!env?.DB) return dbUnavailable();
  if (!actorOk(actor, true)) return forbidden();
  const capabilityError = await requireLpdp(env, actor!.tenantId);
  if (capabilityError) return capabilityError;
  if (!customerId)
    return { status: 400, body: { error: 'customerId required', code: 'BAD_REQUEST' } };
  try {
    const result = await eraseCustomer(env.DB, {
      tenantId: actor!.tenantId,
      branchId: actor!.branchId ?? '',
      actorUserId: actor!.userId,
      customerId,
      nowIso: new Date().toISOString(),
    });
    return { status: 200, body: { ...result } };
  } catch (e) {
    return mapErr(e);
  }
}
