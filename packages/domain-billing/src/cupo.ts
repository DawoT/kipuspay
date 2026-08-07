/**
 * Cupo documental Arranque + sobregiro — Arquitectura §4.1 / Sprint 27.
 */

/** Documentos que consumen 1 unidad de cupo al emitir. */
const COUNTS_TOWARD_CUPO = new Set(['01', '03', '07', '08', '12', 'NV', 'NV_RETURN']);

/** Vehículos / cambios de estado que no suman ni restan. */
const NEVER_COUNTS = new Set(['RC', 'VOID', 'BAJA', 'RC_VEHICLE']);

export const ARRANQUE_INCLUDED_QUOTA = 1000;

export const OVERAGE_PEN_CENTS = 5; // S/ 0.05

export function countsTowardCupo(documentType: string): boolean {
  if (NEVER_COUNTS.has(documentType)) return false;
  return COUNTS_TOWARD_CUPO.has(documentType);
}

/** Idempotency key canónica: usage:{documentId} */
export function usageKey(documentId: string): string {
  return `usage:${documentId}`;
}

/**
 * Periodo facturable America/Lima como YYYY-MM.
 * Usa Intl con timeZone fijo (sin deps).
 */
export function periodYmLima(nowMs: number = Date.now()): string {
  // en-CA yields YYYY-MM-DD parts; America/Lima is the billing calendar (§4.1).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date(nowMs))
    .slice(0, 7);
}

/**
 * Unidades de sobregiro aún no reportadas a Stripe.
 * `overage_reported_thru` = último doc_count ya enviado (§4.1).
 */
export function overageUnits(
  docCount: number,
  overageReportedThru: number,
  planQuota: number = ARRANQUE_INCLUDED_QUOTA,
): number {
  const billableNow = Math.max(0, docCount - planQuota);
  const alreadyBilled = Math.max(0, overageReportedThru - planQuota);
  return Math.max(0, billableNow - alreadyBilled);
}

/** Idempotency Stripe Metered: tenant:period:day (UTC date of cron run, Lima day). */
export function stripeOverageIdempotencyKey(
  tenantId: string,
  periodYm: string,
  dayYmd: string,
): string {
  return `${tenantId}:${periodYm}:${dayYmd}`;
}

/** Día civil America/Lima YYYY-MM-DD para la clave diaria del cron. */
export function limaDayYmd(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

export function planQuotaForPlanId(planId: string): number {
  if (planId === 'arranque') return ARRANQUE_INCLUDED_QUOTA;
  // Crece/Cadena/Enterprise: cupo holgado — sin sobregiro en pitch (§4.1).
  return Number.MAX_SAFE_INTEGER;
}
