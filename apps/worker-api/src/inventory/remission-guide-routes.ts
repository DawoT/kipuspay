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

export async function runRemissionGuideHttp(
  env: GreEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isGreEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'GRE_DB_UNAVAILABLE' } };
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
