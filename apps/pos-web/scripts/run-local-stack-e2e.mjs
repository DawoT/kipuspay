import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = resolve(appDir, '../..');
const cliPath = resolve(appDir, 'node_modules/@playwright/test/cli.js');

function parseArgs(args) {
  let stateDir = '';
  const playwrightArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--state-dir') {
      stateDir = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg !== '--') playwrightArgs.push(arg);
  }
  if (!stateDir) {
    throw new Error('Usage: pnpm e2e:local-stack -- --state-dir <ruta-aislada> [playwright args]');
  }
  const resolvedState = resolve(stateDir);
  if (resolvedState === '/' || resolvedState === rootDir) {
    throw new Error('--state-dir must be an isolated directory, not / or the repository root');
  }
  return { stateDir: resolvedState, playwrightArgs };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port available');
  const port = String(address.port);
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

const { stateDir, playwrightArgs } = parseArgs(process.argv.slice(2));
const seed = spawnSync('bash', ['scripts/staff/apply-operational-seed.sh', '--state-dir', stateDir], {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

const [apiPort, posPort, marketingPort, inspectorPort] = await Promise.all([
  availablePort(),
  availablePort(),
  availablePort(),
  availablePort(),
]);
const env = {
  ...process.env,
  KIPUSPAY_LOCAL_STACK_STATE_DIR: stateDir,
  KIPUSPAY_LOCAL_STACK_API_PORT: apiPort,
  KIPUSPAY_LOCAL_STACK_POS_PORT: posPort,
  KIPUSPAY_LOCAL_STACK_MARKETING_PORT: marketingPort,
  KIPUSPAY_LOCAL_STACK_INSPECTOR_PORT: inspectorPort,
  KIPUSPAY_OPERATIONAL_PIN: process.env.KIPUSPAY_OPERATIONAL_PIN ?? '4826',
};

const child = spawn(
  process.execPath,
  [cliPath, 'test', '--config=playwright.local-stack.config.ts', ...playwrightArgs],
  { cwd: appDir, env, stdio: 'inherit' },
);
child.on('error', (error) => {
  console.error(`No se pudo iniciar Playwright local-stack: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
