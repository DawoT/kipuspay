import { defineConfig } from '@playwright/test';

const port = 41732;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['lpdp-frozen.frozen.ts'],
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `KIPUSPAY_E2E_OUT_DIR=.svelte-kit ./node_modules/.bin/svelte-kit sync && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PUBLIC_ENABLE_DEV_HARNESS: '1',
      PUBLIC_API_BASE: '',
      PUBLIC_FEATURE_LPDP: '0',
      KIPUSPAY_E2E_OUT_DIR: '.svelte-kit-e2e-lpdp-frozen',
    },
  },
});
