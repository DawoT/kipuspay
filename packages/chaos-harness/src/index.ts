/**
 * Chaos harness — contrato de escenarios (Arquitectura §13.5).
 * Cada escenario se activa en el sprint indicado; invocarlo antes es un error explícito.
 */

import {
  runConcurrentWritersChaos,
  runDuplicateRetryChaos,
  type ConcurrentWritersResult,
  type DuplicateRetryResult,
} from './sprint4-acid.js';
import { runDeadlineChaos, type DeadlineChaosResult } from './deadline-chaos.js';
import {
  runNetworkAdversarialChaos,
  type NetworkAdversarialResult,
} from './network-adversarial.js';
import { runQuotaExceededChaos, type QuotaExceededResult } from './quota-exceeded.js';

export type ChaosScenarioId =
  | 'network-adversarial'
  | 'quota-exceeded'
  | 'low-end-device'
  | 'shard-do-failure'
  | 'concurrent-writers'
  | 'duplicate-retry'
  | 'deadline';

export type ChaosVerdict = 'PASS' | 'FAIL';

/** Sprint mínimo en el que el escenario bloquea CI (null = aún no implementado). */
export const SCENARIO_ACTIVE_FROM: Readonly<Record<ChaosScenarioId, number | null>> = {
  'network-adversarial': 6,
  'quota-exceeded': 6,
  'low-end-device': 7,
  'shard-do-failure': 26,
  'concurrent-writers': 4,
  'duplicate-retry': 4,
  deadline: 5,
};

export class ChaosScenarioNotReadyError extends Error {
  readonly scenario: ChaosScenarioId;
  readonly activeFrom: number | null;

  constructor(scenario: ChaosScenarioId, activeFrom: number | null) {
    super(
      activeFrom === null
        ? `Escenario chaos "${scenario}" no tiene sprint de activación (§13.5)`
        : `Escenario chaos "${scenario}" activo desde Sprint ${activeFrom}; aún no implementado`,
    );
    this.name = 'ChaosScenarioNotReadyError';
    this.scenario = scenario;
    this.activeFrom = activeFrom;
  }
}

export function assertScenarioReady(scenario: ChaosScenarioId, currentSprint: number): void {
  const from = SCENARIO_ACTIVE_FROM[scenario];
  if (from === null || currentSprint < from) {
    throw new ChaosScenarioNotReadyError(scenario, from);
  }
}

export interface ChaosDeps {
  readonly runConcurrentWriters?: () => Promise<ConcurrentWritersResult>;
  readonly runDuplicateRetry?: () => Promise<DuplicateRetryResult>;
  readonly concurrentInitialStock?: number;
  readonly concurrentQtyEach?: number;
  readonly runDeadline?: () => Promise<DeadlineChaosResult>;
  readonly runNetworkAdversarial?: (cycles: number) => Promise<NetworkAdversarialResult>;
  readonly networkCycles?: number;
  readonly runQuotaExceeded?: () => Promise<QuotaExceededResult>;
}

/**
 * Punto de entrada. Fail-closed: sin execute real → error, nunca PASS por fixtures.
 */
export async function runChaosScenario(
  scenario: ChaosScenarioId,
  currentSprint: number,
  deps: ChaosDeps = {},
): Promise<ChaosVerdict> {
  assertScenarioReady(scenario, currentSprint);

  if (scenario === 'concurrent-writers') {
    if (!deps.runConcurrentWriters) {
      throw new Error(
        'Escenario concurrent-writers exige deps.runConcurrentWriters (evidencia D1); fail-closed sin fixtures',
      );
    }
    return runConcurrentWritersChaos(
      deps.runConcurrentWriters,
      deps.concurrentInitialStock ?? 2,
      deps.concurrentQtyEach ?? 1,
    );
  }

  if (scenario === 'duplicate-retry') {
    if (!deps.runDuplicateRetry) {
      throw new Error(
        'Escenario duplicate-retry exige deps.runDuplicateRetry (evidencia D1); fail-closed sin fixtures',
      );
    }
    return runDuplicateRetryChaos(deps.runDuplicateRetry);
  }

  if (scenario === 'deadline') {
    if (!deps.runDeadline) {
      throw new Error(
        'Escenario deadline exige deps.runDeadline (evidencia D1/reloj); fail-closed sin fixtures',
      );
    }
    return runDeadlineChaos(deps.runDeadline);
  }

  if (scenario === 'network-adversarial') {
    if (!deps.runNetworkAdversarial) {
      throw new Error(
        'Escenario network-adversarial exige deps.runNetworkAdversarial (evidencia sync); fail-closed sin fixtures',
      );
    }
    return runNetworkAdversarialChaos(deps.runNetworkAdversarial, deps.networkCycles ?? 500);
  }

  if (scenario === 'quota-exceeded') {
    if (!deps.runQuotaExceeded) {
      throw new Error(
        'Escenario quota-exceeded exige deps.runQuotaExceeded (evidencia IDB); fail-closed sin fixtures',
      );
    }
    return runQuotaExceededChaos(deps.runQuotaExceeded);
  }

  return Promise.reject(
    new Error(
      `Escenario "${scenario}" marcado activo en §13.5 (Sprint ${SCENARIO_ACTIVE_FROM[scenario]}) pero sin runner aún`,
    ),
  );
}

export {
  judgeConcurrentWriters,
  judgeDuplicateRetry,
  runConcurrentWritersChaos,
  runDuplicateRetryChaos,
} from './sprint4-acid.js';

export { judgeDeadlineChaos, runDeadlineChaos } from './deadline-chaos.js';

export { judgeNetworkAdversarial, runNetworkAdversarialChaos } from './network-adversarial.js';

export { judgeQuotaExceeded, runQuotaExceededChaos } from './quota-exceeded.js';
