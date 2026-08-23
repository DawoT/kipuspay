/**
 * Sprint 30 — CRUD promociones + audit PROMOTION_CHANGE (FEATURE_PRICING_PROMOTIONS).
 */
/* eslint-disable complexity -- CRUD create/update con validación rule/stack; split diferido */
import { auditChainClaimStatements, readAuditChainHead } from '@kipuspay/adapters-d1';
import { parseMaxStackJson, parsePromoRuleJson, PROMO_RULE_INVALID } from '@kipuspay/domain-sales';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isPricingPromotionsEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_PRICING_PROMOTIONS === '1' || env?.FEATURE_PRICING_PROMOTIONS === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_PRICING_PROMOTIONS off', code: 'FEATURE_OFF' },
  };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const APPLIES = new Set(['PRODUCT', 'CATEGORY', 'LIST', 'CART']);

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function asJsonObject(
  raw: string | Record<string, unknown> | undefined,
  fallback: unknown,
): unknown {
  if (raw === undefined) return fallback;
  if (typeof raw === 'string') return JSON.parse(raw) as unknown;
  return raw;
}

function validateRuleAndStack(
  ruleJson: string | Record<string, unknown> | undefined,
  maxStackJson: string | Record<string, unknown> | undefined,
): { ok: true; ruleJsonStr: string; maxStackJsonStr: string } | { ok: false; result: HttpResult } {
  try {
    const ruleRaw = asJsonObject(ruleJson, null);
    const stackRaw = asJsonObject(maxStackJson, {});
    parsePromoRuleJson(JSON.stringify(ruleRaw));
    parseMaxStackJson(JSON.stringify(stackRaw ?? {}));
    return {
      ok: true,
      ruleJsonStr: JSON.stringify(ruleRaw),
      maxStackJsonStr: JSON.stringify(stackRaw ?? {}),
    };
  } catch {
    return {
      ok: false,
      result: { status: 422, body: { error: PROMO_RULE_INVALID, code: PROMO_RULE_INVALID } },
    };
  }
}

interface BuiltPromoAudit {
  readonly statement: D1PreparedStatement;
  readonly prevHash: string | null;
  readonly rowHash: string;
}

async function buildPromotionAudit(
  db: D1Database,
  tenantId: string,
  userId: string,
  promotionId: string,
  payload: Record<string, unknown>,
): Promise<BuiltPromoAudit> {
  const prevHash = await readAuditChainHead(db, tenantId);
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: 'PROMOTION_CHANGE',
      entity_id: promotionId,
      prev_hash: prevHash,
      payload,
    }),
  );
  const statement = db
    .prepare(
      `INSERT INTO audit_events (
         id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
         payload_json, prev_hash, row_hash
       ) VALUES (?, ?, NULL, ?, 'PROMOTION_CHANGE', 'promotions', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      userId,
      promotionId,
      JSON.stringify(payload),
      prevHash,
      rowHash,
    );
  return { statement, prevHash, rowHash };
}

function promotionAuditClaims(
  db: D1Database,
  tenantId: string,
  audit: BuiltPromoAudit,
): readonly D1PreparedStatement[] {
  return auditChainClaimStatements(db, tenantId, audit.prevHash, [audit.rowHash]);
}

function targetInserts(
  db: D1Database,
  tenantId: string,
  promoId: string,
  productIds: readonly string[],
  categoryIds: readonly string[],
  priceListIds: readonly string[],
) {
  const stmts = [];
  for (const productId of productIds) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_promotions (id, tenant_id, promotion_id, product_id, category_id, price_list_id)
           VALUES (?, ?, ?, ?, NULL, NULL)`,
        )
        .bind(crypto.randomUUID(), tenantId, promoId, productId),
    );
  }
  for (const categoryId of categoryIds) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_promotions (id, tenant_id, promotion_id, product_id, category_id, price_list_id)
           VALUES (?, ?, ?, NULL, ?, NULL)`,
        )
        .bind(crypto.randomUUID(), tenantId, promoId, categoryId),
    );
  }
  for (const priceListId of priceListIds) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO product_promotions (id, tenant_id, promotion_id, product_id, category_id, price_list_id)
           VALUES (?, ?, ?, NULL, NULL, ?)`,
        )
        .bind(crypto.randomUUID(), tenantId, promoId, priceListId),
    );
  }
  return stmts;
}

