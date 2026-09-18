import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    // lpdp-security usa Durable Objects y cloudflare:workers; su ejecución vive
    // en el branch Workerd de vitest.config.ts, no en la integración Node.
    exclude: ['src/customers/lpdp-security.integration.test.ts'],
    passWithNoTests: true,
    environment: 'node',
  },
});
