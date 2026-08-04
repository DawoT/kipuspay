import { Hono } from 'hono';
import { buildSaleTotals, type OfflineSalePayload, type SaleLine } from '@kipuspay/domain-sales';
import type { AuthTenantSnapshot } from './auth/auth-decide.js';
import {
  createTenantAndAuthMiddleware,
  defaultFailClosedDeps,
  type TenantAuthDeps,
  type VerifiedJwtClaims,
} from './auth/tenant-auth-middleware.js';
import type { UserSession } from './auth/idp-user.js';
import type { WorkerEnv } from './auth/control-plane.js';
import { handleStripeWebhook } from './webhooks/handle-stripe-webhook.js';
import { runOfflineSaleHttp } from './pos/offline-sale-route.js';

export type { WorkerEnv as Env };

interface AppEnv {
  Bindings: WorkerEnv;
  Variables: {
    tenant: AuthTenantSnapshot;
    jwt: VerifiedJwtClaims;
    user?: UserSession;
  };
}

export function createApp(authDeps: TenantAuthDeps = defaultFailClosedDeps()) {
  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Rutas protegidas: auth fail-closed + Plan Guard (Sprint 2).
  app.use('/api/*', createTenantAndAuthMiddleware(authDeps));

  app.post('/api/pos/totals', async (c) => {
    const body: { lines?: readonly SaleLine[] } = await c.req.json();
    const lines = body.lines ?? [];
    return c.json(buildSaleTotals(lines));
  });

  // Motor ACID offline (Sprint 4) — detrás de FEATURE_ACID_OFFLINE_SALE (§5.1).
  app.post('/api/pos/offline-sale', async (c) => {
    const jwt = c.get('jwt') as { tenantId: string; sub: string } | undefined;
    const user = c.get('user');
    const tenantId = jwt?.tenantId ?? '';
    const userId = user?.userId ?? jwt?.sub ?? '';
    let payload: OfflineSalePayload;
    try {
      const raw: unknown = await c.req.json();
      payload = raw as OfflineSalePayload;
    } catch {
      return c.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, 400);
    }
    const result = await runOfflineSaleHttp(c.env, tenantId, userId, payload);
    return c.json(result.body, result.status as 200 | 400 | 404 | 422 | 503);
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
