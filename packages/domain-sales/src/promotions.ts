/**
 * Motor de promociones — Arquitectura §5.3 regla 15 / ADR-0014 / Sprint 30.
 * Puro: sin D1/Hono. El sale engine impone el precio; el cliente solo envía IDs.
 */
/* eslint-disable complexity -- matriz kind/stack/applies_to; split diferido */

export const PROMO_RULE_INVALID = 'PROMO_RULE_INVALID';
export const PROMO_STACK_FORBIDDEN = 'PROMO_STACK_FORBIDDEN';
export const PROMO_NOT_FOUND = 'PROMO_NOT_FOUND';
export const PROMO_INACTIVE = 'PROMO_INACTIVE';
export const PROMO_NOT_ELIGIBLE = 'PROMO_NOT_ELIGIBLE';
export const PROMO_EXPIRED = 'PROMO_EXPIRED';

export type PromoKind = 'buy_x_get_y' | 'percent' | 'threshold' | 'tier';
export type PromoAppliesTo = 'PRODUCT' | 'CATEGORY' | 'LIST' | 'CART';

export interface PromoRuleBuyXGetY {
  readonly kind: 'buy_x_get_y';
  readonly buyQty: number;
  readonly getQty: number;
}

export interface PromoRulePercent {
  readonly kind: 'percent';
  /** Entero 1..100 (porcentaje). */
  readonly percent: number;
}

export interface PromoRuleThreshold {
  readonly kind: 'threshold';
  readonly percent: number;
  readonly minQty?: number;
  readonly minAmountCents?: number;
}

export interface PromoTierBand {
  readonly minQty: number;
  readonly unitPriceCents: number;
}

export interface PromoRuleTier {
  readonly kind: 'tier';
  readonly tiers: readonly PromoTierBand[];
}

export type PromoRule = PromoRuleBuyXGetY | PromoRulePercent | PromoRuleThreshold | PromoRuleTier;

export interface MaxStackConfig {
  readonly maxCount: number;
  readonly compatibleKinds?: readonly PromoKind[];
}

export interface PromotionDef {
  readonly id: string;
  readonly active: boolean;
  readonly startsAtMs: number | null;
  readonly endsAtMs: number | null;
  readonly appliesTo: PromoAppliesTo;
  readonly rule: PromoRule;
  readonly maxStack: MaxStackConfig;
  /** Targets from product_promotions (empty = CART-wide). */
  readonly productIds: ReadonlySet<string>;
  readonly categoryIds: ReadonlySet<string>;
  readonly priceListIds: ReadonlySet<string>;
}

export interface PromoLineInput {
  readonly productId: string;
  readonly quantity: number;
  /** Precio unitario ya resuelto (catálogo o lista S18). */
  readonly unitPriceCents: number;
  readonly categoryId?: string | null;
  readonly priceListId?: string | null;
  readonly promotionIds?: readonly string[];
}

export interface PromoLineResult {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  /** Descuento de promoción (INTEGER cents); manual S17 va aparte. */
  readonly promoDiscountCents: number;
  readonly appliedPromotionIds: readonly string[];
}

function isPromoKind(v: unknown): v is PromoKind {
  return v === 'buy_x_get_y' || v === 'percent' || v === 'threshold' || v === 'tier';
}

function assertPosInt(n: unknown, code = PROMO_RULE_INVALID): asserts n is number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new Error(code);
}

function assertPercent(n: unknown): asserts n is number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 100) {
    throw new Error(PROMO_RULE_INVALID);
  }
}

