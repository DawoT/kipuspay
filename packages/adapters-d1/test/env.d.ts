import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
