/* Sprint 41 — server-authoritative price-label snapshots and lifecycle. */

import {
  compilePriceLabelTemplate,
  encodePriceLabelBarcode,
  hashPriceLabelPayload,
  validatePriceLabelTemplate,
  type PriceLabelBarcodeType,
  type PriceLabelSnapshot,
} from '@kipuspay/print-templates';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

const MAX_PRODUCTS = 100;
const MAX_COPIES = 20;
const MAX_ITEMS = 500;
const SAFE_ERROR = 'PRICE_LABEL_SCOPE_MISMATCH';

interface TemplateInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly templateKey: string;
  readonly name: string;
  readonly template: unknown;
  readonly paperWidthMm: 58 | 80;
}

export interface PriceLabelBatchProduct {
  readonly productId: string;
  readonly copies: number;
}

export interface CreatePriceLabelBatchInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly terminalId?: string;
  readonly templateId: string;
  readonly priceListId?: string;
  readonly products: readonly PriceLabelBatchProduct[];
  readonly idempotencyKey: string;
  readonly reprintOfBatchId?: string;
}

export interface PriceLabelBatchItemResult {
  readonly itemId: string;
  readonly productId: string;
  readonly ordinal: number;
  readonly productName: string;
  readonly priceCents: number;
  readonly barcodeType: PriceLabelBarcodeType;
  readonly barcodeValue: string;
  readonly templateVersion: number;
  readonly priceSource: 'PRICE_LIST' | 'PRODUCT_DEFAULT';
  readonly resolvedAt: string;
  readonly resolutionVersion: string;
  readonly renderedPayloadHash: string;
  readonly renderedPayloadHex: string;
  readonly status: 'PENDING' | 'ACKED' | 'FAILED';
}

export interface PriceLabelBatchResult {
  readonly batchId: string;
  readonly branchId: string;
  readonly templateId: string;
  readonly priceListId: string;
  readonly priceListIdentity: 'EXPLICIT' | 'BRANCH_DEFAULT' | 'TENANT_DEFAULT';
  readonly reprintOfBatchId: string | null;
  readonly snapshotHash: string;
  readonly status: 'PENDING' | 'PRINTING' | 'PARTIAL' | 'ACKED' | 'FAILED';
  readonly items: readonly PriceLabelBatchItemResult[];
}

interface ScopeRow {
  branch_id: string;
  branch_price_list_id: string | null;
  actor_ok: number;
}

interface TemplateRow {
  id: string;
  template_key: string;
  version: number;
  template_json: string;
  paper_width_mm: 58 | 80;
  status: string;
  latest_version: number;
}

interface PriceListRow {
  id: string;
  identity: 'EXPLICIT' | 'BRANCH_DEFAULT' | 'TENANT_DEFAULT';
}

interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  product_version: number;
  base_price_cents: number;
  list_price_cents: number | null;
  price_rowid: number | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertExactInputKeys(input: object, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error('PRICE_LABEL_UNTRUSTED_FIELD');
  }
}

function assertTemplateInput(input: TemplateInput): void {
  assertExactInputKeys(input, [
    'tenantId',
    'actorUserId',
    'templateKey',
    'name',
    'template',
    'paperWidthMm',
  ]);
  if (
    !text(input.tenantId) ||
    !text(input.actorUserId) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(text(input.templateKey)) ||
    !text(input.name) ||
    text(input.name).length > 120 ||
    (input.paperWidthMm !== 58 && input.paperWidthMm !== 80)
  ) {
    throw new Error('PRICE_LABEL_TEMPLATE_INVALID');
  }
  validatePriceLabelTemplate(input.template);
}

