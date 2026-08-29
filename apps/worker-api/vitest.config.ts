import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const isVolumeRun = process.argv.some((arg) => arg.includes('push-slo-volume'));

export default defineConfig(async () => {
  if (isVolumeRun) {
    const { cloudflareTest, readD1Migrations } = await import('@cloudflare/vitest-pool-workers');
    const root = path.dirname(fileURLToPath(import.meta.url));
    const migrations = await readD1Migrations(
      path.join(root, '../../packages/adapters-d1/migrations'),
    );
    return {
      plugins: [
        cloudflareTest({
          wrangler: { configPath: '../../packages/adapters-d1/wrangler.jsonc' },
          miniflare: {
            compatibilityDate: '2026-08-06',
            bindings: { TEST_MIGRATIONS: migrations },
          },
        }),
      ],
      test: {
        include: ['src/push/push-slo-volume.test.ts'],
        setupFiles: ['./test/apply-migrations.ts'],
        fileParallelism: false,
        // pool-workers no usa v8 coverage del host; umbrales viven en unit.
        passWithNoTests: false,
      },
    };
  }

  return {
    test: {
      include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
      exclude: ['src/push/push-slo-volume.test.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/worker.ts',
          'src/index.ts',
          'src/auth/tenant-state.ts',
          'src/orders/branch-kds-hub.ts',
        ],
        thresholds: {
          lines: 70,
          functions: 70,
          branches: 60,
          statements: 70,
        },
      },
    },
  };
});
