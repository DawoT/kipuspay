/**
 * Gating de plan Cadena (Sprint 46, Arquitectura §5.3 regla 31 / ADR-0030).
 * 403 PLAN_REQUIRES_CADENA semántico para features Cadena+, distinto del 402
 * del Plan Guard (auth-decide) que cubre trial expirado / suscripción inactiva.
 */
export interface HttpResult {
  status: number;
  body: Record<string, unknown> | string;
  contentType?: string;
}

export const CADENA_PLUS: ReadonlySet<string> = new Set(['cadena', 'enterprise']);

export function isCadenaPlusPlan(planId: string | null | undefined): boolean {
  return typeof planId === 'string' && CADENA_PLUS.has(planId);
}

/** Probe estructural: solo necesita leer el plan del tenant (insights usa un env propio). */
export interface PlanProbe {
  readonly DB?: {
    prepare(sql: string): { bind(...params: unknown[]): { first<T>(): Promise<T | null> } };
  };
}

/**
 * Verifica que el tenant tenga plan Cadena+. Devuelve HttpResult 403 si no;
 * null si el plan es válido. Fail-closed: plan desconocido ⇒ no autorizado.
 */
export async function assertCadenaPlusPlan(
  env: PlanProbe,
  tenantId: string,
): Promise<HttpResult | null> {
  const row = await env
    .DB!.prepare(`SELECT plan_id FROM tenants WHERE id = ? LIMIT 1`)
    .bind(tenantId)
    .first<{ plan_id: string }>();
  if (!row || !isCadenaPlusPlan(row.plan_id)) {
    return {
      status: 403,
      body: { error: 'Requires Cadena plan', code: 'PLAN_REQUIRES_CADENA' },
    };
  }
  return null;
}