async function assertTemplateActor(db: D1DatabaseLike, tenantId: string, actorUserId: string) {
  const actor = await db
    .prepare(
      `SELECT id FROM users
       WHERE tenant_id = ? AND id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(tenantId, actorUserId)
    .first<{ id: string }>();
  if (!actor) throw new Error(SAFE_ERROR);
}

async function insertTemplateVersion(
  db: D1DatabaseLike,
  input: TemplateInput,
  requireExisting: boolean,
): Promise<{ readonly templateId: string; readonly version: number }> {
  assertTemplateInput(input);
  await assertTemplateActor(db, input.tenantId, input.actorUserId);
  const latest = await db
    .prepare(
      `SELECT version FROM price_label_templates
       WHERE tenant_id = ? AND template_key = ? ORDER BY version DESC LIMIT 1`,
    )
    .bind(input.tenantId, input.templateKey)
    .first<{ version: number }>();
  if (requireExisting !== Boolean(latest)) {
    throw new Error(
      requireExisting ? 'PRICE_LABEL_TEMPLATE_NOT_FOUND' : 'PRICE_LABEL_TEMPLATE_EXISTS',
    );
  }
  const version = (latest?.version ?? 0) + 1;
  const templateId = crypto.randomUUID();
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 WHERE COALESCE((
         SELECT MAX(version) FROM price_label_templates
         WHERE tenant_id = ? AND template_key = ?
       ), 0) = ?`,
      [input.tenantId, input.templateKey, version - 1],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO price_label_templates (
             id, tenant_id, template_key, version, name, dsl_version, template_json,
             paper_width_mm, status, created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, 'PRICE_LABEL_V1', ?, ?, 'ACTIVE', ?)`,
        )
        .bind(
          templateId,
          input.tenantId,
          input.templateKey,
          version,
          input.name.trim(),
          JSON.stringify(validatePriceLabelTemplate(input.template)),
          input.paperWidthMm,
          input.actorUserId,
        ),
    );
  });
  return { templateId, version };
}

export function createPriceLabelTemplate(
  db: D1DatabaseLike,
  input: TemplateInput,
): Promise<{ readonly templateId: string; readonly version: number }> {
  return insertTemplateVersion(db, input, false);
}

export function versionPriceLabelTemplate(
  db: D1DatabaseLike,
  input: TemplateInput,
): Promise<{ readonly templateId: string; readonly version: number }> {
  return insertTemplateVersion(db, input, true);
}

export async function retirePriceLabelTemplate(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly actorUserId: string; readonly templateId: string },
): Promise<{ readonly templateId: string; readonly status: 'RETIRED' }> {
  assertExactInputKeys(input, ['tenantId', 'actorUserId', 'templateId']);
  await assertTemplateActor(db, input.tenantId, input.actorUserId);
  const template = await db
    .prepare(
      `SELECT id FROM price_label_templates
       WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE' LIMIT 1`,
    )
    .bind(input.tenantId, input.templateId)
    .first<{ id: string }>();
  if (!template) throw new Error('PRICE_LABEL_TEMPLATE_NOT_FOUND');
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE price_label_templates SET status = 'RETIRED'
           WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'`,
        )
        .bind(input.tenantId, input.templateId),
    );
  });
  return { templateId: input.templateId, status: 'RETIRED' };
}

export async function listPriceLabelTemplates(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly includeRetired?: boolean },
): Promise<readonly Record<string, unknown>[]> {
  const query = input.includeRetired
    ? db
        .prepare(
          `SELECT id, template_key, version, name, dsl_version, template_json,
                  paper_width_mm, status, created_at
           FROM price_label_templates WHERE tenant_id = ?
           ORDER BY template_key, version DESC LIMIT 200`,
        )
        .bind(input.tenantId)
    : db
        .prepare(
          `SELECT id, template_key, version, name, dsl_version, template_json,
                  paper_width_mm, status, created_at
           FROM price_label_templates WHERE tenant_id = ? AND status = 'ACTIVE'
           ORDER BY template_key, version DESC LIMIT 200`,
        )
        .bind(input.tenantId);
  return (await query.all<Record<string, unknown>>()).results;
}

