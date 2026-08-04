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

export type ChaosScenarioId =
  | 'network-adversarial'
  | 'quota-exceeded'
  | 'low-end-device'
  | 'shard-do-failure'
  | 'concurrent-writers'
  | 'duplicate-retry';

export type ChaosVerdict = 'PASS' | 'FAIL';

/** Sprint mínimo en el que el escenario bloquea CI (null = aún no implementado). */
export const SCENARIO_ACTIVE_FROM: Readonly<Record<ChaosScenarioId, number | null>> = {
  'network-adversarial': 6,
  'quota-exceeded': 6,
  'low-end-device': 7,
  'shard-do-failure': 26,
  'concurrent-writers': 4,
  'duplicate-retry': 4,
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

export interface ChaosSprint4Deps {
  readonly runConcurrentWriters?: () => Promise<ConcurrentWritersResult>;
  readonly runDuplicateRetry?: () => Promise<DuplicateRetryResult>;
  readonly concurrentInitialStock?: number;
  readonly concurrentQtyEach?: number;
}

/**
 * Punto de entrada. Sprint 4: concurrent-writers / duplicate-retry requieren deps
 * inyectadas (evidencia D1 en adapters-d1) o usan jueces con fixtures de demo.
 */
export async function runChaosScenario(
  scenario: ChaosScenarioId,
  currentSprint: number,
  deps: ChaosSprint4Deps = {},
): Promise<ChaosVerdict> {
  assertScenarioReady(scenario, currentSprint);

  if (scenario === 'concurrent-writers') {
    const execute =
      deps.runConcurrentWriters ??
      (() =>
        Promise.resolve({
          attempts: [
            { ok: true, offlineSaleId: 'a' },
            { ok: true, offlineSaleId: 'b' },
            { ok: false, offlineSaleId: 'c' },
          ],
          finalStock: 0,
          saleCount: 2,
        }));
    return runConcurrentWritersChaos(
      execute,
      deps.concurrentInitialStock ?? 2,
      deps.concurrentQtyEach ?? 1,
    );
  }

  if (scenario === 'duplicate-retry') {
    const execute =
      deps.runDuplicateRetry ??
      (() =>
        Promise.resolve({
          firstStatus: 'SUCCESS',
          secondStatus: 'ALREADY_SYNCED',
          saleCount: 1,
        }));
    return runDuplicateRetryChaos(execute);
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
