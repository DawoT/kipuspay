/**
 * Chaos ar-compensate — 500 ciclos total+parcial, 0 drift saldo vs asientos (§13.5 / Sprint 8).
 */

import { compensateArOnCreditNote } from '@kipuspay/domain-cash';

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface ArCompensateCycleResult {
  readonly originalCents: number;
  readonly appliedSumCents: number;
  readonly finalBalanceCents: number;
  readonly paymentCount: number;
  readonly drift: number;
}

export interface ArCompensateChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly ArCompensateCycleResult[];
}

export function judgeArCompensate(result: ArCompensateChaosResult): ChaosVerdict {
  if (result.cycles < 500) return 'FAIL';
  if (result.discrepancies !== 0) return 'FAIL';
  return 'PASS';
}

/** Simula un CxC y aplica créditos parciales/totales; drift = original - applied - balance. */
export function simulateArCompensateCycle(seed: number): ArCompensateCycleResult {
  const originalCents = 1000 + (seed % 50_000);
  let balance = originalCents;
  let appliedSum = 0;
  let paymentCount = 0;
  // Alterna parcial (40%) y cierre (resto) en pasos.
  const steps = seed % 2 === 0 ? [Math.floor(originalCents * 0.4), originalCents] : [originalCents];
  for (const credit of steps) {
    if (balance <= 0) break;
    const plan = compensateArOnCreditNote({
      accountsReceivableId: `ar-${seed}`,
      originSaleId: `sale-${seed}`,
      currentBalanceCents: balance,
      creditAmountCents: credit,
      paymentId: `pay-${seed}-${paymentCount}`,
      collectedByUserId: 'chaos',
      source: seed % 3 === 0 ? 'NV_RETURN' : 'CREDIT_NOTE',
    });
    appliedSum += plan.appliedCents;
    balance = plan.nextBalanceCents;
    paymentCount += 1;
  }
  const drift = originalCents - appliedSum - balance;
  return {
    originalCents,
    appliedSumCents: appliedSum,
    finalBalanceCents: balance,
    paymentCount,
    drift,
  };
}

export function runArCompensateCycles(cycles = 500): ArCompensateChaosResult {
  const samples: ArCompensateCycleResult[] = [];
  let discrepancies = 0;
  for (let i = 0; i < cycles; i += 1) {
    const sample = simulateArCompensateCycle(i + 1);
    if (sample.drift !== 0 || sample.finalBalanceCents < 0) discrepancies += 1;
    if (i < 5 || sample.drift !== 0) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runArCompensateChaos(
  execute?: () => Promise<ArCompensateChaosResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    throw new Error(
      'Escenario ar-compensate exige execute (evidencia ciclos); fail-closed sin fixtures',
    );
  }
  const result = await execute();
  return judgeArCompensate(result);
}
