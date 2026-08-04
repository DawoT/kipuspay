/**
 * Chaos Sprint 4 — escritores concurrentes + reintento duplicado (§13.5).
 * El harness orquesta; la evidencia D1 real vive en adapters-d1 integration.
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface ConcurrentSaleAttempt {
  readonly ok: boolean;
  readonly offlineSaleId: string;
}

export interface ConcurrentWritersResult {
  readonly attempts: readonly ConcurrentSaleAttempt[];
  readonly finalStock: number;
  readonly saleCount: number;
}

export interface DuplicateRetryResult {
  readonly firstStatus: string;
  readonly secondStatus: string;
  readonly saleCount: number;
}

/**
 * Verifica coherencia: stock final = inicial - exitos; saleCount = exitos;
 * nunca stock negativo si allow_negative=false.
 */
export function judgeConcurrentWriters(
  initialStock: number,
  qtyEach: number,
  result: ConcurrentWritersResult,
): ChaosVerdict {
  const successes = result.attempts.filter((a) => a.ok).length;
  if (result.saleCount !== successes) return 'FAIL';
  if (result.finalStock !== initialStock - successes * qtyEach) return 'FAIL';
  if (result.finalStock < 0) return 'FAIL';
  if (successes > Math.floor(initialStock / qtyEach)) return 'FAIL';
  return 'PASS';
}

export function judgeDuplicateRetry(result: DuplicateRetryResult): ChaosVerdict {
  if (result.firstStatus !== 'SUCCESS') return 'FAIL';
  if (result.secondStatus !== 'ALREADY_SYNCED') return 'FAIL';
  if (result.saleCount !== 1) return 'FAIL';
  return 'PASS';
}

export async function runConcurrentWritersChaos(
  execute: () => Promise<ConcurrentWritersResult>,
  initialStock: number,
  qtyEach: number,
): Promise<ChaosVerdict> {
  const result = await execute();
  return judgeConcurrentWriters(initialStock, qtyEach, result);
}

export async function runDuplicateRetryChaos(
  execute: () => Promise<DuplicateRetryResult>,
): Promise<ChaosVerdict> {
  const result = await execute();
  return judgeDuplicateRetry(result);
}
