/**
 * Chaos low-end-device — 0 pérdida de cola bajo presión tipificada (§13.5 / Sprint 7).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface LowEndDeviceResult {
  readonly enqueueAttempts: number;
  readonly survivingPending: number;
  readonly lost: number;
  readonly feedbackP95Ms: number;
}

export function judgeLowEndDevice(result: LowEndDeviceResult): ChaosVerdict {
  if (result.enqueueAttempts <= 0) return 'FAIL';
  if (result.lost > 0) return 'FAIL';
  if (result.survivingPending !== result.enqueueAttempts) return 'FAIL';
  if (result.feedbackP95Ms >= 100) return 'FAIL';
  return 'PASS';
}

export async function runLowEndDeviceChaos(
  execute: () => Promise<LowEndDeviceResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    throw new Error(
      'Escenario low-end-device exige execute (evidencia cola); fail-closed sin fixtures',
    );
  }
  const result = await execute();
  return judgeLowEndDevice(result);
}
