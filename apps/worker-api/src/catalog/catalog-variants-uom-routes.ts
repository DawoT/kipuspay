/** Sprint 31 — tenant-scoped Admin CRUD variantes/UOM (ADR-0015). */
/* eslint-disable complexity -- validación fail-closed de RBAC/flags/factor/tenant en handlers */
import {
  assertVariantTopology,
  normalizeUomCode,
  resolveVariantUnitPriceCents,
} from '@kipuspay/domain-inventory';
import type { WorkerEnv } from '../auth/control-plane.js';

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function flagOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function privileged(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'OWNER';
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'Catalog capability off', code: 'FEATURE_OFF' } };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function auditStatement(
  db: D1Database,
  tenantId: string,
  userId: string,
  action: 'VARIANT_CHANGE' | 'UOM_CHANGE',
  entityId: string,
  payload: Record<string, unknown>,
): Promise<D1PreparedStatement> {
  const previous = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const prevHash = previous?.row_hash ?? null;
  const rowHash = await sha256Hex(
    JSON.stringify({ action, entity_id: entityId, prev_hash: prevHash, payload }),
  );
  return db
    .prepare(
      `INSERT INTO audit_events (
         id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
         payload_json, prev_hash, row_hash
       ) VALUES (?, ?, NULL, ?, ?, 'products', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      userId,
      action,
      entityId,
      JSON.stringify(payload),
      prevHash,
      rowHash,
    );
}

export async function runListVariantsUomHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!flagOn(env?.FEATURE_CATALOG_VARIANTS) && !flagOn(env?.FEATURE_CATALOG_UOM)) {
    return featureOff();
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.sku, p.parent_product_id, p.variant_price_override_cents,
            p.is_sellable, p.price_cents AS variant_list_price_cents,
            parent.price_cents AS parent_list_price_cents,
            COALESCE((SELECT SUM(bps.stock_microunits) FROM branch_product_stock bps
                      WHERE bps.tenant_id = p.tenant_id AND bps.product_id = p.id),
                     p.stock_microunits) AS stock_microunits,
            MAX(CASE WHEN u.is_base = 1 THEN u.uom_code END) AS uom_code,
            json_group_array(
              json_object('id', u.id, 'uom_code', u.uom_code,
                          'factor_numerator', u.factor_numerator,
                          'factor_denominator', u.factor_denominator,
                          'is_base', u.is_base)
            ) FILTER (WHERE u.id IS NOT NULL) AS uoms_json
     FROM products p
     LEFT JOIN products parent
       ON parent.tenant_id = p.tenant_id AND parent.id = p.parent_product_id
     LEFT JOIN product_uoms u ON u.tenant_id = p.tenant_id AND u.product_id = p.id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY COALESCE(p.parent_product_id, p.id), p.parent_product_id, p.name`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      name: string;
      sku: string;
      parent_product_id: string | null;
      variant_price_override_cents: number | null;
      is_sellable: number;
      variant_list_price_cents: number;
      parent_list_price_cents: number | null;
      stock_microunits: number;
      uom_code: string | null;
      uoms_json: string | null;
    }>();
  const items = (results ?? []).map((row) => {
    const { variant_list_price_cents, parent_list_price_cents, uoms_json, ...rest } = row;
    let uoms: unknown[];
    try {
      uoms = uoms_json ? (JSON.parse(uoms_json) as unknown[]) : [];
    } catch {
      uoms = [];
    }
    return {
      ...rest,
      uoms,
      resolved_price_cents: resolveVariantUnitPriceCents({
        variantListPriceCents: variant_list_price_cents,
        parentListPriceCents: parent_list_price_cents,
        variantOverrideCents: row.variant_price_override_cents,
        parentCatalogPriceCents: variant_list_price_cents,
      }),
    };
  });
  return { status: 200, body: { items } };
}

