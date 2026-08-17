import { defineConfig } from '@playwright/test';

/**
 * E2E del sitio de marketing (claims de docs/ops/legal_and_sales_guide.md).
 * Puerto 4175 para no colisionar con el POS (:4173). El sitio se sirve solo
 * con PUBLIC_FEATURE_MARKETING_SITE=1. Las respuestas de la API se simulan
 * por spec (page.route); ningún spec depende de un servicio local.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4175',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4175',
    url: 'http://localhost:4175',
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      PUBLIC_FEATURE_MARKETING_SITE: '1',
    },
  },
});
