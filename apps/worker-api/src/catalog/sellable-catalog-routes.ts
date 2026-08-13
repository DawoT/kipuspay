/** Sprint C1 — catálogo vendible para la terminal del POS (grid + buscador). */
import { resolveVariantUnitPriceCents } from '@kipuspay/domain-inventory';
import type { WorkerEnv } from '../auth/control-plane.js';

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function flagOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function featureOff(): HttpResult {
  return { status: 404, body: { error: 'Catalog capability off', code: 'FEATURE_OFF' } };
}

interface SellableRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  product_type: string;
  price_cents: number;
  cost_cents: number;
  variant_price_override_cents: number | null;
  parent_product_id: string | null;
  charges_icbper: number;
  list_price_cents: number | null;
  parent_list_price_cents: number | null;
  stock_microunits: number;
  uom_code: string | null;
}

export async function runListSellableCatalogHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  branchId: string,
): Promise<HttpResult> {
  if (!flagOn(env?.FEATURE_CATALOG_SELLABLE)) return featureOff();
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!tenantId) return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  const branch = branchId.trim();
  const { results } = await env.DB.prepare(
    `WITH effective AS (
       SELECT COALESCE(
         (SELECT price_list_id FROM branches WHERE tenant_id = ? AND id = ?),
         (SELECT id FROM price_lists
          WHERE tenant_id = ? AND is_default = 1 AND is_active = 1
            AND deleted_at IS NULL ORDER BY created_at DESC, id LIMIT 1)
       ) AS id
     )
     SELECT p.id, p.sku, p.barcode, p.name, p.product_type,
            p.price_cents, p.cost_cents, p.variant_price_override_cents,
            p.parent_product_id, p.charges_icbper,
            pp.price_cents AS list_price_cents,
            pparent.price_cents AS parent_list_price_cents,
            COALESCE((
              SELECT SUM(bps.stock_microunits) FROM branch_product_stock bps
              WHERE bps.tenant_id = p.tenant_id AND bps.product_id = p.id
                AND (? = '' OR bps.branch_id = ?)
            ), p.stock_microunits) AS stock_microunits,
            MAX(CASE WHEN u.is_base = 1 THEN u.uom_code END) AS uom_code
     FROM products p
     LEFT JOIN effective s ON 1 = 1
     LEFT JOIN product_prices pp
       ON pp.tenant_id = p.tenant_id AND pp.price_list_id = s.id AND pp.product_id = p.id
     LEFT JOIN products parent
       ON parent.tenant_id = p.tenant_id AND parent.id = p.parent_product_id
     LEFT JOIN product_prices pparent
       ON pparent.tenant_id = p.tenant_id AND pparent.price_list_id = s.id
          AND pparent.product_id = p.parent_product_id
     LEFT JOIN product_uoms u ON u.tenant_id = p.tenant_id AND u.product_id = p.id
     WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.is_active = 1 AND p.is_sellable = 1
     GROUP BY p.id
     ORDER BY p.name`,
  )
    .bind(branch, branch, tenantId, branch, branch, tenantId)
    .all<SellableRow>();
  const items = (results ?? []).map((row) => {
    const unitPriceCents = row.parent_product_id
      ? resolveVariantUnitPriceCents({
          variantListPriceCents: row.list_price_cents ?? row.price_cents,
          parentListPriceCents: row.parent_list_price_cents,
          variantOverrideCents: row.variant_price_override_cents,
          parentCatalogPriceCents: row.price_cents,
        })
      : (row.list_price_cents ?? row.price_cents);
    return {
      productId: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      productType: row.product_type,
      unitPriceCents,
      costCents: row.cost_cents,
      stockMicrounits: row.stock_microunits,
      uomCode: row.uom_code,
      parentProductId: row.parent_product_id,
      chargesIcbper: row.charges_icbper === 1,
    };
  });
  return { status: 200, body: { items } };
}
