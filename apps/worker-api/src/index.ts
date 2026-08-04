import { Hono } from 'hono';
import { buildSaleTotals, type SaleLine } from '@kipuspay/domain-sales';
import {
  createTenantAndAuthMiddleware,
  defaultFailClosedDeps,
  type TenantAuthDeps,
} from './auth/tenant-auth-middleware.js';

export interface Env {
  DB?: D1Database;
}

export function createApp(authDeps: TenantAuthDeps = defaultFailClosedDeps()) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Rutas protegidas: auth fail-closed + Plan Guard (Sprint 2).
  app.use('/api/*', createTenantAndAuthMiddleware(authDeps));

  app.post('/api/pos/totals', async (c) => {
    const body: { lines?: readonly SaleLine[] } = await c.req.json();
    const lines = body.lines ?? [];
    return c.json(buildSaleTotals(lines));
  });

  return app;
}

/** App con deps fail-closed (tests / sin bindings). El deploy usa `worker.ts`. */
const app = createApp();
export default app;
