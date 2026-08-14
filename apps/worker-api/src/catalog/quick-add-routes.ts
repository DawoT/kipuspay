/**
 * Sprint 50 — catalog.quick_add (Arquitectura §5.3 regla 34).
 *
 * - POST /api/catalog/quick-add: upsert por barcode (sin duplicar, índice único
 *   0042). Producto existente → 200 (para editar stock/precio); nuevo → 201 en
 *   ~3s con audit `QUICK_ADD`. El namespace `EMP-` jamás crea producto.
 * - GET /api/catalog/scan/:raw: lector compartido (regla 34/36) — dígitos →
 *   producto por barcode; `EMP-12345` → vendedor por badge_barcode (edge 1A).
 *
 * Gating: flag default-off → 404; rol owner/admin. El tenant viene del JWT.
 */
import { classifyScan, isReservedBarcode } from '@kipuspay/domain-catalog';

export interface QuickAddEnv {
  readonly FEATURE_CATALOG_QUICK_ADD?: string;
  readonly DB?: unknown;
}

export interface QuickAddActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export function isQuickAddEnabled(env: QuickAddEnv | undefined): boolean {
  return env?.FEATURE_CATALOG_QUICK_ADD === '1';
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

function result(status: number, body: Record<string, unknown>): HttpResult {
  return { status, body };
}

interface ProductRow {
  readonly id: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly name: string;
  readonly price_cents: number;
  readonly product_type: string;
}

interface VendorRow {
  readonly id: string;
  readonly name?: string | null;
}

interface AuditDb {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
  batch(statements: readonly unknown[]): Promise<unknown>;
}

type Db = AuditDb;

// eslint-disable-next-line complexity -- quick add: barcode × policy × create/existing branches
export async function runQuickAddHttp(
  env: QuickAddEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isQuickAddEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env.DB) return result(503, { code: 'QUICK_ADD_DB_UNAVAILABLE' });
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) return result(403, { code: 'FORBIDDEN' });
  const barcode = typeof body.barcode === 'string' ? body.barcode.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const priceCents = body.priceCents;
  if (
    !barcode ||
    !name ||
    typeof priceCents !== 'number' ||
    !Number.isSafeInteger(priceCents) ||
    priceCents < 0
  ) {
    return result(400, {
      code: 'BAD_REQUEST',
      error: 'barcode, name and priceCents (integer) required',
    });
  }
  if (isReservedBarcode(barcode)) {
    return result(422, { code: 'RESERVED_BARCODE', error: 'EMP- es namespace de vendedores' });
  }
  if (classifyScan(barcode) !== 'PRODUCT_SCOPE') {
    return result(422, { code: 'UNSUPPORTED_BARCODE' });
  }

  const db = env.DB as Db;
  const existing = await db
    .prepare(
      `SELECT id, sku, barcode, name, price_cents, product_type FROM products
             WHERE tenant_id = ? AND barcode = ? LIMIT 1`,
    )
    .bind(actor.tenantId, barcode)
    .first<ProductRow>();
  if (existing) {
    return result(200, { product: existing, created: false });
  }

  const productId = crypto.randomUUID();
  // S50-H1: INSERT + audit en UN solo batch (atómico, invariante 2) y el
  // UNIQUE del barcode se maneja como 200 (producto ya creado), jamás 500.
  try {
    const auditStmt = await buildQuickAddAuditStatement(db, actor, {
      productId,
      barcode,
      name,
      priceCents,
    });
    await db.batch([
      db
        .prepare(
          `INSERT INTO products (
             id, tenant_id, sku, barcode, name, product_type, unit_code, price_cents,
             cost_cents, igv_affectation_code_default
           ) VALUES (?, ?, ?, ?, ?, 'physical', 'NIU', ?, 0, '10')`,
        )
        .bind(productId, actor.tenantId, `QUICK-${barcode}`, barcode, name, priceCents),
      auditStmt,
    ]);
  } catch (cause) {
    if (cause instanceof Error && /UNIQUE|constraint/i.test(cause.message)) {
      const existingAfter = await db
        .prepare(
          `SELECT id, sku, barcode, name, price_cents, product_type FROM products
                  WHERE tenant_id = ? AND barcode = ? LIMIT 1`,
        )
        .bind(actor.tenantId, barcode)
        .first<ProductRow>();
      if (existingAfter) return result(200, { product: existingAfter, created: false });
    }
    throw cause;
  }
  return result(201, {
    product: {
      id: productId,
      sku: `QUICK-${barcode}`,
      barcode,
      name,
      price_cents: priceCents,
      product_type: 'physical',
    },
    created: true,
  });
}

export async function runScanLookupHttp(
  env: QuickAddEnv,
  actor: QuickAddActor,
  raw: string,
): Promise<HttpResult> {
  if (!isQuickAddEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env.DB) return result(503, { code: 'QUICK_ADD_DB_UNAVAILABLE' });
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) return result(403, { code: 'FORBIDDEN' });
  const scope = classifyScan(raw);
  const db = env.DB as Db;
  if (scope === 'PRODUCT_SCOPE') {
    const product = await db
      .prepare(
        `SELECT id, sku, barcode, name, price_cents, product_type FROM products
               WHERE tenant_id = ? AND barcode = ? LIMIT 1`,
      )
      .bind(actor.tenantId, raw)
      .first<ProductRow>();
    return product
      ? result(200, { scope, kind: 'product', product })
      : result(404, { code: 'NOT_FOUND' });
  }
  if (scope === 'VENDOR_SCOPE') {
    const vendor = await db
      .prepare(`SELECT id, name FROM users WHERE tenant_id = ? AND badge_barcode = ? LIMIT 1`)
      .bind(actor.tenantId, raw)
      .first<VendorRow>();
    return vendor
      ? result(200, { scope, kind: 'vendor', vendor })
      : result(404, { code: 'NOT_FOUND' });
  }
  return result(422, { code: 'UNSUPPORTED_SCAN' });
}

async function buildQuickAddAuditStatement(
  db: Db,
  actor: QuickAddActor,
  input: {
    readonly productId: string;
    readonly barcode: string;
    readonly name: string;
    readonly priceCents: number;
  },
) {
  const tail = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(actor.tenantId)
    .first<{ row_hash: string }>();
  const previous = tail?.row_hash ?? null;
  const payloadJson = JSON.stringify({
    productId: input.productId,
    barcode: input.barcode,
    name: input.name,
    priceCents: input.priceCents,
  });
  const rowHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify({ action: 'QUICK_ADD', payloadJson, prev: previous }),
        ),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return db
    .prepare(
      `INSERT INTO audit_events (
         id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
         payload_json, prev_hash, row_hash
       ) VALUES (?, ?, NULL, ?, 'QUICK_ADD', 'product', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.tenantId,
      actor.userId,
      input.productId,
      payloadJson,
      previous,
      rowHash,
    );
}
