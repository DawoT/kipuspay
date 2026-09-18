import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = resolve(appDir, 'node_modules/@playwright/test/cli.js');

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise((resolveClose) => server.close(resolveClose));
    throw new Error('No fue posible asignar un puerto local para Playwright');
  }
  const port = String(address.port);
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

const env = {
  ...process.env,
  KIPUSPAY_E2E_PORT: process.env.KIPUSPAY_E2E_PORT ?? (await findAvailablePort()),
  // A concurrent suite must never rebuild the output directory being served
  // by another Playwright run.
  KIPUSPAY_E2E_OUT_DIR: process.env.KIPUSPAY_E2E_OUT_DIR ?? `.svelte-kit-e2e-${process.pid}`,
};
const cliArgs = process.argv.slice(2);
if (cliArgs[0] === '--') cliArgs.shift();
const child = spawn(process.execPath, [cliPath, 'test', ...cliArgs], {
  cwd: appDir,
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`No se pudo iniciar Playwright: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
