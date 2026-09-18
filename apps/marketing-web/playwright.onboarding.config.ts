import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const marketingDir = dirname(fileURLToPath(import.meta.url));
const posDir = resolve(marketingDir, '../pos-web');
const marketingPort = '4178';
const posPort = '4179';
const marketingOrigin = `http://127.0.0.1:${marketingPort}`;
const posOrigin = `http://127.0.0.1:${posPort}`;

export default defineConfig({
  testDir: './tests/onboarding-e2e',
  fullyParallel: true,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: marketingOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${marketingPort} --strictPort`,
      cwd: marketingDir,
      url: marketingOrigin,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PUBLIC_FEATURE_MARKETING_SITE: '1',
        PUBLIC_POS_ORIGIN: posOrigin,
      },
    },
    {
      command: `./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${posPort} --strictPort`,
      cwd: posDir,
      url: posOrigin,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        KIPUSPAY_E2E_OUT_DIR: '.svelte-kit-onboarding-e2e',
        PUBLIC_ENABLE_DEV_HARNESS: '1',
        PUBLIC_API_BASE: '',
      },
    },
  ],
});
