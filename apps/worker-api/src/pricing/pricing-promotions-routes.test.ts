import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  isPricingPromotionsEnabled,
  runCreatePromotionHttp,
  runListPromotionsHttp,
  runUpdatePromotionHttp,
} from './pricing-promotions-routes.js';

function mockDb(opts?: {
  first?: unknown;
  allResults?: unknown[];
  onBatch?: (stmts: unknown[]) => void;
}): D1Database {
  return {
    batch: (stmts: unknown[]) => {
      opts?.onBatch?.(stmts);
      return Promise.resolve([]);
    },
    prepare: () => ({
      bind: () => ({
        first: () => Promise.resolve(opts?.first ?? null),
        all: () => Promise.resolve({ results: opts?.allResults ?? [] }),
        run: () => Promise.resolve({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

describe('pricing promotions routes', () => {
  it('flag off → FEATURE_OFF', async () => {
    expect(isPricingPromotionsEnabled({ FEATURE_PRICING_PROMOTIONS: '0' } as WorkerEnv)).toBe(
      false,
    );
    expect(isPricingPromotionsEnabled({ FEATURE_PRICING_PROMOTIONS: 'true' } as WorkerEnv)).toBe(
      true,
    );
    const res = await runCreatePromotionHttp(
      { FEATURE_PRICING_PROMOTIONS: '0' } as WorkerEnv,
      't1',
      'u1',
      { name: 'x', appliesTo: 'CART', ruleJson: { kind: 'percent', percent: 10 } },
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('flag on sin DB → 503', async () => {
    const res = await runListPromotionsHttp({ FEATURE_PRICING_PROMOTIONS: '1' } as WorkerEnv, 't1');
    expect(res.status).toBe(503);
  });

  it('sin tenant → 401', async () => {
    const res = await runListPromotionsHttp(
      { FEATURE_PRICING_PROMOTIONS: '1', DB: mockDb() } as WorkerEnv,
      '',
    );
    expect(res.status).toBe(401);
  });

  it('create bad request sin name', async () => {
    const res = await runCreatePromotionHttp(
      { FEATURE_PRICING_PROMOTIONS: '1', DB: mockDb() } as WorkerEnv,
      't1',
      'u1',
      { appliesTo: 'CART', ruleJson: { kind: 'percent', percent: 10 } },
    );
    expect(res.status).toBe(400);
  });

  it('rule inválida → 422 PROMO_RULE_INVALID', async () => {
    const batch: unknown[] = [];
    const res = await runCreatePromotionHttp(
      {
        FEATURE_PRICING_PROMOTIONS: '1',
        DB: mockDb({ onBatch: (s) => batch.push(...s) }),
      } as WorkerEnv,
      't1',
      'u1',
      { name: 'bad', appliesTo: 'CART', ruleJson: { kind: 'percent', percent: 0 } },
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROMO_RULE_INVALID');
    expect(batch).toHaveLength(0);
  });

  it('create PRODUCT ok', async () => {
    let n = 0;
    const res = await runCreatePromotionHttp(
      {
        FEATURE_PRICING_PROMOTIONS: '1',
        DB: mockDb({
          onBatch: (s) => {
            n = s.length;
          },
        }),
      } as WorkerEnv,
      't1',
      'u1',
      {
        name: '2x1',
        appliesTo: 'PRODUCT',
        ruleJson: { kind: 'buy_x_get_y', buyQty: 1, getQty: 1 },
        productIds: ['p1'],
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.promotionId).toBeTruthy();
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it('list ok', async () => {
    const res = await runListPromotionsHttp(
      {
        FEATURE_PRICING_PROMOTIONS: '1',
        DB: mockDb({
          allResults: [
            {
              id: 'p1',
              name: 'Promo',
              active: 1,
              applies_to: 'CART',
              rule_json: '{}',
              max_stack_json: '{}',
              starts_at: null,
              ends_at: null,
              created_at: '2026-08-07',
            },
          ],
        }),
      } as WorkerEnv,
      't1',
    );
    expect(res.status).toBe(200);
    expect((res.body.promotions as unknown[]).length).toBe(1);
  });

  it('update not found → 404', async () => {
    const res = await runUpdatePromotionHttp(
      { FEATURE_PRICING_PROMOTIONS: '1', DB: mockDb({ first: null }) } as WorkerEnv,
      't1',
      'u1',
      'missing',
      { active: false },
    );
    expect(res.status).toBe(404);
  });

  it('update ok', async () => {
    const res = await runUpdatePromotionHttp(
      { FEATURE_PRICING_PROMOTIONS: '1', DB: mockDb({ first: { id: 'p1' } }) } as WorkerEnv,
      't1',
      'u1',
      'p1',
      { active: false, name: 'renamed' },
    );
    expect(res.status).toBe(200);
  });
});
