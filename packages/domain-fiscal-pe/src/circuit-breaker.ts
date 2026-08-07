/**
 * Circuit breaker FSM puro — Arquitectura §8.1 / ADR-FISCAL-002.
 * DO solo persiste este estado; lectura hot-path nunca toca el DO.
 */

export type BreakerState = 'closed' | 'open' | 'half-open';

export type FiscalEndpoint = 'submit' | 'cdr_query' | 'rc_submit';

export interface BreakerSnapshot {
  readonly state: BreakerState;
  readonly failureCount: number;
  readonly openedAtMs: number | null;
  readonly halfOpenProbePending: boolean;
}

export const BREAKER_FAILURE_THRESHOLD = 10;
export const BREAKER_OPEN_MS = 2 * 60 * 60 * 1000; // ~2h
export const BREAKER_COALESCE_WINDOW_MS = 5_000;
export const BREAKER_ISOLATE_TTL_MS = 8_000;
export const BREAKER_KV_TTL_SECONDS = 60;

export function initialBreakerSnapshot(): BreakerSnapshot {
  return {
    state: 'closed',
    failureCount: 0,
    openedAtMs: null,
    halfOpenProbePending: false,
  };
}

export function applyInfraFailures(
  snap: BreakerSnapshot,
  count: number,
  nowMs: number,
): BreakerSnapshot {
  if (count <= 0) return snap;
  if (snap.state === 'open') return snap;
  const failureCount = snap.failureCount + count;
  if (failureCount >= BREAKER_FAILURE_THRESHOLD) {
    return {
      state: 'open',
      failureCount,
      openedAtMs: nowMs,
      halfOpenProbePending: false,
    };
  }
  return { ...snap, failureCount, openedAtMs: null, halfOpenProbePending: false };
}

/** BUSINESS 4xx nunca muta el breaker. */
export function applyBusinessFailure(snap: BreakerSnapshot): BreakerSnapshot {
  return snap;
}

export function transitionToHalfOpen(snap: BreakerSnapshot, nowMs: number): BreakerSnapshot {
  if (snap.state !== 'open' || snap.openedAtMs === null) return snap;
  if (nowMs < snap.openedAtMs + BREAKER_OPEN_MS) return snap;
  return {
    state: 'half-open',
    failureCount: snap.failureCount,
    openedAtMs: snap.openedAtMs,
    halfOpenProbePending: true,
  };
}

export function applyProbeSuccess(snap: BreakerSnapshot): BreakerSnapshot {
  if (snap.state !== 'half-open') return snap;
  return initialBreakerSnapshot();
}

export function applyProbeFailure(snap: BreakerSnapshot, nowMs: number): BreakerSnapshot {
  if (snap.state !== 'half-open') return snap;
  return {
    state: 'open',
    failureCount: snap.failureCount + 1,
    openedAtMs: nowMs,
    halfOpenProbePending: false,
  };
}

export function isBreakerOpen(snap: BreakerSnapshot): boolean {
  return snap.state === 'open' || (snap.state === 'half-open' && !snap.halfOpenProbePending);
}

export function breakerKvKey(transport: string, endpoint: FiscalEndpoint): string {
  return `fiscal_breaker:${transport}:${endpoint}`;
}

export function breakerDoName(transport: string, endpoint: FiscalEndpoint): string {
  return `${transport}:${endpoint}`;
}