function assertBatchInput(input: CreatePriceLabelBatchInput): void {
  assertExactInputKeys(input, [
    'tenantId',
    'branchId',
    'actorUserId',
    'terminalId',
    'templateId',
    'priceListId',
    'products',
    'idempotencyKey',
    'reprintOfBatchId',
  ]);
  if (
    !text(input.tenantId) ||
    !text(input.branchId) ||
    !text(input.actorUserId) ||
    !text(input.templateId) ||
    !text(input.idempotencyKey) ||
    input.idempotencyKey.length > 128 ||
    !Array.isArray(input.products) ||
    input.products.length < 1 ||
    input.products.length > MAX_PRODUCTS
  ) {
    throw new Error('PRICE_LABEL_REQUEST_INVALID');
  }
  let total = 0;
  const productIds = new Set<string>();
  const products = input.products as readonly PriceLabelBatchProduct[];
  for (const product of products) {
    assertExactInputKeys(product, ['productId', 'copies']);
    if (
      !text(product.productId) ||
      !Number.isSafeInteger(product.copies) ||
      product.copies < 1 ||
      product.copies > MAX_COPIES
    ) {
      throw new Error('PRICE_LABEL_REQUEST_INVALID');
    }
    if (productIds.has(product.productId)) throw new Error('PRICE_LABEL_REQUEST_INVALID');
    productIds.add(product.productId);
    total += product.copies;
  }
  if (total > MAX_ITEMS) throw new Error('PRICE_LABEL_REQUEST_INVALID');
}

function barcodeType(value: string): PriceLabelBarcodeType {
  if (/^\d{8}$/.test(value)) return 'EAN8';
  if (/^\d{13}$/.test(value)) return 'EAN13';
  return 'CODE128';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return bytesToHex(new Uint8Array(digest));
}

function selectedPriceListSql(): string {
  return `WITH selected AS (
    SELECT CASE
      WHEN ? != '' THEN ?
      WHEN b.price_list_id IS NOT NULL THEN b.price_list_id
      ELSE (SELECT id FROM price_lists
            WHERE tenant_id = ? AND is_default = 1 AND is_active = 1
              AND deleted_at IS NULL ORDER BY created_at DESC, id LIMIT 1)
    END AS id,
    CASE
      WHEN ? != '' THEN 'EXPLICIT'
      WHEN b.price_list_id IS NOT NULL THEN 'BRANCH_DEFAULT'
      ELSE 'TENANT_DEFAULT'
    END AS identity
    FROM branches b WHERE b.tenant_id = ? AND b.id = ?
  )`;
}

function selectedPriceListParams(input: CreatePriceLabelBatchInput): readonly unknown[] {
  const explicit = input.priceListId?.trim() ?? '';
  return [explicit, explicit, input.tenantId, explicit, input.tenantId, input.branchId];
}

