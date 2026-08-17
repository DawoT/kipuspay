import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '$env/static/public': fileURLToPath(new URL('./tests/env-static-public.ts', import.meta.url)),
      '$env/dynamic/public': fileURLToPath(
        new URL('./tests/env-dynamic-public.ts', import.meta.url),
      ),
      '$env/dynamic/private': fileURLToPath(
        new URL('./tests/env-dynamic-private.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
