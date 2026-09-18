/**
 * Backlog v10 P1b — GRE `31` (Arquitectura §5.2b, ADR-FISCAL-004).
 *
 * - POST /api/inventory/remission-guides: emite una guía de remisión con
 *   correlativo serie T server-side, audit REMISSION_GUIDE y 0 impacto en
 *   stock. Gating: FEATURE_GRE default-off → 404.
 */
import { processRemissionGuideAtomic } from '@kipuspay/adapters-d1';
import type { RemissionGuideRequest } from '@kipuspay/domain-fiscal-pe';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';
import { CapabilityError, CapabilityResolver } from '../capabilities/capability-resolver.js';

export interface GreEnv {
  readonly FEATURE_GRE?: string;
  readonly DB?: unknown;
}

function parseRemissionBody(
  body: Record<string, unknown>,
): { ok: true; branchId: string; request: RemissionGuideRequest } | { ok: false } {
  const branchId = typeof body.branchId === 'string' ? body.branchId.trim() : '';
  const request = body as Partial<RemissionGuideRequest>;
  if (
    !branchId ||
    !request.series ||
    !request.transferReasonCode ||
    !request.transportModeCode ||
    !request.carrier ||
    !request.origin ||
    !request.destination ||
    !request.transferStartedAt ||
    !Array.isArray(request.items) ||
    request.items.length === 0
  ) {
    return { ok: false };
  }
  return { ok: true, branchId, request: request as RemissionGuideRequest };
}

export function isGreEnabled(env: GreEnv | undefined): boolean {
  return env?.FEATURE_GRE === '1';
}

async function requireGre(env: GreEnv, tenantId: string): Promise<HttpResult | null> {
  try {
    await new CapabilityResolver(env as never).require(tenantId, 'fiscal.gre');
    return null;
  } catch (error) {
    if (error instanceof CapabilityError) {
      return {
        status: error.status,
        body: { code: error.status === 404 ? 'FEATURE_OFF' : error.code },
      };
    }
    return { status: 503, body: { code: 'CAPABILITIES_UNAVAILABLE' } };
  }
}

export async function runRemissionGuideHttp(
  env: GreEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!env.DB) return { status: 503, body: { code: 'GRE_DB_UNAVAILABLE' } };
  const capabilityError = await requireGre(env, actor.tenantId);
  if (capabilityError) return capabilityError;
  const parsed = parseRemissionBody(body);
  if (!parsed.ok) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'GRE fields incomplete' } };
  }
  const { branchId, request } = parsed;
  try {
    const result = await processRemissionGuideAtomic(
      env.DB as never,
      actor.tenantId,
      branchId,
      actor.userId,
      request,
    );
    return { status: 201, body: { ...result } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { code: msg, error: msg } };
  }
}
