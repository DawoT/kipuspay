import { describe, expect, it } from 'vitest';
import { loadPromotionsByIds } from './load-promotions.js';
import type { D1DatabaseLike } from './index.js';

function mockDb(promos: unknown[], targets: unknown[]): D1DatabaseLike {
  let call = 0;
  const db = {
    prepare: () => ({
      bind: () => ({
        all: () => {
          call += 1;
          return Promise.resolve({
            results: call === 1 ? promos : targets,
            success: true,
            meta: {},
          });
        },
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      }),
    }),
    batch: () => Promise.resolve([]),
  };
  return db as unknown as D1DatabaseLike;
}

describe('loadPromotionsByIds', () => {
  it('vacío sin ids', async () => {
    const map = await loadPromotionsByIds(mockDb([], []), 't1', []);
    expect(map.size).toBe(0);
  });

  it('carga rule + targets producto', async () => {
    const map = await loadPromotionsByIds(
      mockDb(
        [
          {
            id: 'promo1',
            active: 1,
            starts_at: null,
            ends_at: null,
            applies_to: 'PRODUCT',
            rule_json: '{"kind":"percent","percent":10}',
            max_stack_json: '{}',
          },
        ],
        [{ promotion_id: 'promo1', product_id: 'p1', category_id: null, price_list_id: null }],
      ),
      't1',
      ['promo1'],
    );
    const p = map.get('promo1');
    expect(p?.active).toBe(true);
    expect(p?.rule).toEqual({ kind: 'percent', percent: 10 });
    expect(p?.productIds.has('p1')).toBe(true);
    expect(p?.maxStack).toEqual({ maxCount: 1 });
  });

  it('applies_to inválido', async () => {
    await expect(
      loadPromotionsByIds(
        mockDb(
          [
            {
              id: 'bad',
              active: 1,
              starts_at: null,
              ends_at: null,
              applies_to: 'NOPE',
              rule_json: '{"kind":"percent","percent":10}',
              max_stack_json: '{}',
            },
          ],
          [],
        ),
        't1',
        ['bad'],
      ),
    ).rejects.toThrow('PROMO_RULE_INVALID');
  });
});
