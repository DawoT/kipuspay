/**
 * Sprint 51 — chaos ops.shift_handoff (§13.5, patrón 6C-6F).
 *
 * 500 ciclos: handoff de turno concurrente (1 gana el PIN), reuso de PIN
 * (jamás 2 transfers con el mismo PIN), PIN expirado, conteo intermedio
 * negativo (jamás persiste), cadena de audit sin fork.
 * Fail-closed: el judge exige engineEvidenceVerified (evidencia real del
 * engine workerd — process-shift-handoff-atomic.integration.test.ts).
 */

export type ShiftHandoffChaosVerdict = 'PASS' | 'FAIL';

export type ShiftHandoffFault =
  | 'doubleTransferSamePin'
  | 'pinReuseAfterUse'
  | 'pinExpired'
  | 'negativeInterimCount'
  | 'auditFork';

export interface ShiftHandoffChaosSample {
  readonly cycle: number;
  readonly fault: ShiftHandoffFault | null;
  readonly winners: number;
  readonly pinReused: boolean;
  readonly pinExpiredDetected: boolean;
  readonly negativeInterimRejected: boolean;
  readonly auditLinear: boolean;
  readonly invariantsHeld: boolean;
}

export interface ShiftHandoffChaosResult {
  readonly cycles: number;
  readonly samples: readonly ShiftHandoffChaosSample[];
  /** Fail-closed: evidencia real del engine (integration workerd). */
  readonly engineEvidenceVerified: boolean;
}

export function judgeShiftHandoffChaos(result: ShiftHandoffChaosResult): ShiftHandoffChaosVerdict {
  if (result.samples.length !== result.cycles) return 'FAIL';
  if (!result.samples.every((sample) => sample.invariantsHeld)) return 'FAIL';
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

const PIN_USED = new Set<string>();

function shiftHandoffCycle(
  cycle: number,
  faults: readonly ShiftHandoffFault[],
): ShiftHandoffChaosSample {
  const fault = faults[cycle % Math.max(1, faults.length)] ?? null;
  const pin = `pin-${cycle % 50}`;
  let winners = 1;
  let pinReused = false;
  let pinExpiredDetected = true;
  let negativeInterimRejected = true;
  let auditLinear = true;

  if (fault === 'doubleTransferSamePin') {
    // Dos transfers concurrentes con el mismo PIN → 1 gana (guard CAS).
    winners = PIN_USED.has(pin) ? 0 : 1;
    PIN_USED.add(pin);
  } else if (fault === 'pinReuseAfterUse') {
    // PIN ya consumido en un batch anterior → 0 winners.
    winners = 0;
    pinReused = true;
  } else if (fault === 'pinExpired') {
    // TTL vencido → PIN_EXPIRED, 0 winners.
    winners = 0;
    pinExpiredDetected = false;
  } else if (fault === 'negativeInterimCount') {
    // Conteo intermedio negativo → rechazado (jamás persiste).
    negativeInterimRejected = false;
  } else if (fault === 'auditFork') {
    // Dos hijos del mismo prev_hash → cadena bifurcada.
    auditLinear = false;
  }

  // El fault 'pinExpired' detecta el caso (pinExpiredDetected=false); en el
  // modelo sano el PIN SÍ expira correctamente (pinExpiredDetected=true).
  const invariantsHeld =
    winners <= 1 && !pinReused && pinExpiredDetected && negativeInterimRejected && auditLinear;
  return {
    cycle,
    fault,
    winners,
    pinReused,
    pinExpiredDetected,
    negativeInterimRejected,
    auditLinear,
    invariantsHeld,
  };
}

/** Modelo local determinista — la evidencia real vive en el integration workerd. */
export function runShiftHandoffChaos(
  cycles = 500,
  faults: readonly ShiftHandoffFault[] = [
    'doubleTransferSamePin',
    'pinReuseAfterUse',
    'pinExpired',
    'negativeInterimCount',
    'auditFork',
  ],
  engineEvidenceVerified = false,
): ShiftHandoffChaosResult {
  PIN_USED.clear();
  const samples: ShiftHandoffChaosSample[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    samples.push(shiftHandoffCycle(cycle, faults));
  }
  return { cycles, samples, engineEvidenceVerified };
}

export async function runShiftHandoffChaosScenario(
  execute?: () => Promise<ShiftHandoffChaosResult>,
): Promise<ShiftHandoffChaosVerdict> {
  return judgeShiftHandoffChaos(execute ? await execute() : runShiftHandoffChaos(500));
}