export async function runUpdateVariantHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  productId: string,
  body: { parentProductId?: string | null; variantPriceOverrideCents?: number | null },
): Promise<HttpResult> {
  if (!flagOn(env?.FEATURE_CATALOG_VARIANTS)) return featureOff();
  if (!privileged(role)) return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  if (!tenantId || !userId || !productId.trim()) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const override = body.variantPriceOverrideCents ?? null;
  if (override !== null && (!Number.isSafeInteger(override) || override < 0)) {
    return { status: 422, body: { error: 'Invalid cents', code: 'INVALID_UNIT_PRICE' } };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const parent = body.parentProductId?.trim() || null;
  const prev = await env.DB.prepare(
    `SELECT parent_product_id FROM products
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(tenantId, productId)
    .first<{ parent_product_id: string | null }>();
  if (parent) {
    const target = prev;
    if (target?.parent_product_id) {
      return {
        status: 422,
        body: { error: 'Variant already linked', code: 'VARIANT_PARENT_INVALID' },
      };
    }
    const parentRow = await env.DB.prepare(
      `SELECT parent_product_id FROM products
       WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    )
      .bind(tenantId, parent)
      .first<{ parent_product_id: string | null }>();
    if (!parentRow) {
      return { status: 404, body: { error: 'Parent product not found', code: 'NOT_FOUND' } };
    }
    try {
      assertVariantTopology({
        productId,
        parentProductId: parent,
        parentHasParent: parentRow.parent_product_id !== null,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'VARIANT_TOPOLOGY_INVALID';
      return { status: 422, body: { error: 'Topology invalid', code } };
    }
    const hasChildren = await env.DB.prepare(
      `SELECT 1 FROM products WHERE tenant_id = ? AND parent_product_id = ? LIMIT 1`,
    )
      .bind(tenantId, productId)
      .first();
    if (hasChildren) {
      return {
        status: 422,
        body: { error: 'Product has variants', code: 'VARIANT_NESTING_FORBIDDEN' },
      };
    }
  }
  const mutation = env.DB.prepare(
    `UPDATE products
     SET parent_product_id = ?, variant_price_override_cents = ?,
         is_sellable = CASE WHEN ? IS NULL THEN is_sellable ELSE 1 END
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
  ).bind(parent, override, parent, tenantId, productId);
  const audit = await auditStatement(env.DB, tenantId, userId, 'VARIANT_CHANGE', productId, {
    parentProductId: parent,
    variantPriceOverrideCents: override,
  });
  const statements: (D1PreparedStatement | null)[] = [mutation];
  if (parent) {
    statements.push(
      env.DB.prepare(
        `UPDATE products SET is_sellable = 0
         WHERE tenant_id = ? AND id = ? AND parent_product_id IS NULL`,
      ).bind(tenantId, parent),
    );
  } else if (prev?.parent_product_id) {
    // Desvincular: el ex-padre vuelve a ser vendible si ya no tiene variantes.
    statements.push(
      env.DB.prepare(
        `UPDATE products
         SET is_sellable = 1
         WHERE tenant_id = ? AND id = ? AND is_sellable = 0
           AND NOT EXISTS (
             SELECT 1 FROM products c
             WHERE c.tenant_id = ? AND c.parent_product_id = ?
           )`,
      ).bind(tenantId, prev.parent_product_id, tenantId, prev.parent_product_id),
    );
  }
  statements.push(audit);
  await env.DB.batch(statements.filter((s): s is D1PreparedStatement => s !== null));
  return { status: 200, body: { productId } };
}

export async function runUpsertProductUomHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: {
    id?: string;
    productId?: string;
    uomCode?: string;
    factorNumerator?: number;
    factorDenominator?: number;
    isBase?: boolean;
  },
): Promise<HttpResult> {
  if (!flagOn(env?.FEATURE_CATALOG_UOM)) return featureOff();
  if (!privileged(role)) return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN' } };
  let uomCode: string;
  try {
    uomCode = normalizeUomCode(body.uomCode ?? '');
  } catch {
    return { status: 422, body: { error: 'Invalid UOM code', code: 'UOM_CODE_INVALID' } };
  }
  const numerator = body.factorNumerator ?? 0;
  const denominator = body.factorDenominator ?? 0;
  if (
    !Number.isSafeInteger(numerator) ||
    numerator <= 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0 ||
    (body.isBase === true && (numerator !== 1 || denominator !== 1))
  ) {
    return { status: 422, body: { error: 'Invalid UOM factor', code: 'UOM_FACTOR_INVALID' } };
  }
  const productId = body.productId?.trim() ?? '';
  if (!tenantId || !userId || !productId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const id = body.id?.trim() || crypto.randomUUID();
  const isBase = body.isBase === true ? 1 : 0;
  const statements: D1PreparedStatement[] = [];
  if (isBase) {
    statements.push(
      env.DB.prepare(
        `UPDATE product_uoms SET is_base = 0
         WHERE tenant_id = ? AND product_id = ? AND is_base = 1`,
      ).bind(tenantId, productId),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO product_uoms (
         id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, product_id, uom_code) DO UPDATE SET
         factor_numerator = excluded.factor_numerator,
         factor_denominator = excluded.factor_denominator,
         is_base = excluded.is_base`,
    ).bind(id, tenantId, productId, uomCode, numerator, denominator, isBase),
  );
  const audit = await auditStatement(env.DB, tenantId, userId, 'UOM_CHANGE', id, {
    productId,
    uomCode,
    factorNumerator: numerator,
    factorDenominator: denominator,
    isBase: body.isBase === true,
  });
  statements.push(audit);
  try {
    await env.DB.batch(statements);
  } catch {
    return { status: 422, body: { error: 'UOM base conflict', code: 'UOM_BASE_CONFLICT' } };
  }
  return { status: 200, body: { uomId: id } };
}
