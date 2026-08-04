/**
 * Chaos plazos fiscales — reloj → alertas → DEADLINE_EXCEEDED → sugerencia E-A (§13.5).
 */

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface DeadlineChaosStep {
  readonly alert: 'T24H' | 'T6H' | 'DEADLINE_EXCEEDED';
  readonly suggestCreditNoteEa: boolean;
}

export interface DeadlineChaosResult {
  readonly steps: readonly DeadlineChaosStep[];
  readonly finalSunatStatus: string;
  readonly silentExpiry: boolean;
}

/**
 * Fail-closed: debe haber alerta en cada transición; DEADLINE con E-A;
 * nunca silentExpiry.
 */
export function judgeDeadlineChaos(result: DeadlineChaosResult): ChaosVerdict {
  if (result.silentExpiry) return 'FAIL';
  if (result.steps.length === 0) return 'FAIL';
  const kinds = result.steps.map((s) => s.alert);
  if (!kinds.includes('DEADLINE_EXCEEDED')) return 'FAIL';
  const exceeded = result.steps.find((s) => s.alert === 'DEADLINE_EXCEEDED');
  if (!exceeded?.suggestCreditNoteEa) return 'FAIL';
  if (result.finalSunatStatus !== 'DEADLINE_EXCEEDED') return 'FAIL';
  return 'PASS';
}

export async function runDeadlineChaos(
  execute: () => Promise<DeadlineChaosResult>,
): Promise<ChaosVerdict> {
  const result = await execute();
  return judgeDeadlineChaos(result);
}
