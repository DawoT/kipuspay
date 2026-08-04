/**
 * Chaos network-adversarial — 0 pérdida / 0 duplicación tras N ciclos (SYN-07 / §13.5).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface NetworkAdversarialCycle {
  readonly enqueued: number;
  readonly succeeded: number;
  readonly failedThenRetriedOk: number;
  readonly duplicateAcks: number;
  readonly lost: number;
}

export interface NetworkAdversarialResult {
  readonly cycles: number;
  readonly totalEnqueued: number;
  readonly totalSucceeded: number;
  readonly totalLost: number;
  readonly totalDuplicates: number;
}

export function judgeNetworkAdversarial(result: NetworkAdversarialResult): ChaosVerdict {
  if (result.cycles <= 0) return 'FAIL';
  if (result.totalLost > 0) return 'FAIL';
  if (result.totalDuplicates > 0) return 'FAIL';
  if (result.totalSucceeded !== result.totalEnqueued) return 'FAIL';
  return 'PASS';
}

export async function runNetworkAdversarialChaos(
  execute: (cycles: number) => Promise<NetworkAdversarialResult>,
  cycles: number = 500,
): Promise<ChaosVerdict> {
  if (!execute) {
    throw new Error(
      'Escenario network-adversarial exige execute (evidencia sync); fail-closed sin fixtures',
    );
  }
  const result = await execute(cycles);
  return judgeNetworkAdversarial(result);
}
