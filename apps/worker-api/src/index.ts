import { Hono } from 'hono';
import { buildSaleTotals, type SaleLine } from '@kipuspay/domain-sales';

export interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/api/pos/totals', async (c) => {
  const body: { lines?: readonly SaleLine[] } = await c.req.json();
  const lines = body.lines ?? [];
  return c.json(buildSaleTotals(lines));
});

export default app;
