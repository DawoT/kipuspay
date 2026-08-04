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
import { runLowEndDeviceChaos, type LowEndDeviceResult } from './low-end-device.js';

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
  readonly runLowEndDevice?: () => Promise<LowEndDeviceResult>;
}

function requireDep<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

async function dispatchReadyScenario(
  scenario: ChaosScenarioId,
  deps: ChaosDeps,
): Promise<ChaosVerdict> {
  switch (scenario) {
    case 'concurrent-writers':
      return runConcurrentWritersChaos(
        requireDep(
          deps.runConcurrentWriters,
          'Escenario concurrent-writers exige deps.runConcurrentWriters (evidencia D1); fail-closed sin fixtures',
        ),
        deps.concurrentInitialStock ?? 2,
        deps.concurrentQtyEach ?? 1,
      );
    case 'duplicate-retry':
      return runDuplicateRetryChaos(
        requireDep(
          deps.runDuplicateRetry,
          'Escenario duplicate-retry exige deps.runDuplicateRetry (evidencia D1); fail-closed sin fixtures',
        ),
      );
    case 'deadline':
      return runDeadlineChaos(
        requireDep(
          deps.runDeadline,
          'Escenario deadline exige deps.runDeadline (evidencia D1/reloj); fail-closed sin fixtures',
        ),
      );
    case 'network-adversarial':
      return runNetworkAdversarialChaos(
        requireDep(
          deps.runNetworkAdversarial,
          'Escenario network-adversarial exige deps.runNetworkAdversarial (evidencia sync); fail-closed sin fixtures',
        ),
        deps.networkCycles ?? 500,
      );
    case 'quota-exceeded':
      return runQuotaExceededChaos(
        requireDep(
          deps.runQuotaExceeded,
          'Escenario quota-exceeded exige deps.runQuotaExceeded (evidencia IDB); fail-closed sin fixtures',
        ),
      );
    case 'low-end-device':
      return runLowEndDeviceChaos(
        requireDep(
          deps.runLowEndDevice,
          'Escenario low-end-device exige deps.runLowEndDevice (evidencia cola); fail-closed sin fixtures',
        ),
      );
    default:
      return Promise.reject(
        new Error(
          `Escenario "${scenario}" marcado activo en §13.5 (Sprint ${SCENARIO_ACTIVE_FROM[scenario]}) pero sin runner aún`,
        ),
      );
  }
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
  return dispatchReadyScenario(scenario, deps);
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

export { judgeLowEndDevice, runLowEndDeviceChaos } from './low-end-device.js';
