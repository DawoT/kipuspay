/**
 * Taxonomía de errores fiscales §8.1 — INFRA abre breaker; BUSINESS → quarantine.
 */

export type FiscalErrorClass = 'INFRA' | 'BUSINESS' | 'DEADLINE' | 'OK';

export interface FiscalHttpSignal {
  readonly httpStatus: number;
  readonly timedOut?: boolean;
  readonly networkError?: boolean;
  readonly deadlineExceeded?: boolean;
  readonly cdrAccepted?: boolean;
}

export function classifyFiscalError(signal: FiscalHttpSignal): FiscalErrorClass {
  if (signal.deadlineExceeded) return 'DEADLINE';
  if (signal.timedOut || signal.networkError) return 'INFRA';
  if (signal.httpStatus >= 500 || signal.httpStatus === 0) return 'INFRA';
  if (signal.httpStatus >= 400 && signal.httpStatus < 500) return 'BUSINESS';
  if (signal.httpStatus === 200) {
    if (signal.cdrAccepted === false) return 'BUSINESS';
    return 'OK';
  }
  return 'INFRA';
}

export function shouldOpenBreaker(errorClass: FiscalErrorClass): boolean {
  return errorClass === 'INFRA';
}

export function shouldQuarantine(errorClass: FiscalErrorClass): boolean {
  return errorClass === 'BUSINESS';
}