async function loadBatch(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  selector: { readonly batchId?: string; readonly idempotencyKey?: string },
  onlyRetryable = false,
): Promise<PriceLabelBatchResult | null> {
  const batch = selector.batchId
    ? await db
        .prepare(
          `SELECT id, branch_id, template_id, price_list_id, price_list_identity,
                  reprint_of_batch_id, snapshot_hash, status
           FROM price_label_batches
           WHERE tenant_id = ? AND branch_id = ? AND id = ? LIMIT 1`,
        )
        .bind(tenantId, branchId, selector.batchId)
        .first<Record<string, unknown>>()
    : await db
        .prepare(
          `SELECT id, branch_id, template_id, price_list_id, price_list_identity,
                  reprint_of_batch_id, snapshot_hash, status
           FROM price_label_batches
           WHERE tenant_id = ? AND branch_id = ? AND idempotency_key = ? LIMIT 1`,
        )
        .bind(tenantId, branchId, selector.idempotencyKey ?? '')
        .first<Record<string, unknown>>();
  if (!batch) return null;
  const suffix = onlyRetryable ? ` AND status != 'ACKED'` : '';
  const rows = await db
    .prepare(
      `SELECT id, product_id, ordinal, product_name_snapshot, price_cents,
              barcode_type, barcode_value_snapshot, template_version, price_source,
              price_resolved_at, price_resolution_version, rendered_payload_hash,
              rendered_payload_hex, status
       FROM price_label_items
       WHERE tenant_id = ? AND batch_id = ?${suffix} ORDER BY ordinal LIMIT ${MAX_ITEMS}`,
    )
    .bind(tenantId, batch.id)
    .all<Record<string, unknown>>();
  return {
    batchId: String(batch.id),
    branchId: String(batch.branch_id),
    templateId: String(batch.template_id),
    priceListId: String(batch.price_list_id),
    priceListIdentity: String(
      batch.price_list_identity,
    ) as PriceLabelBatchResult['priceListIdentity'],
    reprintOfBatchId:
      typeof batch.reprint_of_batch_id === 'string' ? batch.reprint_of_batch_id : null,
    snapshotHash: String(batch.snapshot_hash),
    status: String(batch.status) as PriceLabelBatchResult['status'],
    items: rows.results.map((row) => ({
      itemId: String(row.id),
      productId: String(row.product_id),
      ordinal: Number(row.ordinal),
      productName: String(row.product_name_snapshot),
      priceCents: row.price_cents as number,
      barcodeType: String(row.barcode_type) as PriceLabelBarcodeType,
      barcodeValue: String(row.barcode_value_snapshot),
      templateVersion: Number(row.template_version),
      priceSource: String(row.price_source) as PriceLabelBatchItemResult['priceSource'],
      resolvedAt: String(row.price_resolved_at),
      resolutionVersion: String(row.price_resolution_version),
      renderedPayloadHash: String(row.rendered_payload_hash),
      renderedPayloadHex: String(row.rendered_payload_hex),
      status: String(row.status) as PriceLabelBatchItemResult['status'],
    })),
  };
}

