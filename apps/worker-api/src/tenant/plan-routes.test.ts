import { describe, expect, it, vi } from 'vitest';
import { runUpdatePlanHttp } from './plan-routes.js';

function env(tenantExists: boolean) {
  const db = {
    prepare: vi.fn(() => {
      const stmt = {
        bind: vi.fn(() => stmt),
        first: vi.fn(() => Promise.resolve(tenantExists ? { id: 't1' } : null)),
        run: vi.fn(() => Promise.resolve({ success: true })),
      };
      return stmt;
    }),
    batch: vi.fn(),
  };
  return { DB: db } as never;
}

describe('runUpdatePlanHttp (S11-B5 upgrade self-serve)', () => {
  it('owner cambia de plan → 200 y persiste plan_id', async () => {
    const db = env(true);
    const res = await runUpdatePlanHttp(db, 't1', 'owner', { planId: 'crece' });
    expect(res).toEqual({ status: 200, body: { planId: 'crece' } });
    const dbWithPrepare = db as unknown as { DB: { prepare: ReturnType<typeof vi.fn> } };
    const calls = dbWithPrepare.DB.prepare.mock.calls as [string][];
    const update = calls.find(([sql]) => sql.includes('UPDATE tenants SET plan_id'));
    expect(update).toBeDefined();
  });

  it('admin también puede; cashier no (403 FORBIDDEN_ROLE)', async () => {
    expect((await runUpdatePlanHttp(env(true), 't1', 'admin', { planId: 'cadena' })).status).toBe(
      200,
    );
    const denied = await runUpdatePlanHttp(env(true), 't1', 'cashier', { planId: 'cadena' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('planId inválido → 422 INVALID_PLAN', async () => {
    const res = await runUpdatePlanHttp(env(true), 't1', 'owner', { planId: 'gold' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_PLAN');
  });

  it('enterprise no es self-serve', async () => {
    const res = await runUpdatePlanHttp(env(true), 't1', 'owner', { planId: 'enterprise' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ENTERPRISE_SALES_ASSISTED');
  });

  it('tenant inexistente → 404; sin DB → 503 fail-closed', async () => {
    expect(
      (await runUpdatePlanHttp(env(false), 't1', 'owner', { planId: 'arranque' })).status,
    ).toBe(404);
    expect((await runUpdatePlanHttp(undefined, 't1', 'owner', { planId: 'arranque' })).status).toBe(
      503,
    );
  });
});
