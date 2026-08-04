import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.integration.test.ts',
        'src/**/*.test.ts',
        'src/worker-entry.ts',
        'src/migrations-down.ts',
        'src/raw.d.ts',
        'src/process-offline-sale-atomic.ts',
        'src/process-credit-note-atomic.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
