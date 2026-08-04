/**
 * Plazos fiscales + alertas T-24h / T-6h / DEADLINE_EXCEEDED (Arquitectura §5.2).
 * Puro: reloj inyectable (nowMs).
 */

/** Mirror of FACTURA_SUBMIT_DAYS / BOLETA_RC_SUBMIT_DAYS (avoid circular import). */
const FACTURA_SUBMIT_DAYS = 3;
const BOLETA_RC_SUBMIT_DAYS = 7;

export const ALERT_T24_MS = 24 * 3600 * 1000;
export const ALERT_T6_MS = 6 * 3600 * 1000;

export type DeadlineAlertKind = 'T24H' | 'T6H' | 'DEADLINE_EXCEEDED';

export interface DeadlineCandidate {
  readonly id: string;
  readonly documentType: string;
  readonly sunatStatus: string;
  readonly mustSubmitByMs: number;
  readonly alertT24Sent: boolean;
  readonly alertT6Sent: boolean;
}

export interface DeadlineAction {
  readonly id: string;
  readonly alert: DeadlineAlertKind;
  readonly suggestCreditNoteEa: boolean;
}

/** Evalúa un CPE/RC pendiente respecto al reloj. */
export function evaluateDeadline(
  candidate: DeadlineCandidate,
  nowMs: number,
): DeadlineAction | null {
  if (candidate.sunatStatus !== 'PENDING' && candidate.sunatStatus !== 'PROCESSING') {
    return null;
  }
  const remaining = candidate.mustSubmitByMs - nowMs;
  if (remaining <= 0) {
    return {
      id: candidate.id,
      alert: 'DEADLINE_EXCEEDED',
      suggestCreditNoteEa: true,
    };
  }
  if (remaining <= ALERT_T6_MS && !candidate.alertT6Sent) {
    return { id: candidate.id, alert: 'T6H', suggestCreditNoteEa: false };
  }
  if (remaining <= ALERT_T24_MS && !candidate.alertT24Sent) {
    return { id: candidate.id, alert: 'T24H', suggestCreditNoteEa: false };
  }
  return null;
}

export function evaluateDeadlineBatch(
  candidates: readonly DeadlineCandidate[],
  nowMs: number,
): DeadlineAction[] {
  const out: DeadlineAction[] = [];
  for (const c of candidates) {
    const action = evaluateDeadline(c, nowMs);
    if (action) out.push(action);
  }
  return out;
}

/** Fin de día Lima (UTC-5) + N días calendario para boleta/RC. */
export function boletaMustSubmitByEndOfLimaDay(issuedAtMs: number): number {
  const limaOffsetMs = 5 * 3600 * 1000;
  const limaMs = issuedAtMs - limaOffsetMs;
  const d = new Date(limaMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // end of emission day Lima + (BOLETA_RC_SUBMIT_DAYS - 1) more calendar days → +7d window from day 0
  const endEmissionLima = Date.UTC(y, m, day, 23, 59, 59, 999);
  const deadlineLima = endEmissionLima + (BOLETA_RC_SUBMIT_DAYS - 1) * 24 * 3600 * 1000;
  return deadlineLima + limaOffsetMs;
}

export function facturaMustSubmitBy(issuedAtMs: number): number {
  return issuedAtMs + FACTURA_SUBMIT_DAYS * 24 * 3600 * 1000;
}

export function summaryDateLima(issuedAtMs: number): string {
  const lima = new Date(issuedAtMs - 5 * 3600 * 1000);
  const y = lima.getUTCFullYear();
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lima.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
