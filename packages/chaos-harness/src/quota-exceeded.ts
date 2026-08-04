/**
 * Chaos quota-exceeded — 0 corrupción; alerta ≥80%; bloqueo al 100% (§13.5).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface QuotaExceededResult {
  readonly alertFiredAtOrAbove80: boolean;
  readonly blockedAt100: boolean;
  readonly queueCorrupted: boolean;
  readonly enqueueRejectedSafely: boolean;
}

export function judgeQuotaExceeded(result: QuotaExceededResult): ChaosVerdict {
  if (result.queueCorrupted) return 'FAIL';
  if (!result.alertFiredAtOrAbove80) return 'FAIL';
  if (!result.blockedAt100) return 'FAIL';
  if (!result.enqueueRejectedSafely) return 'FAIL';
  return 'PASS';
}

export async function runQuotaExceededChaos(
  execute: () => Promise<QuotaExceededResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    throw new Error(
      'Escenario quota-exceeded exige execute (evidencia IDB); fail-closed sin fixtures',
    );
  }
  const result = await execute();
  return judgeQuotaExceeded(result);
}
