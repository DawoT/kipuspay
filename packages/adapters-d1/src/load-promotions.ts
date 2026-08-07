/**
 * Carga promociones D1 para el sale engine (Sprint 30 / ADR-0014).
 */
import {
  parseMaxStackJson,
  parsePromoRuleJson,
  type PromoAppliesTo,
  type PromotionDef,
} from '@kipuspay/domain-sales';
import type { D1DatabaseLike } from './index.js';

function asAppliesTo(v: string): PromoAppliesTo {
  if (v === 'PRODUCT' || v === 'CATEGORY' || v === 'LIST' || v === 'CART') return v;
  throw new Error('PROMO_RULE_INVALID');
}

function parseMs(v: string | null): number | null {
  if (!v) return null;
  const ms = Date.parse(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isFinite(ms) ? ms : null;
}

export async function loadPromotionsByIds(
  db: D1DatabaseLike,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, PromotionDef>> {
  const unique = [...new Set(ids.filter((id) => id.trim()))];
  const out = new Map<string, PromotionDef>();
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => '?').join(',');
  const promoRows = await db
    .prepare(
      `SELECT id, active, starts_at, ends_at, applies_to, rule_json, max_stack_json
       FROM promotions
       WHERE tenant_id = ? AND id IN (${placeholders})`,
    )
    .bind(tenantId, ...unique)
    .all<{
      id: string;
      active: number;
      starts_at: string | null;
      ends_at: string | null;
      applies_to: string;
      rule_json: string;
      max_stack_json: string;
    }>();

  const targetRows = await db
    .prepare(
      `SELECT promotion_id, product_id, category_id, price_list_id
       FROM product_promotions
       WHERE tenant_id = ? AND promotion_id IN (${placeholders})`,
    )
    .bind(tenantId, ...unique)
    .all<{
      promotion_id: string;
      product_id: string | null;
      category_id: string | null;
      price_list_id: string | null;
    }>();

  const targetsByPromo = new Map<
    string,
    { products: Set<string>; categories: Set<string>; lists: Set<string> }
  >();
  for (const t of targetRows.results ?? []) {
    let bucket = targetsByPromo.get(t.promotion_id);
    if (!bucket) {
      bucket = { products: new Set(), categories: new Set(), lists: new Set() };
      targetsByPromo.set(t.promotion_id, bucket);
    }
    if (t.product_id) bucket.products.add(t.product_id);
    if (t.category_id) bucket.categories.add(t.category_id);
    if (t.price_list_id) bucket.lists.add(t.price_list_id);
  }

  for (const row of promoRows.results ?? []) {
    const targets = targetsByPromo.get(row.id) ?? {
      products: new Set<string>(),
      categories: new Set<string>(),
      lists: new Set<string>(),
    };
    out.set(row.id, {
      id: row.id,
      active: row.active === 1,
      startsAtMs: parseMs(row.starts_at),
      endsAtMs: parseMs(row.ends_at),
      appliesTo: asAppliesTo(row.applies_to),
      rule: parsePromoRuleJson(row.rule_json),
      maxStack: parseMaxStackJson(row.max_stack_json || '{}'),
      productIds: targets.products,
      categoryIds: targets.categories,
      priceListIds: targets.lists,
    });
  }

  return out;
}
