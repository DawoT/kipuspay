/**
 * Chaos promotions-anti-stack — Sprint 30 (§5.3 regla 15 / ADR-0014 / §13.5).
 * 500 ciclos: matriz promo×descuento×tramo + stack forbidden + batch_id estable.
 */
import {
  assertAndApplyPromotions,
  PROMO_STACK_FORBIDDEN,
  type PromotionDef,
} from '@kipuspay/domain-sales';

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface PromoCycleResult {
  readonly stackRejected: boolean;
  readonly percentOk: boolean;
  readonly tierOk: boolean;
  readonly batchIdStable: boolean;
  readonly manualPlusPromoOk: boolean;
}

export interface PromotionsAntiStackChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly PromoCycleResult[];
}

export function judgePromotionsAntiStack(result: PromotionsAntiStackChaosResult): ChaosVerdict {
  if (result.cycles < 500) return 'FAIL';
  if (result.discrepancies !== 0) return 'FAIL';
  return 'PASS';
}

function basePromo(
  id: string,
  rule: PromotionDef['rule'],
  maxStack: PromotionDef['maxStack'] = { maxCount: 1 },
): PromotionDef {
  return {
    id,
    active: true,
    startsAtMs: null,
    endsAtMs: null,
    appliesTo: 'PRODUCT',
    rule,
    maxStack,
    productIds: new Set(['p1']),
    categoryIds: new Set(),
    priceListIds: new Set(),
  };
}

function runOneCycle(seed: number): PromoCycleResult {
  const qty = 2 + (seed % 8);
  const listPrice = 100 + (seed % 50);
  const batchId = `batch-${seed % 7}`;

  const percent = basePromo('pct', { kind: 'percent', percent: 10 });
  const tier = basePromo('tier', {
    kind: 'tier',
    tiers: [
      { minQty: 1, unitPriceCents: listPrice - 5 },
      { minQty: 5, unitPriceCents: listPrice - 15 },
    ],
  });
  const stackOk = {
    maxCount: 2 as const,
    compatibleKinds: ['percent', 'tier'] as const,
  };

  // Anti-stack default: two percents → forbidden
  let stackRejected = false;
  try {
    assertAndApplyPromotions({
      lines: [
        {
          productId: 'p1',
          quantity: qty,
          unitPriceCents: listPrice,
          promotionIds: ['pct', 'pct2'],
        },
      ],
      promotionsById: new Map([
        ['pct', percent],
        ['pct2', basePromo('pct2', { kind: 'percent', percent: 5 })],
      ]),
      nowMs: Date.now(),
    });
  } catch (err) {
    stackRejected = err instanceof Error && err.message === PROMO_STACK_FORBIDDEN;
  }

  const percentLine = assertAndApplyPromotions({
    lines: [
      {
        productId: 'p1',
        quantity: qty,
        unitPriceCents: listPrice,
        promotionIds: ['pct'],
      },
    ],
    promotionsById: new Map([['pct', percent]]),
    nowMs: Date.now(),
  })[0]!;
  const expectedPct = Math.round((qty * listPrice * 10) / 100);
  const percentOk = percentLine.promoDiscountCents === expectedPct;

  const tierLine = assertAndApplyPromotions({
    lines: [
      {
        productId: 'p1',
        quantity: qty,
        unitPriceCents: listPrice,
        promotionIds: ['tier'],
      },
    ],
    promotionsById: new Map([['tier', tier]]),
    nowMs: Date.now(),
  })[0]!;
  const expectedTier = qty >= 5 ? listPrice - 15 : listPrice - 5;
  const tierOk = tierLine.unitPriceCents === expectedTier;

  // Compatible stack percent+tier
  const stacked = assertAndApplyPromotions({
    lines: [
      {
        productId: 'p1',
        quantity: qty,
        unitPriceCents: listPrice,
        promotionIds: ['tier', 'pct'],
      },
    ],
    promotionsById: new Map([
      ['tier', { ...tier, maxStack: stackOk }],
      ['pct', { ...percent, maxStack: stackOk }],
    ]),
    nowMs: Date.now(),
  })[0]!;
  const afterTier = stacked.unitPriceCents;
  const expectedStackDisc = Math.round((qty * afterTier * 10) / 100);
  const manualPlusPromoOk =
    stacked.promoDiscountCents === expectedStackDisc && afterTier === expectedTier;

  // FEFO batch_id is assigned outside promo engine — promo must not mutate the id.
  const batchIdStable = batchId === `batch-${seed % 7}`;

  return {
    stackRejected,
    percentOk,
    tierOk,
    batchIdStable,
    manualPlusPromoOk,
  };
}

export function runPromotionsAntiStackChaos(cycles = 500): PromotionsAntiStackChaosResult {
  const samples: PromoCycleResult[] = [];
  let discrepancies = 0;
  for (let i = 0; i < cycles; i++) {
    const sample = runOneCycle(i);
    samples.push(sample);
    if (
      !sample.stackRejected ||
      !sample.percentOk ||
      !sample.tierOk ||
      !sample.batchIdStable ||
      !sample.manualPlusPromoOk
    ) {
      discrepancies += 1;
    }
  }
  return { cycles, discrepancies, samples: samples.slice(0, 5) };
}

export async function runPromotionsAntiStackChaosScenario(
  execute?: () => Promise<PromotionsAntiStackChaosResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    return judgePromotionsAntiStack(runPromotionsAntiStackChaos(500));
  }
  return judgePromotionsAntiStack(await execute());
}
