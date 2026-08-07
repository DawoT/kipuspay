/**
 * Tests Sprint 30 — motor promociones (ADR-0014 / §5.3 regla 15).
 */
import { describe, expect, it } from 'vitest';
import {
  assertAndApplyPromotions,
  parseMaxStack,
  parseMaxStackJson,
  parsePromoRule,
  parsePromoRuleJson,
  PROMO_EXPIRED,
  PROMO_INACTIVE,
  PROMO_NOT_ELIGIBLE,
  PROMO_NOT_FOUND,
  PROMO_RULE_INVALID,
  PROMO_STACK_FORBIDDEN,
  type PromotionDef,
} from './promotions.js';

const now = Date.parse('2026-08-07T12:00:00Z');

function promo(partial: Partial<PromotionDef> & Pick<PromotionDef, 'id' | 'rule'>): PromotionDef {
  return {
    active: true,
    startsAtMs: null,
    endsAtMs: null,
    appliesTo: 'PRODUCT',
    maxStack: { maxCount: 1 },
    productIds: new Set(['p1']),
    categoryIds: new Set(),
    priceListIds: new Set(),
    ...partial,
  };
}

describe('parsePromoRule', () => {
  it('percent válido', () => {
    expect(parsePromoRule({ kind: 'percent', percent: 10 })).toEqual({
      kind: 'percent',
      percent: 10,
    });
  });

  it('percent inválido → PROMO_RULE_INVALID', () => {
    expect(() => parsePromoRule({ kind: 'percent', percent: 0 })).toThrow(PROMO_RULE_INVALID);
    expect(() => parsePromoRule({ kind: 'percent', percent: 101 })).toThrow(PROMO_RULE_INVALID);
  });

  it('buy_x_get_y', () => {
    expect(parsePromoRule({ kind: 'buy_x_get_y', buyQty: 2, getQty: 1 })).toEqual({
      kind: 'buy_x_get_y',
      buyQty: 2,
      getQty: 1,
    });
  });

  it('threshold exige minQty o minAmountCents', () => {
    expect(() => parsePromoRule({ kind: 'threshold', percent: 5 })).toThrow(PROMO_RULE_INVALID);
    expect(parsePromoRule({ kind: 'threshold', percent: 5, minQty: 3 })).toMatchObject({
      kind: 'threshold',
      minQty: 3,
    });
  });

  it('tier ordena por minQty', () => {
    const r = parsePromoRule({
      kind: 'tier',
      tiers: [
        { minQty: 10, unitPriceCents: 80 },
        { minQty: 5, unitPriceCents: 90 },
      ],
    });
    expect(r.kind).toBe('tier');
    if (r.kind === 'tier') {
      expect(r.tiers[0]!.minQty).toBe(5);
      expect(r.tiers[1]!.minQty).toBe(10);
    }
  });

  it('JSON string inválido', () => {
    expect(() => parsePromoRuleJson('{')).toThrow(PROMO_RULE_INVALID);
  });
});

describe('parseMaxStack', () => {
  it('{} ≡ maxCount 1', () => {
    expect(parseMaxStack({})).toEqual({ maxCount: 1 });
    expect(parseMaxStackJson('{}')).toEqual({ maxCount: 1 });
  });

  it('compatibleKinds', () => {
    expect(parseMaxStack({ maxCount: 2, compatibleKinds: ['percent', 'tier'] })).toEqual({
      maxCount: 2,
      compatibleKinds: ['percent', 'tier'],
    });
  });

  it('maxCount inválido', () => {
    expect(() => parseMaxStack({ maxCount: 0 })).toThrow(PROMO_RULE_INVALID);
  });
});

