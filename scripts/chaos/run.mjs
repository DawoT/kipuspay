#!/usr/bin/env node
/**
 * Orquestador chaos (§13.5). Sprint 4+: evidencia D1 vive en adapters-d1
 * integration (quality step 4). Aquí solo corre el harness unitario fail-closed
 * (jueces + rechazo sin deps). No re-ejecuta integration (evita doble-run).
 */
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string' },
    sprint: { type: 'string', default: '4' },
  },
});

const scenario = values.scenario ?? 'all';
const sprint = values.sprint ?? '4';

if (Number(sprint) < 5 && scenario === 'deadline') {
  console.error(`Escenario deadline activo desde fase fiscal RC (sprint≥5)`);
  process.exit(2);
}

if (
  Number(sprint) < 6 &&
  (scenario === 'network-adversarial' || scenario === 'quota-exceeded')
) {
  console.error(`Escenario ${scenario} activo desde fase offline sync (sprint≥6)`);
  process.exit(2);
}

if (Number(sprint) < 7 && scenario === 'low-end-device') {
  console.error(`Escenario low-end-device activo desde fase POS premium (sprint≥7)`);
  process.exit(2);
}

const unit = spawnSync(
  'pnpm',
  ['--filter', '@kipuspay/chaos-harness', 'test:unit'],
  { stdio: 'inherit', shell: false },
);
if (unit.status !== 0) process.exit(unit.status ?? 1);

console.log(
  `RESULT chaos ${scenario} PASS (sprint ${sprint}; harness fail-closed; D1 evidence = quality step 4 integration)`,
);
process.exit(0);