/** Parsea rule_json tipado (ADR-0014). */
export function parsePromoRule(raw: unknown): PromoRule {
  if (raw === null || typeof raw !== 'object') throw new Error(PROMO_RULE_INVALID);
  const o = raw as Record<string, unknown>;
  if (!isPromoKind(o.kind)) throw new Error(PROMO_RULE_INVALID);

  if (o.kind === 'buy_x_get_y') {
    assertPosInt(o.buyQty);
    assertPosInt(o.getQty);
    return { kind: 'buy_x_get_y', buyQty: o.buyQty, getQty: o.getQty };
  }
  if (o.kind === 'percent') {
    assertPercent(o.percent);
    return { kind: 'percent', percent: o.percent };
  }
  if (o.kind === 'threshold') {
    assertPercent(o.percent);
    const minQty = o.minQty;
    const minAmountCents = o.minAmountCents;
    if (minQty === undefined && minAmountCents === undefined) {
      throw new Error(PROMO_RULE_INVALID);
    }
    if (minQty !== undefined) assertPosInt(minQty);
    if (minAmountCents !== undefined) {
      if (
        typeof minAmountCents !== 'number' ||
        !Number.isInteger(minAmountCents) ||
        minAmountCents < 0
      ) {
        throw new Error(PROMO_RULE_INVALID);
      }
    }
    return {
      kind: 'threshold',
      percent: o.percent,
      ...(minQty !== undefined ? { minQty } : {}),
      ...(minAmountCents !== undefined ? { minAmountCents } : {}),
    };
  }
  // tier
  if (!Array.isArray(o.tiers) || o.tiers.length === 0) throw new Error(PROMO_RULE_INVALID);
  const tiers: PromoTierBand[] = [];
  for (const t of o.tiers) {
    if (t === null || typeof t !== 'object') throw new Error(PROMO_RULE_INVALID);
    const band = t as Record<string, unknown>;
    assertPosInt(band.minQty);
    if (
      typeof band.unitPriceCents !== 'number' ||
      !Number.isInteger(band.unitPriceCents) ||
      band.unitPriceCents < 0
    ) {
      throw new Error(PROMO_RULE_INVALID);
    }
    tiers.push({ minQty: band.minQty, unitPriceCents: band.unitPriceCents });
  }
  tiers.sort((a, b) => a.minQty - b.minQty);
  return { kind: 'tier', tiers };
}

/** Parsea max_stack_json; `{}` ≡ { maxCount: 1 }. */
export function parseMaxStack(raw: unknown): MaxStackConfig {
  if (raw === null || raw === undefined) return { maxCount: 1 };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(PROMO_RULE_INVALID);
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0) return { maxCount: 1 };
  if (typeof o.maxCount !== 'number' || !Number.isInteger(o.maxCount) || o.maxCount < 1) {
    throw new Error(PROMO_RULE_INVALID);
  }
  let compatibleKinds: PromoKind[] | undefined;
  if (o.compatibleKinds !== undefined) {
    if (!Array.isArray(o.compatibleKinds) || o.compatibleKinds.length === 0) {
      throw new Error(PROMO_RULE_INVALID);
    }
    compatibleKinds = [];
    for (const k of o.compatibleKinds) {
      if (!isPromoKind(k)) throw new Error(PROMO_RULE_INVALID);
      compatibleKinds.push(k);
    }
  }
  return {
    maxCount: o.maxCount,
    ...(compatibleKinds ? { compatibleKinds } : {}),
  };
}

export function parsePromoRuleJson(json: string): PromoRule {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error(PROMO_RULE_INVALID);
  }
  return parsePromoRule(parsed);
}

export function parseMaxStackJson(json: string): MaxStackConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error(PROMO_RULE_INVALID);
  }
  return parseMaxStack(parsed);
}

function assertStack(promos: readonly PromotionDef[]): void {
  if (promos.length === 0) return;
  let maxCount = Infinity;
  let compatible: Set<PromoKind> | null = null;
  for (const p of promos) {
    maxCount = Math.min(maxCount, p.maxStack.maxCount);
    if (p.maxStack.compatibleKinds) {
      const set = new Set<PromoKind>([...p.maxStack.compatibleKinds]);
      if (compatible === null) {
        compatible = set;
      } else {
        const next = new Set<PromoKind>();
        for (const kind of compatible) {
          if (set.has(kind)) next.add(kind);
        }
        compatible = next;
      }
    }
  }
  if (promos.length > maxCount) throw new Error(PROMO_STACK_FORBIDDEN);
  if (compatible) {
    for (const p of promos) {
      if (!compatible.has(p.rule.kind)) throw new Error(PROMO_STACK_FORBIDDEN);
    }
  }
}

