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
        'src/process-fiscal-deadlines.ts',
        'src/build-daily-summary.ts',
        'src/void-boleta-atomic.ts',
        'src/rollup-rematerialize.ts',
        'src/sync-sales-batch.ts',
        'src/process-order-billing-atomic.ts',
        'src/process-stock-transfer-atomic.ts',
        'src/process-partial-receive-atomic.ts',
        'src/process-payment-capture-atomic.ts',
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
