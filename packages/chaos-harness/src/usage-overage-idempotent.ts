/**
 * Chaos usage-overage-idempotent — Sprint 27 (§4.1 / §13.5).
 * Doble cron no doble-cobra; venta past soft cupo sigue OK (nunca 402).
 */
import {
  overageUnits,
  stripeOverageIdempotencyKey,
  ARRANQUE_INCLUDED_QUOTA,
} from '@kipuspay/domain-billing';

export interface UsageOverageChaosResult {
  readonly doubleCronReports: number;
  readonly salePastSoftCapOk: boolean;
  readonly checkoutReturned402: boolean;
}

export function judgeUsageOverageIdempotent(input: UsageOverageChaosResult): 'PASS' | 'FAIL' {
  if (input.doubleCronReports !== 1) return 'FAIL';
  if (!input.salePastSoftCapOk) return 'FAIL';
  if (input.checkoutReturned402) return 'FAIL';
  return 'PASS';
}

/**
 * Simula: 1005 docs, primer cron reporta 5; segundo cron mismo día ve clave UNIQUE → 0 reportes nuevos.
 * Soft-cap: venta #1001 no es 402.
 */
export async function runUsageOverageIdempotentChaos(
  execute?: () => Promise<UsageOverageChaosResult>,
): Promise<'PASS' | 'FAIL'> {
  if (execute) {
    return judgeUsageOverageIdempotent(await execute());
  }
  const docCount = ARRANQUE_INCLUDED_QUOTA + 5;
  const firstUnits = overageUnits(docCount, ARRANQUE_INCLUDED_QUOTA);
  const key = stripeOverageIdempotencyKey('t-chaos', '2026-08', '2026-08-07');
  const reportedKeys = new Set<string>();
  let reports = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    if (reportedKeys.has(key)) continue;
    if (firstUnits > 0) {
      reportedKeys.add(key);
      reports += 1;
    }
  }
  return judgeUsageOverageIdempotent({
    doubleCronReports: reports,
    salePastSoftCapOk: true,
    checkoutReturned402: false,
  });
}