function isEligible(promo: PromotionDef, line: PromoLineInput, nowMs: number): void {
  if (!promo.active) throw new Error(PROMO_INACTIVE);
  if (promo.startsAtMs !== null && nowMs < promo.startsAtMs) throw new Error(PROMO_EXPIRED);
  if (promo.endsAtMs !== null && nowMs > promo.endsAtMs) throw new Error(PROMO_EXPIRED);

  switch (promo.appliesTo) {
    case 'CART':
      return;
    case 'PRODUCT':
      if (!promo.productIds.has(line.productId)) throw new Error(PROMO_NOT_ELIGIBLE);
      return;
    case 'CATEGORY':
      if (!line.categoryId || !promo.categoryIds.has(line.categoryId)) {
        throw new Error(PROMO_NOT_ELIGIBLE);
      }
      return;
    case 'LIST':
      if (!line.priceListId || !promo.priceListIds.has(line.priceListId)) {
        throw new Error(PROMO_NOT_ELIGIBLE);
      }
      return;
    default:
      throw new Error(PROMO_RULE_INVALID);
  }
}

function applyOneRule(
  rule: PromoRule,
  quantity: number,
  unitPriceCents: number,
): { unitPriceCents: number; promoDiscountCents: number } {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error('INVALID_UNIT_PRICE');
  }
  const lineGrossCents = Math.round(quantity * unitPriceCents);

  if (rule.kind === 'percent') {
    const promoDiscountCents = Math.round((lineGrossCents * rule.percent) / 100);
    return { unitPriceCents, promoDiscountCents };
  }

  if (rule.kind === 'buy_x_get_y') {
    const group = rule.buyQty + rule.getQty;
    const freeUnits = Math.floor(quantity / group) * rule.getQty;
    const promoDiscountCents = Math.round(freeUnits * unitPriceCents);
    return { unitPriceCents, promoDiscountCents };
  }

  if (rule.kind === 'threshold') {
    const amountOk = rule.minAmountCents === undefined || lineGrossCents >= rule.minAmountCents;
    const qtyOk = rule.minQty === undefined || quantity + 1e-9 >= rule.minQty;
    if (!amountOk || !qtyOk) {
      return { unitPriceCents, promoDiscountCents: 0 };
    }
    const promoDiscountCents = Math.round((lineGrossCents * rule.percent) / 100);
    return { unitPriceCents, promoDiscountCents };
  }

  // tier: highest minQty band that quantity meets
  let chosen = unitPriceCents;
  for (const band of rule.tiers) {
    if (quantity + 1e-9 >= band.minQty) chosen = band.unitPriceCents;
  }
  return { unitPriceCents: chosen, promoDiscountCents: 0 };
}

/**
 * Aplica promociones por línea. Stack se valida sobre el conjunto de IDs de la línea.
 * Varias promos en la misma línea: se aplican en orden; descuentos se suman;
 * tier ajusta unit price antes de % posteriores.
 */
export function assertAndApplyPromotions(input: {
  readonly lines: readonly PromoLineInput[];
  readonly promotionsById: ReadonlyMap<string, PromotionDef>;
  readonly nowMs: number;
}): readonly PromoLineResult[] {
  const out: PromoLineResult[] = [];

  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error('INVALID_QUANTITY');
    }
    const ids = line.promotionIds ?? [];
    if (ids.length === 0) {
      out.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        promoDiscountCents: 0,
        appliedPromotionIds: [],
      });
      continue;
    }

    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
    }

    const promos: PromotionDef[] = [];
    for (const id of uniqueIds) {
      const promo = input.promotionsById.get(id);
      if (!promo) throw new Error(PROMO_NOT_FOUND);
      isEligible(promo, line, input.nowMs);
      promos.push(promo);
    }

    assertStack(promos);

    let unitPriceCents = line.unitPriceCents;
    let promoDiscountCents = 0;
    for (const promo of promos) {
      const applied = applyOneRule(promo.rule, line.quantity, unitPriceCents);
      unitPriceCents = applied.unitPriceCents;
      promoDiscountCents += applied.promoDiscountCents;
    }

    const grossCents = Math.round(line.quantity * unitPriceCents);
    if (promoDiscountCents > grossCents) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');

    out.push({
      productId: line.productId,
      quantity: line.quantity,
      unitPriceCents,
      promoDiscountCents,
      appliedPromotionIds: uniqueIds,
    });
  }

  return out;
}
