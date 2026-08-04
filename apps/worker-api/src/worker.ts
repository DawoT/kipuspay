import { createAuthDepsFromEnv, type WorkerEnv } from './auth/control-plane.js';
import { createApp } from './index.js';

export { TenantState } from './auth/tenant-state.js';

/**
 * Composition root Workers: bindings reales → deps de auth → Hono.
 */
export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createApp(createAuthDepsFromEnv(env)).fetch(request, env, ctx);
  },
};