// eslint-disable-next-line complexity -- fail-closed preflight enumerates every authority boundary
export async function createPriceLabelBatchAtomic(
  db: D1DatabaseLike,
  input: CreatePriceLabelBatchInput,
): Promise<PriceLabelBatchResult> {
  assertBatchInput(input);
  const uniqueProductIds = [...new Set(input.products.map((product) => product.productId))];
  const placeholders = uniqueProductIds.map(() => '?').join(',');
  const listCte = selectedPriceListSql();
  const preflightResults = await db.batch([
    db
      .prepare(
        `SELECT b.id AS branch_id, b.price_list_id AS branch_price_list_id,
                EXISTS(
                  SELECT 1 FROM users u
                  WHERE u.tenant_id = b.tenant_id AND u.id = ? AND u.branch_id = b.id
                    AND u.is_active = 1 AND u.deleted_at IS NULL
                ) AS actor_ok
         FROM branches b WHERE b.tenant_id = ? AND b.id = ? LIMIT 1`,
      )
      .bind(input.actorUserId, input.tenantId, input.branchId),
    db
      .prepare(
        `SELECT t.id, t.template_key, t.version, t.template_json, t.paper_width_mm, t.status,
                (SELECT MAX(latest.version) FROM price_label_templates latest
                 WHERE latest.tenant_id = t.tenant_id
                   AND latest.template_key = t.template_key) AS latest_version
         FROM price_label_templates t WHERE t.tenant_id = ? AND t.id = ? LIMIT 1`,
      )
      .bind(input.tenantId, input.templateId),
    db
      .prepare(
        `${listCte}
         SELECT pl.id, selected.identity FROM selected
         INNER JOIN price_lists pl ON pl.id = selected.id AND pl.tenant_id = ?
         WHERE pl.is_active = 1 AND pl.deleted_at IS NULL LIMIT 1`,
      )
      .bind(...selectedPriceListParams(input), input.tenantId),
    db
      .prepare(
        `${listCte}
         SELECT p.id, p.name, p.barcode, p.version AS product_version,
                p.price_cents AS base_price_cents, pp.price_cents AS list_price_cents,
                pp.rowid AS price_rowid
         FROM products p CROSS JOIN selected
         LEFT JOIN product_prices pp
           ON pp.tenant_id = p.tenant_id AND pp.product_id = p.id
          AND pp.price_list_id = selected.id
         WHERE p.tenant_id = ? AND p.id IN (${placeholders})
           AND p.is_active = 1 AND p.deleted_at IS NULL`,
      )
      .bind(...selectedPriceListParams(input), input.tenantId, ...uniqueProductIds),
    db
      .prepare(
        `SELECT id FROM price_label_batches
         WHERE tenant_id = ? AND branch_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(input.tenantId, input.branchId, input.idempotencyKey),
  ]);
  if (preflightResults.length !== 5) throw new Error('PRICE_LABEL_PREFLIGHT_FAILED');
  const scopeResult = preflightResults[0]!;
  const templateResult = preflightResults[1]!;
  const listResult = preflightResults[2]!;
  const productsResult = preflightResults[3]!;
  const existingResult = preflightResults[4]!;
  const existing = existingResult.results[0] as { id?: string } | undefined;
  if (existing?.id) {
    const prior = await loadBatch(db, input.tenantId, input.branchId, { batchId: existing.id });
    if (!prior) throw new Error('PRICE_LABEL_IDEMPOTENCY_INCONSISTENT');
    return prior;
  }
  const scope = scopeResult.results[0] as ScopeRow | undefined;
  const template = templateResult.results[0] as TemplateRow | undefined;
  const list = listResult.results[0] as PriceListRow | undefined;
  const productRows = productsResult.results as unknown as readonly ProductRow[];
  if (
    !scope ||
    scope.actor_ok !== 1 ||
    !template ||
    template.status !== 'ACTIVE' ||
    template.version !== template.latest_version ||
    !list ||
    productRows.length !== uniqueProductIds.length
  ) {
    throw new Error(SAFE_ERROR);
  }
  if (input.reprintOfBatchId) {
    const original = await loadBatch(db, input.tenantId, input.branchId, {
      batchId: input.reprintOfBatchId,
    });
    if (!original) throw new Error(SAFE_ERROR);
  }
  const templateValue = validatePriceLabelTemplate(JSON.parse(template.template_json));
  const byId = new Map(productRows.map((product) => [product.id, product]));
  const resolvedAt = new Date().toISOString();
  const expanded = input.products.flatMap((requested) =>
    Array.from({ length: requested.copies }, () => byId.get(requested.productId)!),
  );
  const items: PriceLabelBatchItemResult[] = [];
  for (const [ordinal, product] of expanded.entries()) {
    if (!product?.barcode) throw new Error('PRICE_LABEL_BARCODE_INVALID');
    const kind = barcodeType(product.barcode);
    try {
      encodePriceLabelBarcode(kind, product.barcode);
    } catch {
      throw new Error('PRICE_LABEL_BARCODE_INVALID');
    }
    const priceCents = product.list_price_cents ?? product.base_price_cents;
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
      throw new Error('PRICE_LABEL_PRICE_INVALID');
    }
    const snapshot: PriceLabelSnapshot = {
      productId: product.id,
      productName: product.name,
      priceCents,
      barcodeType: kind,
      barcodeValue: product.barcode,
      templateVersion: template.version,
    };
    const payload = compilePriceLabelTemplate(templateValue, snapshot, template.paper_width_mm);
    items.push({
      itemId: crypto.randomUUID(),
      productId: product.id,
      ordinal,
      productName: product.name,
      priceCents,
      barcodeType: kind,
      barcodeValue: product.barcode,
      templateVersion: template.version,
      priceSource: product.list_price_cents === null ? 'PRODUCT_DEFAULT' : 'PRICE_LIST',
      resolvedAt,
      resolutionVersion: `${product.product_version}:${product.price_rowid ?? 0}:${template.version}`,
      renderedPayloadHash: await hashPriceLabelPayload(payload),
      renderedPayloadHex: bytesToHex(payload),
      status: 'PENDING',
    });
  }
  const snapshotHash = await sha256Json(
    items.map((item) => ({
      productId: item.productId,
      ordinal: item.ordinal,
      productName: item.productName,
      priceCents: item.priceCents,
      barcodeType: item.barcodeType,
      barcodeValue: item.barcodeValue,
      templateVersion: item.templateVersion,
      priceListId: list.id,
      priceSource: item.priceSource,
      resolvedAt: item.resolvedAt,
      resolutionVersion: item.resolutionVersion,
      renderedPayloadHash: item.renderedPayloadHash,
    })),
  );
  const batchId = crypto.randomUUID();
  const previousAudit = input.reprintOfBatchId
    ? await db
        .prepare(
          `SELECT row_hash FROM audit_events
           WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1`,
        )
        .bind(input.tenantId)
        .first<{ row_hash: string }>()
    : null;
  const auditPayload = input.reprintOfBatchId
    ? { originalBatchId: input.reprintOfBatchId, batchId, snapshotHash }
    : null;
  const auditHash = auditPayload
    ? await sha256Json({
        action: 'PRICE_LABEL_REPRINT',
        entityType: 'price_label_batch',
        entityId: batchId,
        payload: auditPayload,
        previousHash: previousAudit?.row_hash ?? null,
      })
    : null;
  try {
    await runD1AtomicPlan(db, (plan) => {
      const expected = productRows.map((product) => ({
        id: product.id,
        version: product.product_version,
        price: product.list_price_cents,
      }));
      plan.guardState(
        `SELECT 1
         WHERE EXISTS (
           SELECT 1 FROM branches b
           WHERE b.tenant_id = ? AND b.id = ?
             AND COALESCE(b.price_list_id, '') = COALESCE(?, '')
         )
         AND EXISTS (
           SELECT 1 FROM price_label_templates t
           WHERE t.tenant_id = ? AND t.id = ? AND t.status = 'ACTIVE' AND t.version = ?
             AND t.version = (SELECT MAX(v.version) FROM price_label_templates v
                              WHERE v.tenant_id = t.tenant_id
                                AND v.template_key = t.template_key)
         )
         AND NOT EXISTS (
           SELECT 1 FROM json_each(?) expected
           LEFT JOIN products p ON p.tenant_id = ? AND p.id = json_extract(expected.value, '$.id')
             AND p.version = json_extract(expected.value, '$.version')
             AND p.is_active = 1 AND p.deleted_at IS NULL
           LEFT JOIN product_prices pp ON pp.tenant_id = p.tenant_id AND pp.product_id = p.id
             AND pp.price_list_id = ?
           WHERE p.id IS NULL
              OR COALESCE(pp.price_cents, -1) != COALESCE(json_extract(expected.value, '$.price'), -1)
         )`,
        [
          input.tenantId,
          input.branchId,
          scope.branch_price_list_id,
          input.tenantId,
          template.id,
          template.version,
          JSON.stringify(expected),
          input.tenantId,
          list.id,
        ],
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO price_label_batches (
               id, tenant_id, branch_id, terminal_id, template_id, price_list_id,
               price_list_identity, reprint_of_batch_id, idempotency_key, snapshot_hash,
               status, requested_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          )
          .bind(
            batchId,
            input.tenantId,
            input.branchId,
            input.terminalId ?? null,
            template.id,
            list.id,
            list.identity,
            input.reprintOfBatchId ?? null,
            input.idempotencyKey,
            snapshotHash,
            input.actorUserId,
          ),
      );
      for (const item of items) {
        plan.add(
          db
            .prepare(
              `INSERT INTO price_label_items (
                 id, tenant_id, batch_id, product_id, ordinal, product_name_snapshot,
                 price_cents, barcode_type, barcode_value_snapshot, template_version,
                 effective_price_list_id, price_source, price_resolved_at,
                 price_resolution_version, rendered_payload_hash, rendered_payload_hex
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              item.itemId,
              input.tenantId,
              batchId,
              item.productId,
              item.ordinal,
              item.productName,
              item.priceCents,
              item.barcodeType,
              item.barcodeValue,
              item.templateVersion,
              list.id,
              item.priceSource,
              item.resolvedAt,
              item.resolutionVersion,
              item.renderedPayloadHash,
              item.renderedPayloadHex,
            ),
        );
      }
      if (auditPayload && auditHash) {
        const auditGuardId = crypto.randomUUID();
        plan.add(
          db
            .prepare(
              `INSERT INTO atomic_guards (id, ok)
               SELECT ?, CASE WHEN COALESCE((
                 SELECT row_hash FROM audit_events WHERE tenant_id = ?
                 ORDER BY rowid DESC LIMIT 1
               ), '') = COALESCE(?, '') THEN 1 ELSE 0 END`,
            )
            .bind(auditGuardId, input.tenantId, previousAudit?.row_hash ?? null),
        );
        plan.add(
          db
            .prepare(
              `INSERT INTO audit_events (
                 id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, ?, 'PRICE_LABEL_REPRINT', 'price_label_batch', ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              input.tenantId,
              input.branchId,
              input.actorUserId,
              batchId,
              JSON.stringify(auditPayload),
              previousAudit?.row_hash ?? null,
              auditHash,
            ),
        );
        plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(auditGuardId));
      }
    });
  } catch (error) {
    const raced = await loadBatch(db, input.tenantId, input.branchId, {
      idempotencyKey: input.idempotencyKey,
    });
    if (raced) return raced;
    throw error;
  }
  return {
    batchId,
    branchId: input.branchId,
    templateId: template.id,
    priceListId: list.id,
    priceListIdentity: list.identity,
    reprintOfBatchId: input.reprintOfBatchId ?? null,
    snapshotHash,
    status: 'PENDING',
    items,
  };
}

export async function retryPriceLabelBatch(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly branchId: string; readonly batchId: string },
): Promise<PriceLabelBatchResult> {
  const batch = await loadBatch(
    db,
    input.tenantId,
    input.branchId,
    { batchId: input.batchId },
    true,
  );
  if (!batch) throw new Error('PRICE_LABEL_BATCH_NOT_FOUND');
  return batch;
}

export async function reprintPriceLabelBatchAtomic(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly branchId: string;
    readonly actorUserId: string;
    readonly terminalId?: string;
    readonly batchId: string;
    readonly idempotencyKey: string;
  },
): Promise<PriceLabelBatchResult> {
  assertExactInputKeys(input, [
    'tenantId',
    'branchId',
    'actorUserId',
    'terminalId',
    'batchId',
    'idempotencyKey',
  ]);
  const original = await loadBatch(db, input.tenantId, input.branchId, { batchId: input.batchId });
  if (!original) throw new Error(SAFE_ERROR);
  const copies = new Map<string, number>();
  for (const item of original.items)
    copies.set(item.productId, (copies.get(item.productId) ?? 0) + 1);
  return createPriceLabelBatchAtomic(db, {
    tenantId: input.tenantId,
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    ...(input.terminalId ? { terminalId: input.terminalId } : {}),
    templateId: original.templateId,
    priceListId: original.priceListId,
    products: [...copies].map(([productId, count]) => ({ productId, copies: count })),
    idempotencyKey: input.idempotencyKey,
    reprintOfBatchId: original.batchId,
  });
}

export async function acknowledgePriceLabelItems(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly branchId: string;
    readonly batchId: string;
    readonly acknowledgements: readonly {
      readonly itemId: string;
      readonly status: 'ACKED' | 'FAILED';
      readonly errorCode?: string;
    }[];
  },
): Promise<{
  readonly batchStatus: PriceLabelBatchResult['status'];
  readonly retryItemIds: readonly string[];
}> {
  if (
    !input.tenantId ||
    !input.branchId ||
    !input.batchId ||
    !Array.isArray(input.acknowledgements) ||
    input.acknowledgements.length < 1 ||
    input.acknowledgements.length > MAX_ITEMS
  ) {
    throw new Error('PRICE_LABEL_ACK_INVALID');
  }
  const acknowledgements = input.acknowledgements as readonly {
    readonly itemId: string;
    readonly status: 'ACKED' | 'FAILED';
    readonly errorCode?: string;
  }[];
  const ids = new Set<string>();
  for (const ack of acknowledgements) {
    if (
      !ack.itemId ||
      ids.has(ack.itemId) ||
      !['ACKED', 'FAILED'].includes(ack.status) ||
      (ack.errorCode !== undefined && !/^[A-Z0-9_]{1,64}$/.test(ack.errorCode))
    ) {
      throw new Error('PRICE_LABEL_ACK_INVALID');
    }
    ids.add(ack.itemId);
  }
  const placeholders = input.acknowledgements.map(() => '?').join(',');
  const owned = await db
    .prepare(
      `SELECT i.id FROM price_label_items i
       INNER JOIN price_label_batches b
         ON b.tenant_id = i.tenant_id AND b.id = i.batch_id
       WHERE i.tenant_id = ? AND i.batch_id = ? AND b.branch_id = ?
         AND i.id IN (${placeholders})`,
    )
    .bind(
      input.tenantId,
      input.batchId,
      input.branchId,
      ...acknowledgements.map((ack) => ack.itemId),
    )
    .all<{ id: string }>();
  if (owned.results.length !== acknowledgements.length) throw new Error(SAFE_ERROR);
  await runD1AtomicPlan(db, (plan) => {
    for (const ack of acknowledgements) {
      plan.add(
        db
          .prepare(
            `UPDATE price_label_items
             SET status = ?, attempt_count = attempt_count + 1,
                 acknowledged_at = CASE WHEN ? = 'ACKED' THEN CURRENT_TIMESTAMP ELSE NULL END,
                 last_error_code = CASE WHEN ? = 'FAILED' THEN ? ELSE NULL END
             WHERE tenant_id = ? AND batch_id = ? AND id = ? AND status != 'ACKED'`,
          )
          .bind(
            ack.status,
            ack.status,
            ack.status,
            ack.errorCode ?? 'PRINT_FAILED',
            input.tenantId,
            input.batchId,
            ack.itemId,
          ),
      );
    }
    plan.add(
      db
        .prepare(
          `UPDATE price_label_batches
           SET status = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status != 'ACKED'
             ) THEN 'ACKED'
             WHEN NOT EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status != 'FAILED'
             ) THEN 'FAILED'
             WHEN EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status = 'ACKED'
             ) OR EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status = 'FAILED'
             ) THEN 'PARTIAL'
             ELSE 'PRINTING'
           END,
           completed_at = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status != 'ACKED'
             ) OR NOT EXISTS (
               SELECT 1 FROM price_label_items i
               WHERE i.tenant_id = price_label_batches.tenant_id
                 AND i.batch_id = price_label_batches.id AND i.status != 'FAILED'
             ) THEN CURRENT_TIMESTAMP ELSE NULL END
           WHERE tenant_id = ? AND branch_id = ? AND id = ?`,
        )
        .bind(input.tenantId, input.branchId, input.batchId),
    );
  });
  const status = await db
    .prepare(
      `SELECT status FROM price_label_batches
       WHERE tenant_id = ? AND branch_id = ? AND id = ?`,
    )
    .bind(input.tenantId, input.branchId, input.batchId)
    .first<{ status: PriceLabelBatchResult['status'] }>();
  const retry = await db
    .prepare(
      `SELECT id FROM price_label_items
       WHERE tenant_id = ? AND batch_id = ? AND status != 'ACKED' ORDER BY ordinal LIMIT ${MAX_ITEMS}`,
    )
    .bind(input.tenantId, input.batchId)
    .all<{ id: string }>();
  if (!status) throw new Error(SAFE_ERROR);
  return { batchStatus: status.status, retryItemIds: retry.results.map((row) => row.id) };
}
