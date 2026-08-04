#!/usr/bin/env node
/**
 * Orquestador chaos (§13.5). Delega en la suite del harness + integration D1.
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

if (Number(sprint) < 4 && (scenario === 'concurrent-writers' || scenario === 'duplicate-retry')) {
  console.error(`Escenario ${scenario} activo desde Sprint 4`);
  process.exit(2);
}

const unit = spawnSync(
  'pnpm',
  ['--filter', '@kipuspay/chaos-harness', 'test:unit'],
  { stdio: 'inherit', shell: false },
);
if (unit.status !== 0) process.exit(unit.status ?? 1);

if (Number(sprint) >= 4) {
  const integ = spawnSync(
    'pnpm',
    ['--filter', '@kipuspay/adapters-d1', 'test:integration'],
    { stdio: 'inherit', shell: false },
  );
  if (integ.status !== 0) process.exit(integ.status ?? 1);
}

console.log(`RESULT chaos ${scenario} PASS (sprint ${sprint})`);
process.exit(0);