describe('assertAndApplyPromotions', () => {
  it('sin promotionIds → passthrough', () => {
    const [line] = assertAndApplyPromotions({
      lines: [{ productId: 'p1', quantity: 2, unitPriceCents: 100 }],
      promotionsById: new Map(),
      nowMs: now,
    });
    expect(line).toMatchObject({
      unitPriceCents: 100,
      promoDiscountCents: 0,
      appliedPromotionIds: [],
    });
  });

  it('percent 10% sobre 2×100 = 20', () => {
    const map = new Map([
      [
        'promo1',
        promo({
          id: 'promo1',
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: 2,
          unitPriceCents: 100,
          promotionIds: ['promo1'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(20);
    expect(line!.unitPriceCents).toBe(100);
  });

  it('2x1 (buy 1 get 1) qty 4 → 2 free', () => {
    const map = new Map([
      [
        'bxgy',
        promo({
          id: 'bxgy',
          rule: { kind: 'buy_x_get_y', buyQty: 1, getQty: 1 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [{ productId: 'p1', quantity: 4, unitPriceCents: 100, promotionIds: ['bxgy'] }],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(200);
  });

  it('threshold por qty no cumplido → 0', () => {
    const map = new Map([
      [
        'th',
        promo({
          id: 'th',
          rule: { kind: 'threshold', percent: 20, minQty: 5 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [{ productId: 'p1', quantity: 2, unitPriceCents: 100, promotionIds: ['th'] }],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(0);
  });

  it('threshold por monto', () => {
    const map = new Map([
      [
        'th',
        promo({
          id: 'th',
          rule: { kind: 'threshold', percent: 10, minAmountCents: 500 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [{ productId: 'p1', quantity: 5, unitPriceCents: 100, promotionIds: ['th'] }],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(50);
  });

  it('tier ajusta unit price', () => {
    const map = new Map([
      [
        'tier',
        promo({
          id: 'tier',
          rule: {
            kind: 'tier',
            tiers: [
              { minQty: 5, unitPriceCents: 90 },
              { minQty: 10, unitPriceCents: 80 },
            ],
          },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [{ productId: 'p1', quantity: 10, unitPriceCents: 100, promotionIds: ['tier'] }],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.unitPriceCents).toBe(80);
    expect(line!.promoDiscountCents).toBe(0);
  });

  it('stack default maxCount 1 → PROMO_STACK_FORBIDDEN', () => {
    const map = new Map([
      ['a', promo({ id: 'a', rule: { kind: 'percent', percent: 5 } })],
      ['b', promo({ id: 'b', rule: { kind: 'percent', percent: 5 } })],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 1,
            unitPriceCents: 100,
            promotionIds: ['a', 'b'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_STACK_FORBIDDEN);
  });

  it('stack compatibleKinds permite percent+tier', () => {
    const stack = { maxCount: 2, compatibleKinds: ['percent', 'tier'] as const };
    const map = new Map([
      [
        'a',
        promo({
          id: 'a',
          rule: {
            kind: 'tier',
            tiers: [{ minQty: 1, unitPriceCents: 90 }],
          },
          maxStack: stack,
        }),
      ],
      [
        'b',
        promo({
          id: 'b',
          rule: { kind: 'percent', percent: 10 },
          maxStack: stack,
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: 2,
          unitPriceCents: 100,
          promotionIds: ['a', 'b'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    // tier → 90; percent 10% de 2×90 = 18
    expect(line!.unitPriceCents).toBe(90);
    expect(line!.promoDiscountCents).toBe(18);
  });

  it('compatibleKinds rechaza buy_x_get_y', () => {
    const stack = { maxCount: 2, compatibleKinds: ['percent', 'tier'] as const };
    const map = new Map([
      [
        'a',
        promo({
          id: 'a',
          rule: { kind: 'percent', percent: 5 },
          maxStack: stack,
        }),
      ],
      [
        'b',
        promo({
          id: 'b',
          rule: { kind: 'buy_x_get_y', buyQty: 1, getQty: 1 },
          maxStack: stack,
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 2,
            unitPriceCents: 100,
            promotionIds: ['a', 'b'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_STACK_FORBIDDEN);
  });

  it('PROMO_NOT_FOUND', () => {
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 1,
            unitPriceCents: 100,
            promotionIds: ['missing'],
          },
        ],
        promotionsById: new Map(),
        nowMs: now,
      }),
    ).toThrow(PROMO_NOT_FOUND);
  });

  it('PROMO_INACTIVE', () => {
    const map = new Map([
      [
        'x',
        promo({
          id: 'x',
          active: false,
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [{ productId: 'p1', quantity: 1, unitPriceCents: 100, promotionIds: ['x'] }],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_INACTIVE);
  });

  it('PROMO_EXPIRED', () => {
    const map = new Map([
      [
        'x',
        promo({
          id: 'x',
          endsAtMs: now - 1000,
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [{ productId: 'p1', quantity: 1, unitPriceCents: 100, promotionIds: ['x'] }],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_EXPIRED);
  });

  it('CATEGORY eligibility', () => {
    const map = new Map([
      [
        'c',
        promo({
          id: 'c',
          appliesTo: 'CATEGORY',
          productIds: new Set(),
          categoryIds: new Set(['cat1']),
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 1,
            unitPriceCents: 100,
            categoryId: 'other',
            promotionIds: ['c'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_NOT_ELIGIBLE);

    const [ok] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: 1,
          unitPriceCents: 100,
          categoryId: 'cat1',
          promotionIds: ['c'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    expect(ok!.promoDiscountCents).toBe(10);
  });

  it('LIST eligibility', () => {
    const map = new Map([
      [
        'l',
        promo({
          id: 'l',
          appliesTo: 'LIST',
          productIds: new Set(),
          priceListIds: new Set(['pl1']),
          rule: { kind: 'percent', percent: 5 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 1,
            unitPriceCents: 100,
            priceListId: null,
            promotionIds: ['l'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_NOT_ELIGIBLE);

    const [ok] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: 1,
          unitPriceCents: 100,
          priceListId: 'pl1',
          promotionIds: ['l'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    expect(ok!.promoDiscountCents).toBe(5);
  });

  it('PRODUCT no elegible', () => {
    const map = new Map([['x', promo({ id: 'x', rule: { kind: 'percent', percent: 10 } })]]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'other',
            quantity: 1,
            unitPriceCents: 100,
            promotionIds: ['x'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_NOT_ELIGIBLE);
  });

  it('startsAt futuro → PROMO_EXPIRED', () => {
    const map = new Map([
      [
        'x',
        promo({
          id: 'x',
          startsAtMs: now + 60_000,
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [{ productId: 'p1', quantity: 1, unitPriceCents: 100, promotionIds: ['x'] }],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_EXPIRED);
  });

  it('qty inválida / unit price inválido', () => {
    expect(() =>
      assertAndApplyPromotions({
        lines: [{ productId: 'p1', quantity: 0, unitPriceCents: 100 }],
        promotionsById: new Map(),
        nowMs: now,
      }),
    ).toThrow('INVALID_QUANTITY');

    const map = new Map([['x', promo({ id: 'x', rule: { kind: 'percent', percent: 10 } })]]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [
          {
            productId: 'p1',
            quantity: 1,
            unitPriceCents: 10.5,
            promotionIds: ['x'],
          },
        ],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow('INVALID_UNIT_PRICE');
  });

  it('dedupe promotionIds + threshold monto no cumplido', () => {
    const map = new Map([
      [
        'th',
        promo({
          id: 'th',
          rule: { kind: 'threshold', percent: 10, minAmountCents: 10_000 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: 1,
          unitPriceCents: 100,
          promotionIds: ['th', 'th'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(0);
    expect(line!.appliedPromotionIds).toEqual(['th']);
  });

  it('parse edge cases', () => {
    expect(parseMaxStack(null)).toEqual({ maxCount: 1 });
    expect(parseMaxStack(undefined)).toEqual({ maxCount: 1 });
    expect(() => parseMaxStack([])).toThrow(PROMO_RULE_INVALID);
    expect(() => parsePromoRule(null)).toThrow(PROMO_RULE_INVALID);
    expect(() => parsePromoRule({ kind: 'buy_x_get_y', buyQty: 0, getQty: 1 })).toThrow(
      PROMO_RULE_INVALID,
    );
    expect(() => parsePromoRule({ kind: 'tier', tiers: [] })).toThrow(PROMO_RULE_INVALID);
    expect(() =>
      parsePromoRule({
        kind: 'tier',
        tiers: [{ minQty: 1, unitPriceCents: -1 }],
      }),
    ).toThrow(PROMO_RULE_INVALID);
    expect(() =>
      parsePromoRule({
        kind: 'threshold',
        percent: 5,
        minAmountCents: 1.5,
      }),
    ).toThrow(PROMO_RULE_INVALID);
    expect(() => parseMaxStack({ maxCount: 2, compatibleKinds: [] })).toThrow(PROMO_RULE_INVALID);
    expect(() => parseMaxStackJson('{')).toThrow(PROMO_RULE_INVALID);
    expect(parsePromoRuleJson('{"kind":"percent","percent":10}')).toEqual({
      kind: 'percent',
      percent: 10,
    });
    expect(parsePromoRule({ kind: 'threshold', percent: 5, minAmountCents: 100 })).toMatchObject({
      minAmountCents: 100,
    });
    expect(() => parsePromoRule({ kind: 'unknown' as 'percent', percent: 10 })).toThrow(
      PROMO_RULE_INVALID,
    );
  });

  it('appliesTo inválido en runtime → PROMO_RULE_INVALID', () => {
    const map = new Map([
      [
        'x',
        promo({
          id: 'x',
          appliesTo: 'NOPE' as 'PRODUCT',
          rule: { kind: 'percent', percent: 10 },
        }),
      ],
    ]);
    expect(() =>
      assertAndApplyPromotions({
        lines: [{ productId: 'p1', quantity: 1, unitPriceCents: 100, promotionIds: ['x'] }],
        promotionsById: map,
        nowMs: now,
      }),
    ).toThrow(PROMO_RULE_INVALID);
  });

  it('CART applies without product target', () => {
    const map = new Map([
      [
        'cart',
        promo({
          id: 'cart',
          appliesTo: 'CART',
          productIds: new Set(),
          rule: { kind: 'percent', percent: 5 },
        }),
      ],
    ]);
    const [line] = assertAndApplyPromotions({
      lines: [
        {
          productId: 'p9',
          quantity: 1,
          unitPriceCents: 200,
          promotionIds: ['cart'],
        },
      ],
      promotionsById: map,
      nowMs: now,
    });
    expect(line!.promoDiscountCents).toBe(10);
  });
});
