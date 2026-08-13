/**
 * Sprint 48 — game day DR/BCP (§13.5, extiende Sprint 14).
 *
 * Simula la pérdida de un shard y verifica el loop de recuperación:
 * snapshot → restore apply → replay de colas → verificación RPO=0 / RPO≤1d.
 * Semántica INSERT OR IGNORE (PK): un replay duplicado jamás crea efectos.
 */

export type DrFailoverChaosVerdict = 'PASS' | 'FAIL';

export type DrFailoverFault = 'rpoTxLoss' | 'rpoRollupStale' | 'replayDuplicate';

export interface DrFailoverChaosSample {
  readonly cycle: number;
  readonly fault: DrFailoverFault | null;
  readonly salesRestored: number;
  readonly salesExpected: number;
  readonly rollupCovered: boolean;
  readonly duplicatesBlocked: number;
  readonly rpoTxZero: boolean;
  readonly rpoRollupOneDay: boolean;
  readonly invariantsHeld: boolean;
}

export interface DrFailoverChaosResult {
  readonly cycles: number;
  readonly samples: readonly DrFailoverChaosSample[];
  /** Fail-closed: evidencia real del engine DR (integration workerd). */
  readonly engineEvidenceVerified: boolean;
}

export function judgeDrFailoverChaos(result: DrFailoverChaosResult): DrFailoverChaosVerdict {
  if (result.samples.length !== result.cycles) return 'FAIL';
  if (!result.samples.every((sample) => sample.invariantsHeld)) return 'FAIL';
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

const SNAPSHOT_SALES = 5;
const REPLAY_ATTEMPTS = 3;

/** Simula un ciclo del loop DR: snapshot → apply → replay → verificación. */
function drFailoverCycle(cycle: number, faults: readonly DrFailoverFault[]): DrFailoverChaosSample {
  const fault = faults[cycle % Math.max(1, faults.length)] ?? null;

  // El snapshot ES la fuente de verdad: la pérdida real (fault rpoTxLoss)
  // falta en el backup; ni el restore ni el replay pueden inventarla.
  const snapshotIds = new Set<string>();
  for (let sale = 0; sale < SNAPSHOT_SALES; sale += 1) {
    if (!(fault === 'rpoTxLoss' && sale === 0)) snapshotIds.add(`s-${sale}`);
  }

  // Restore apply + replay: INSERT OR IGNORE por PK — re-aplicar no duplica
  // ni inventa filas ausentes del snapshot.
  const applied = new Set<string>();
  for (const id of snapshotIds) applied.add(id);
  for (const id of snapshotIds) applied.add(id);
  const salesRestored = applied.size;

  const rollupCovered = fault !== 'rpoRollupStale';
  let duplicatesBlocked = 0;
  for (let attempt = 0; attempt < REPLAY_ATTEMPTS; attempt += 1) {
    // El duplicado choca contra la PK/UNIQUE: OR IGNORE → 0 cambios.
    if (applied.has(`s-${attempt}`)) duplicatesBlocked += 1;
  }
  if (fault === 'replayDuplicate' && duplicatesBlocked > 0) duplicatesBlocked -= 1;

  const rpoTxZero = salesRestored === SNAPSHOT_SALES;
  const rpoRollupOneDay = rollupCovered;
  return {
    cycle,
    fault,
    salesRestored,
    salesExpected: SNAPSHOT_SALES,
    rollupCovered,
    duplicatesBlocked,
    rpoTxZero,
    rpoRollupOneDay,
    invariantsHeld: rpoTxZero && rpoRollupOneDay && duplicatesBlocked === REPLAY_ATTEMPTS,
  };
}

/** Modelo local determinista del loop DR (INSERT OR IGNORE por PK). */
export function runDrFailoverChaos(
  cycles = 500,
  faults: readonly DrFailoverFault[] = [],
  engineEvidenceVerified = false,
): DrFailoverChaosResult {
  const samples: DrFailoverChaosSample[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    samples.push(drFailoverCycle(cycle, faults));
  }
  return { cycles, samples, engineEvidenceVerified };
}

export interface DrFailoverChaosDeps {
  readonly runDrFailover?: () => Promise<DrFailoverChaosResult>;
}

export async function runDrFailoverChaosScenario(
  execute?: () => Promise<DrFailoverChaosResult>,
): Promise<DrFailoverChaosVerdict> {
  const result = execute ? await execute() : runDrFailoverChaos(500);
  return judgeDrFailoverChaos(result);
}
