import { Hono } from 'hono';
import { buildSaleTotals, type SaleLine } from '@kipuspay/domain-sales';
import {
  createTenantAndAuthMiddleware,
  defaultFailClosedDeps,
  type TenantAuthDeps,
} from './auth/tenant-auth-middleware.js';
import type { WorkerEnv } from './auth/control-plane.js';
import { handleStripeWebhook } from './webhooks/handle-stripe-webhook.js';

export type { WorkerEnv as Env };

export function createApp(authDeps: TenantAuthDeps = defaultFailClosedDeps()) {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Rutas protegidas: auth fail-closed + Plan Guard (Sprint 2).
  app.use('/api/*', createTenantAndAuthMiddleware(authDeps));

  app.post('/api/pos/totals', async (c) => {
    const body: { lines?: readonly SaleLine[] } = await c.req.json();
    const lines = body.lines ?? [];
    return c.json(buildSaleTotals(lines));
  });

  // Stripe webhooks: raw body + firma; sin JWT (Arquitectura §4).
  app.post('/v1/webhooks/stripe', async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header('stripe-signature') ?? undefined;
    const result = await handleStripeWebhook(c.env, rawBody, signatureHeader);
    return c.json(result.body, result.status as 200 | 400 | 401 | 503);
  });

  return app;
}

/** App con deps fail-closed (tests / sin bindings). El deploy usa `worker.ts`. */
const app = createApp();
export default app;