export async function runCreatePromotionHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    name?: string;
    appliesTo?: string;
    ruleJson?: string | Record<string, unknown>;
    maxStackJson?: string | Record<string, unknown>;
    startsAt?: string | null;
    endsAt?: string | null;
    productIds?: readonly string[];
    categoryIds?: readonly string[];
    priceListIds?: readonly string[];
  },
): Promise<HttpResult> {
  if (!isPricingPromotionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const name = body.name?.trim() ?? '';
  const appliesTo = (body.appliesTo ?? '').trim().toUpperCase();
  if (!name || !APPLIES.has(appliesTo)) {
    return {
      status: 400,
      body: { error: 'name and appliesTo required', code: 'BAD_REQUEST' },
    };
  }

  const validated = validateRuleAndStack(body.ruleJson, body.maxStackJson);
  if (!validated.ok) return validated.result;

  const id = crypto.randomUUID();
  const insertPromo = env.DB.prepare(
    `INSERT INTO promotions (
         id, tenant_id, name, active, starts_at, ends_at, applies_to,
         rule_json, max_stack_json, created_by_user_id
       ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    tenantId,
    name,
    body.startsAt ?? null,
    body.endsAt ?? null,
    appliesTo,
    validated.ruleJsonStr,
    validated.maxStackJsonStr,
    userId,
  );
  const promoAudit = await buildPromotionAudit(env.DB, tenantId, userId, id, {
    op: 'create',
    name,
    appliesTo,
  });
  const stmts = [
    insertPromo,
    ...targetInserts(
      env.DB,
      tenantId,
      id,
      body.productIds ?? [],
      body.categoryIds ?? [],
      body.priceListIds ?? [],
    ),
    promoAudit.statement,
    ...promotionAuditClaims(env.DB, tenantId, promoAudit),
  ];

  await env.DB.batch(stmts);
  return { status: 200, body: { promotionId: id } };
}

export async function runUpdatePromotionHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  promotionId: string,
  body: {
    name?: string;
    active?: boolean;
    ruleJson?: string | Record<string, unknown>;
    maxStackJson?: string | Record<string, unknown>;
    startsAt?: string | null;
    endsAt?: string | null;
  },
): Promise<HttpResult> {
  if (!isPricingPromotionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId || !promotionId.trim()) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM promotions WHERE tenant_id = ? AND id = ? LIMIT 1`,
  )
    .bind(tenantId, promotionId)
    .first<{ id: string }>();
  if (!existing) {
    return { status: 404, body: { error: 'Promotion not found', code: 'NOT_FOUND' } };
  }

  let ruleJsonStr: string | null = null;
  let maxStackJsonStr: string | null = null;
  if (body.ruleJson !== undefined) {
    const validated = validateRuleAndStack(body.ruleJson, {});
    if (!validated.ok) return validated.result;
    ruleJsonStr = validated.ruleJsonStr;
  }
  if (body.maxStackJson !== undefined) {
    try {
      const stackRaw = asJsonObject(body.maxStackJson, {});
      parseMaxStackJson(JSON.stringify(stackRaw ?? {}));
      maxStackJsonStr = JSON.stringify(stackRaw ?? {});
    } catch {
      return { status: 422, body: { error: PROMO_RULE_INVALID, code: PROMO_RULE_INVALID } };
    }
  }

  const updateAudit = await buildPromotionAudit(env.DB, tenantId, userId, promotionId, {
    op: 'update',
  });
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE promotions SET
         name = COALESCE(?, name),
         active = COALESCE(?, active),
         rule_json = COALESCE(?, rule_json),
         max_stack_json = COALESCE(?, max_stack_json),
         starts_at = CASE WHEN ? = 1 THEN ? ELSE starts_at END,
         ends_at = CASE WHEN ? = 1 THEN ? ELSE ends_at END
       WHERE tenant_id = ? AND id = ?`,
    ).bind(
      body.name?.trim() || null,
      body.active === undefined ? null : body.active ? 1 : 0,
      ruleJsonStr,
      maxStackJsonStr,
      body.startsAt !== undefined ? 1 : 0,
      body.startsAt ?? null,
      body.endsAt !== undefined ? 1 : 0,
      body.endsAt ?? null,
      tenantId,
      promotionId,
    ),
    updateAudit.statement,
    ...promotionAuditClaims(env.DB, tenantId, updateAudit),
  ]);

  return { status: 200, body: { promotionId } };
}

export async function runListPromotionsHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isPricingPromotionsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const rows = await env.DB.prepare(
    `SELECT id, name, active, applies_to, rule_json, max_stack_json, starts_at, ends_at, created_at
     FROM promotions
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      name: string;
      active: number;
      applies_to: string;
      rule_json: string;
      max_stack_json: string;
      starts_at: string | null;
      ends_at: string | null;
      created_at: string;
    }>();

  return {
    status: 200,
    body: {
      promotions: (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        active: r.active === 1,
        appliesTo: r.applies_to,
        ruleJson: r.rule_json,
        maxStackJson: r.max_stack_json,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        createdAt: r.created_at,
      })),
    },
  };
}
