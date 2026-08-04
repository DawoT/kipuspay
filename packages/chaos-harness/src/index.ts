/**
 * Chaos harness — contrato de escenarios (Arquitectura §13.5).
 * Cada escenario se activa en el sprint indicado; invocarlo antes es un error explícito.
 */

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

/**
 * Punto de entrada. Hasta que un sprint implemente el escenario, falla en seco
 * para que CI no reporte un falso PASS.
 */
export function runChaosScenario(
  scenario: ChaosScenarioId,
  currentSprint: number,
): Promise<ChaosVerdict> {
  assertScenarioReady(scenario, currentSprint);
  return Promise.reject(
    new Error(
      `Escenario "${scenario}" marcado activo en §13.5 (Sprint ${SCENARIO_ACTIVE_FROM[scenario]}) pero sin runner aún`,
    ),
  );
}
