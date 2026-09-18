import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const configDir = dirname(fileURLToPath(import.meta.url));

const stateDir = process.env.KIPUSPAY_LOCAL_STACK_STATE_DIR;
const apiPort = process.env.KIPUSPAY_LOCAL_STACK_API_PORT;
const posPort = process.env.KIPUSPAY_LOCAL_STACK_POS_PORT;
const marketingPort = process.env.KIPUSPAY_LOCAL_STACK_MARKETING_PORT;
const inspectorPort = process.env.KIPUSPAY_LOCAL_STACK_INSPECTOR_PORT;
if (!stateDir || !apiPort || !posPort || !marketingPort || !inspectorPort) {
  throw new Error('Use scripts/run-local-stack-e2e.mjs with an explicit --state-dir');
}

const apiOrigin = `http://127.0.0.1:${apiPort}`;
const posOrigin = `http://127.0.0.1:${posPort}`;
const marketingOrigin = `http://127.0.0.1:${marketingPort}`;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const flags = [
  'FEATURE_AUTH_CASHIER_LOGIN',
  'FEATURE_TENANT_CAPABILITIES_DYNAMIC',
  'FEATURE_CATALOG_SELLABLE',
  'FEATURE_OFFLINE_SYNC',
  'FEATURE_ACID_OFFLINE_SALE',
  'FEATURE_POS_CHECKOUT',
  'FEATURE_INVENTORY_BATCHES',
  'FEATURE_INVENTORY_BOM',
  'FEATURE_PRICING_LISTS',
  'FEATURE_PRICING_PROMOTIONS',
  'FEATURE_ORDERS_KDS',
  'FEATURE_STOCK_TRANSFERS',
  'FEATURE_PURCHASING_PARTIAL_RECEIVE',
  'FEATURE_PURCHASING_THREE_WAY',
  'FEATURE_LEDGER_AR_AP',
  'FEATURE_LEDGER_CHART_OF_ACCOUNTS',
  'FEATURE_PURCHASING_ORDERS',
  'FEATURE_SALES_RECURRING',
  'FEATURE_FUEL_STATION',
  'FEATURE_CASH_BLIND_Z',
  'FEATURE_SHIFT_HANDOFF',
  'FEATURE_FISCAL_WITHHOLDINGS',
].flatMap((flag) => ['--var', `${flag}:1`]);
const workerCommand = [
  './node_modules/.bin/wrangler',
  'dev',
  '--local',
  '--persist-to',
  shellQuote(stateDir),
  '--ip',
  '127.0.0.1',
  '--port',
  apiPort,
  '--inspector-port',
  inspectorPort,
  '--var',
  `ALLOWED_ORIGINS:${marketingOrigin},${posOrigin}`,
  ...flags,
  '--log-level',
  'warn',
].join(' ');

export default defineConfig({
  testDir: './tests/local-stack',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: resolve(stateDir, 'artifacts/playwright'),
  reporter: [['list'], ['json', { outputFile: resolve(stateDir, 'artifacts/results.json') }]],
  use: {
    baseURL: marketingOrigin,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: workerCommand,
      cwd: resolve(configDir, '../worker-api'),
      url: `${apiOrigin}/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `KIPUSPAY_E2E_OUT_DIR=.svelte-kit ./node_modules/.bin/svelte-kit sync && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${posPort} --strictPort`,
      cwd: configDir,
      url: posOrigin,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PUBLIC_API_BASE: apiOrigin,
        PUBLIC_ENABLE_DEV_HARNESS: '0',
        KIPUSPAY_E2E_OUT_DIR: `.svelte-kit-local-stack-${process.pid}`,
      },
    },
    {
      command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${marketingPort} --strictPort`,
      cwd: resolve(configDir, '../marketing-web'),
      url: marketingOrigin,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PUBLIC_API_BASE: apiOrigin,
        PUBLIC_POS_ORIGIN: posOrigin,
      },
    },
  ],
});
