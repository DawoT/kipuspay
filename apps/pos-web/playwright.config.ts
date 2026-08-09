import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    env: {
      PUBLIC_FEATURE_ORDERS_CUSTOMER_ORDERS: '1',
      PUBLIC_FEATURE_SALES_RECURRING: '1',
      PUBLIC_FEATURE_MOBILE_PUSH: '1',
      PUBLIC_FEATURE_CLIENT_MOBILE_POS: '1',
    },
  },
});
